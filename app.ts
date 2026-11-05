import { createInterface } from 'node:readline/promises';
import { once } from 'node:events';
import datapipe from './src/datapipe';
import BilibiliSocket from './src/bilibiliSocket';
import DouYinSocket from './src/douyinSocket';
import SQLManage from './src/sqlManage';
import { getbilibiliroomid } from './src/axiosManage';
import { parseRoomId, parsePort } from './src/config';

async function main() {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const setting = async (name: string, prompt: string, fallback: string) =>
        process.env[name] ?? (process.stdin.isTTY ? (await rl.question(`${prompt}（${fallback}）：`)).trim() || fallback : fallback);
    let port: number;
    let biliRoom: string;
    let douyinRoom: string;
    try {
        port = parsePort(await setting('PORT', '转发端口', '888'));
        biliRoom = parseRoomId(await setting('BILIBILI_ROOM_ID', 'B站房间，0 关闭', '0'), 'bilibili');
        douyinRoom = parseRoomId(await setting('DOUYIN_ROOM_ID', '抖音房间，0 关闭', '0'), 'douyin');
    } finally { rl.close(); }

    const pipe = new datapipe(port);
    pipe.onError = (error) => console.error('转发服务：', error.message);
    await once(pipe.ws, 'listening');
    console.log(`转发服务 ws://127.0.0.1:${port}`);

    let bili: BilibiliSocket | undefined;
    let douyin: DouYinSocket | undefined;
    const sql = process.env.MYSQL_ENABLED === '1' ? new SQLManage(
        process.env.MYSQL_HOST || 'localhost', process.env.MYSQL_USER || 'root',
        process.env.MYSQL_PASSWORD || '', process.env.MYSQL_DATABASE || 'bilibilitopdown',
    ).connect() : undefined;

    pipe.onMessage = async (data) => {
        if (data.cmd !== 'BiliBili_GetBilibiliUidForUser' && data.cmd !== 'BiliBili_SEND_GIFT') return;
        if (!sql) { pipe.pub({ cmd: 'ERROR', text: '数据库功能未启用' }); return; }
        if (data.cmd === 'BiliBili_GetBilibiliUidForUser') {
            const uid = String(data.text || '');
            if (!/^\d+$/.test(uid)) throw new Error('无效的 B站 UID');
            const rows = await sql.query('select * from user where bilibiliUid = ?', [uid]);
            pipe.pub({ cmd: data.cmd, text: rows.length !== 0, uid: data.text });
        } else if (data.data?.giftName === '粉丝团灯牌') {
            const uid = String(data.data.uid || '');
            if (!/^\d+$/.test(uid)) throw new Error('无效的 B站 UID');
            const rows = await sql.query('select * from user where bilibiliUid = ?', [uid]);
            if (rows.length === 0) await sql.query(
                'insert into user (phone,bilibiliUid,douyinUid,wechatOpenid,qq,money,isBlockade,isDelete) values(null,?,null,null,null,0,0,0)', [uid],
            );
        }
    };

    let closing = false;
    const shutdown = async () => {
        if (closing) return;
        closing = true;
        bili?.close();
        await Promise.allSettled([douyin?.close(), pipe.close(), sql?.close()]);
    };
    process.once('SIGINT', () => void shutdown());
    process.once('SIGTERM', () => void shutdown());

    if (biliRoom !== '0') {
        const response = await getbilibiliroomid(biliRoom);
        if (closing) return;
        if (!response?.data?.room_id) console.error('B站房间解析失败，请检查地址和网络');
        else {
            bili = new BilibiliSocket(response.data.room_id);
            bili.onOpen = () => console.log(`B站已连接 ${bili!.roomid}`);
            bili.onClose = () => console.log('B站连接断开，等待重连');
            bili.onError = (error) => console.error('B站：', error.message);
            bili.onMessage = pipe.bilibilidanmaku;
            bili.connect();
        }
    }
    if (douyinRoom !== '0' && !closing) {
        douyin = new DouYinSocket(douyinRoom);
        douyin.onOpen = () => console.log(`抖音已连接 ${douyinRoom}`);
        douyin.onClose = () => console.log('抖音连接断开，等待重连');
        douyin.onError = (error) => console.error('抖音：', error.message);
        douyin.onMessage = pipe.douyindanmaku;
        void douyin.connect().catch(() => {});
    }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
