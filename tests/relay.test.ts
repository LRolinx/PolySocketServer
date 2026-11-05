import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import WebSocket from 'ws';
import datapipe from '../src/datapipe';

test('两端弹幕广播给所有客户端，错误 JSON 不会中断服务', { timeout: 10000 }, async (t) => {
    const pipe = new datapipe(0);
    await once(pipe.ws, 'listening');
    const address = pipe.ws.address();
    assert.ok(address && typeof address !== 'string');
    const clients = [new WebSocket(`ws://127.0.0.1:${address.port}`), new WebSocket(`ws://127.0.0.1:${address.port}`)];
    t.after(async () => { clients.forEach((c) => c.terminate()); await pipe.close(); });
    await Promise.all(clients.map((c) => once(c, 'open')));
    let commands = 0;
    pipe.onMessage = () => { commands++; pipe.pub({ cmd: 'OK' }); };
    const receiveAll = () => Promise.all(clients.map(async (c) => JSON.parse((await once(c, 'message'))[0].toString())));
    let received = receiveAll();
    pipe.bilibilidanmaku({ cmd: 'DANMU_MSG', info: [[], 'B站内容', [1, '观众']] });
    assert.deepEqual((await received).map((m) => m.cmd), ['BiliBili_DANMU_MSG', 'BiliBili_DANMU_MSG']);
    received = receiveAll();
    pipe.douyindanmaku({ cmd: 'WebcastChatMessage', id: '1', uid: '9007199254740993', roomid: '2', name: '观众', text: '抖音内容' });
    assert.deepEqual((await received).map((m) => m.text), ['抖音内容', '抖音内容']);
    assert.equal(commands, 0, '上游消息不应触发客户端命令回调');
    const errorReply = once(clients[0], 'message');
    clients[0].send('not json');
    assert.equal(JSON.parse((await errorReply)[0].toString()).cmd, 'ERROR');
    received = receiveAll();
    clients[0].send('{"cmd":"PING"}');
    assert.deepEqual((await received).map((m) => m.cmd), ['OK', 'OK']);
    assert.equal(commands, 1);
});

test('应用可在无 MySQL、两端关闭时通过环境变量启动并处理命令', { timeout: 15000 }, async (t) => {
    const reservation = createServer().listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const address = reservation.address();
    assert.ok(address && typeof address !== 'string');
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const child = spawn(process.execPath, ['--env-file-if-exists=.env', '--import', 'tsx', 'app.ts'], {
        cwd: process.cwd(), env: { ...process.env, PORT: String(address.port), BILIBILI_ROOM_ID: '0', DOUYIN_ROOM_ID: '0', MYSQL_ENABLED: '0' },
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let client: WebSocket | undefined;
    t.after(async () => {
        client?.terminate();
        if (child.exitCode === null) { const closed = once(child, 'close'); child.kill(); await closed; }
    });
    await new Promise<void>((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => reject(new Error('应用启动超时')), 8000);
        child.stdout.on('data', (data) => {
            output += data;
            if (output.includes('转发服务 ws://')) { clearTimeout(timeout); resolve(); }
        });
        child.once('error', (error) => { clearTimeout(timeout); reject(error); });
        child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`应用提前退出 ${code}`)); });
    });
    client = new WebSocket(`ws://127.0.0.1:${address.port}`);
    await once(client, 'open');
    const reply = once(client, 'message');
    client.send('{"cmd":"BiliBili_GetBilibiliUidForUser","text":"1"}');
    assert.equal(JSON.parse((await reply)[0].toString()).text, '数据库功能未启用');
});
