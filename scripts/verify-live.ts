import { parseArgs } from 'node:util';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import WebSocket from 'ws';
import BilibiliSocket from '../src/bilibiliSocket';
import DouYinSocket from '../src/douyinSocket';
import datapipe from '../src/datapipe';
import { getbilibiliroomid } from '../src/axiosManage';
import { parseRoomId } from '../src/config';

async function main() {
    const { values } = parseArgs({ options: {
        bili: { type: 'string' }, douyin: { type: 'string' },
        seconds: { type: 'string', default: '45' }, output: { type: 'string' },
    } });
    const seconds = Number(values.seconds);
    if (!Number.isFinite(seconds) || seconds < 35 || seconds > 300) throw new Error('--seconds 必须为 35–300，以覆盖至少一次 B站心跳');
    if (!values.bili || !values.douyin) throw new Error('请通过 --bili 和 --douyin 指定正在直播的房间');
    const biliRoom = parseRoomId(values.bili, 'bilibili');
    const resolved = await getbilibiliroomid(biliRoom);
    if (resolved?.data?.live_status !== 1) throw new Error(`B站样本房间 ${biliRoom} 当前未开播，请指定正在直播的房间`);
    const bili = new BilibiliSocket(resolved.data.room_id);
    const douyin = new DouYinSocket(parseRoomId(values.douyin!, 'douyin'));
    const pipe = new datapipe(0);
    let client: WebSocket | undefined;
    const upstream: Record<string, number> = {};
    const forwarded: Record<string, number> = {};
    const errors: string[] = [];
    let authenticated = false;
    let webSocketChats = 0;
    const recordError = (error: any) => { if (errors.length < 10) errors.push(String(error.message || error)); };
    pipe.onError = recordError;
    bili.onError = recordError;
    douyin.onError = recordError;
    try {
        await once(pipe.ws, 'listening');
        const address = pipe.ws.address();
        if (!address || typeof address === 'string') throw new Error('转发端口未就绪');
        client = new WebSocket(`ws://127.0.0.1:${address.port}`);
        client.on('message', (data) => { const msg = JSON.parse(data.toString()); forwarded[msg.cmd] = (forwarded[msg.cmd] || 0) + 1; });
        client.on('error', recordError);
        await once(client, 'open');
        bili.onOpen = () => { authenticated = true; console.log('B站认证通过'); };
        douyin.onOpen = (info) => console.log('抖音收到协议消息：', info.endpoint);
        bili.onMessage = (data) => {
            const cmd = String(data.cmd || '').split(':')[0];
            upstream[cmd] = (upstream[cmd] || 0) + 1;
            pipe.bilibilidanmaku(data);
        };
        douyin.onMessage = (data) => {
            upstream[data.cmd] = (upstream[data.cmd] || 0) + 1;
            if (data.cmd === 'WebcastChatMessage' && douyin.endpoint.startsWith('wss://')) webSocketChats++;
            pipe.douyindanmaku(data);
        };
        console.log(`验证 B站 ${bili.roomid} / 抖音 ${douyin.roomid}，持续 ${seconds} 秒`);
        bili.connect();
        void douyin.connect().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        // Give the local client time to consume the final queued packets.
        await new Promise((resolve) => setTimeout(resolve, 100));
        const passed = authenticated && bili.heartbeatReplies > 0 && (upstream.DANMU_MSG || 0) > 0 &&
            douyin.stats.webSocketFrames > 0 && webSocketChats > 0 &&
            (forwarded.BiliBili_DANMU_MSG || 0) > 0 && (forwarded.DouYin_DANMU_MSG || 0) > 0 && errors.length === 0;
        const result = {
            checkedAt: new Date().toISOString(), durationSeconds: seconds, passed,
            bilibili: { roomid: String(bili.roomid), authenticated, endpoint: bili.endpoint, heartbeatReplies: bili.heartbeatReplies },
            douyin: { webRid: String(douyin.roomid), endpoint: douyin.endpoint, ...douyin.stats, webSocketChats },
            upstream, forwarded, errors,
        };
        console.log(JSON.stringify(result, null, 2));
        if (values.output) await writeFile(values.output, JSON.stringify(result, null, 2) + '\n', 'utf8');
        if (!passed) process.exitCode = 1;
    } finally {
        bili.close();
        await douyin.close();
        client?.terminate();
        await pipe.close();
    }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
