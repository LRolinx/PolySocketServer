import test from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { decode, getCertification } from '../src/tools';
import { decodeDouyinFrame, decodeDouyinResponse } from '../src/douyinProtocol';
import { normalizeBilibiliEvent } from '../src/bilibiliProtocol';
import { mapBilibiliMessage, mapDouyinMessage } from '../src/datapipe';
import { parseRoomId, parsePort } from '../src/config';

function packet(body: Buffer, version = 0, op = 5): Buffer {
    const header = Buffer.alloc(16);
    header.writeUInt32BE(16 + body.length, 0); header.writeUInt16BE(16, 4);
    header.writeUInt16BE(version, 6); header.writeUInt32BE(op, 8); header.writeUInt32BE(1, 12);
    return Buffer.concat([header, body]);
}

// Independent wire encoding keeps fixtures separate from the production schemas.
function varint(input: bigint | number): Buffer {
    let value = BigInt(input); const bytes = [];
    while (value > 127n) { bytes.push(Number(value & 127n) | 128); value >>= 7n; }
    bytes.push(Number(value)); return Buffer.from(bytes);
}
function uint(field: number, value: bigint | number): Buffer { return Buffer.concat([varint(field * 8), varint(value)]); }
function bytes(field: number, value: string | Buffer): Buffer {
    const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return Buffer.concat([varint(field * 8 + 2), varint(body.length), body]);
}
const uid = 9876543210123456789n;
const user = Buffer.concat([uint(1, uid), bytes(3, '测试观众😀')]);
const common = Buffer.concat([uint(2, 123n), uint(3, 7623456789012345678n)]);
const chat = Buffer.concat([bytes(1, common), bytes(2, user), bytes(3, '你好，直播间')]);
function response(method: string, payload: Buffer): Buffer {
    return bytes(1, Buffer.concat([bytes(1, method), bytes(2, payload), uint(3, 998877665544332211n)]));
}

test('B站认证包使用完整 UTF-8 和大端包头', () => {
    const json = JSON.stringify({ key: '中文😀', roomid: 1 });
    const data = getCertification(json);
    assert.equal(data.readUInt32BE(0), data.length);
    assert.equal(data.readUInt32BE(8), 7);
    assert.equal(data.subarray(16).toString(), json);
});

test('B站可连续解析认证回应和多个普通消息包', () => {
    const output: any[] = [];
    const input = Buffer.concat([packet(Buffer.from('{"code":0}'), 1, 8), packet(Buffer.from('{"cmd":"A"}')), packet(Buffer.from('{"cmd":"B"}'))]);
    decode(input, (p) => output.push(p));
    assert.equal(output[0].body.code, 0);
    assert.deepEqual(output.slice(1).map((p) => p.body[0].cmd), ['A', 'B']);
});

for (const [version, compress] of [[2, deflateSync], [3, brotliCompressSync]] as const) {
    test(`B站 v${version} 解压后递归解析每个内层包`, () => {
        const nested = Buffer.concat([packet(Buffer.from('{"cmd":"DANMU_MSG"}')), packet(Buffer.from('{"cmd":"SEND_GIFT"}'))]);
        const output: any[] = [];
        decode(packet(compress(nested), version), (p) => output.push(p));
        assert.deepEqual(output.map((p) => p.body[0].cmd), ['DANMU_MSG', 'SEND_GIFT']);
    });
}

test('B站截断/零长度包不会死循环，压缩损坏明确报错', () => {
    const output: any[] = [];
    decode(Buffer.alloc(16), (p) => output.push(p));
    decode(packet(Buffer.from('{}')).subarray(0, 17), (p) => output.push(p));
    assert.equal(output.length, 0);
    assert.throws(() => decode(packet(Buffer.from('invalid'), 3), () => {}));
});

test('抖音 HTTP Response 保留 64 位 ID 和中文表情', () => {
    const [message] = decodeDouyinResponse(response('WebcastChatMessage', chat));
    assert.equal(message.uid, uid.toString());
    assert.equal(message.roomid, '7623456789012345678');
    assert.equal(message.id, '998877665544332211');
    assert.equal(message.name, '测试观众😀');
    assert.equal(message.text, '你好，直播间');
});

for (const compressed of [false, true]) {
    test(`抖音 WebSocket ${compressed ? 'gzip' : '原始'} 帧可解码`, () => {
        const payload = response('WebcastChatMessage', chat);
        const frame = Buffer.concat([bytes(7, 'msg'), bytes(8, compressed ? gzipSync(payload) : payload)]);
        assert.equal(decodeDouyinFrame(frame)[0].text, '你好，直播间');
    });
}

test('抖音 ACK 和未知消息不会伪造评论，损坏 gzip 抛出错误', () => {
    assert.deepEqual(decodeDouyinFrame(bytes(7, 'ack')), []);
    assert.deepEqual(decodeDouyinResponse(response('WebcastUnknownMessage', Buffer.from([1]))), []);
    assert.throws(() => decodeDouyinFrame(Buffer.concat([bytes(6, 'gzip'), bytes(7, 'msg'), bytes(8, 'broken')])));
});

test('抖音礼物保留连击累计数量、分组和结束标记', () => {
    const gift = Buffer.concat([uint(5, 3), bytes(7, user), uint(9, 1), uint(11, 987), bytes(15,
        Buffer.concat([uint(5, 42), uint(10, 1), uint(12, 9), bytes(16, '测试礼物')]))]);
    const [message] = decodeDouyinResponse(response('WebcastGiftMessage', gift));
    assert.equal(message.num, 3); assert.equal(message.giftId, '42'); assert.equal(message.giftName, '测试礼物');
    assert.equal(message.groupId, '987'); assert.equal(message.price, 9); assert.equal(message.repeatEnd, true);
    assert.equal(mapDouyinMessage(message)?.cmd, 'DouYin_SEND_GIFT');
});

test('B站 protobuf 礼物批次逐项保留，不丢失第二件礼物', () => {
    const item = (id: number, name: string) => bytes(10, Buffer.concat([uint(1, id), bytes(2, name), uint(3, 2), uint(5, 100)]));
    const pb = Buffer.concat([uint(1, uid), bytes(2, '观众'), item(1, '礼物一'), item(2, '礼物二')]);
    const result = normalizeBilibiliEvent({ cmd: 'SEND_GIFT_V2', data: { pb: pb.toString('base64') } }).map(mapBilibiliMessage);
    assert.deepEqual(result.map((m) => m?.giftName), ['礼物一', '礼物二']);
    assert.equal(result[0]?.uid, uid.toString()); assert.equal(result[0]?.num, 2);
});

test('B站 protobuf 进房可提取用户，缺少 pb 时不伪造事件', () => {
    const pb = Buffer.concat([uint(1, uid), bytes(2, '观众'), uint(5, 1)]);
    const result = normalizeBilibiliEvent({ cmd: 'INTERACT_WORD_V2', data: { pb: pb.toString('base64') } });
    assert.equal(result[0].data.uname, '观众');
    assert.deepEqual(normalizeBilibiliEvent({ cmd: 'INTERACT_WORD_V2', data: {} }), []);
});

test('B站命令后缀与超级留言保持既有转发格式', () => {
    const message = mapBilibiliMessage({ cmd: 'DANMU_MSG:4:0:2', info: [[], '你好', [123, '昵称']] });
    assert.deepEqual(message, { cmd: 'BiliBili_DANMU_MSG', text: '你好', uid: 123, name: '昵称' });
    assert.equal(mapBilibiliMessage({ cmd: 'SUPER_CHAT_MESSAGE', data: { message: '留言', uid: 1 } })?.text, '留言');
    assert.equal(mapBilibiliMessage({ cmd: 'DANMU_MSG', info: [] }), null);
});

test('房间链接解析不会把查询参数或错误域名当作房间号', () => {
    assert.equal(parseRoomId('https://live.bilibili.com/123?from=9', 'bilibili'), '123');
    assert.equal(parseRoomId('https://live.douyin.com/123456789012', 'douyin'), '123456789012');
    assert.equal(parseRoomId('0', 'douyin'), '0');
    assert.throws(() => parseRoomId('https://example.com/123', 'bilibili'));
    assert.throws(() => parseRoomId('not-a-room', 'douyin'));
    assert.equal(parsePort('888'), 888); assert.throws(() => parsePort('0')); assert.throws(() => parsePort('65536'));
});
