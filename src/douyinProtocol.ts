import protobuf from 'protobufjs';
import { gunzipSync } from 'node:zlib';

// 字段定义参考 DyHub（MIT），授权声明见 THIRD_PARTY_NOTICES.md。
const root = protobuf.parse(`syntax = "proto3";
message Header { string key = 1; string value = 2; }
message PushFrame {
  repeated Header headersList = 5;
  string payloadEncoding = 6;
  string payloadType = 7;
  bytes payload = 8;
}
message Response { repeated Message messagesList = 1; }
message Message { string method = 1; bytes payload = 2; uint64 msgId = 3; }
message Common { uint64 msgId = 2; uint64 roomId = 3; }
message User { uint64 id = 1; string nickname = 3; }
message ChatMessage { Common common = 1; User user = 2; string content = 3; }
message GiftMessage {
  Common common = 1; uint64 giftId = 2; uint64 repeatCount = 5;
  User user = 7; int32 repeatEnd = 9; uint64 groupId = 11; Gift gift = 15;
}
message Gift { uint64 id = 5; bool combo = 10; uint32 diamondCount = 12; string name = 16; }
message MemberMessage { Common common = 1; User user = 2; }
message LikeMessage { Common common = 1; uint64 count = 2; uint64 total = 3; User user = 5; }
`).root;

const messageTypes: Record<string, string> = {
    WebcastChatMessage: 'ChatMessage',
    WebcastGiftMessage: 'GiftMessage',
    WebcastMemberMessage: 'MemberMessage',
    WebcastLikeMessage: 'LikeMessage',
};

export interface DouyinMessage {
    cmd: string;
    id: string;
    roomid: string;
    uid: string;
    name: string;
    text?: string;
    giftId?: string;
    giftName?: string;
    num?: number;
    price?: number;
    repeatEnd?: boolean;
    combo?: boolean;
    groupId?: string;
    total?: string;
}

/** Decode a browser Webcast frame. ACKs and unsupported methods are ignored. */
export function decodeDouyinFrame(data: Uint8Array): DouyinMessage[] {
    const frame = root.lookupType('PushFrame').decode(data) as any;
    if (frame.payloadType !== 'msg' && frame.payloadType !== 'push') return [];
    let payload = Buffer.from(frame.payload || []);
    const gzip = frame.payloadEncoding === 'gzip' ||
        (frame.headersList || []).some((h: any) => h.key === 'compress_type' && h.value === 'gzip') ||
        (payload[0] === 0x1f && payload[1] === 0x8b);
    if (gzip) payload = gunzipSync(payload, { maxOutputLength: 16 * 1024 * 1024 });
    return decodeDouyinResponse(payload);
}

/** HTTP fetch responses use the same Response envelope without PushFrame. */
export function decodeDouyinResponse(data: Uint8Array): DouyinMessage[] {
    const response = root.lookupType('Response').decode(data) as any;
    const messages: DouyinMessage[] = [];
    for (const item of response.messagesList || []) {
        const typeName = messageTypes[item.method];
        if (!typeName) continue;
        const type = root.lookupType(typeName);
        const body = type.toObject(type.decode(item.payload), { longs: String }) as any;
        const message: DouyinMessage = {
            cmd: item.method,
            id: String(item.msgId || body.common?.msgId || ''),
            roomid: String(body.common?.roomId || ''),
            uid: String(body.user?.id || ''),
            name: body.user?.nickname || '',
        };
        if (typeName === 'ChatMessage') message.text = body.content || '';
        if (typeName === 'GiftMessage') {
            message.giftId = String(body.giftId || body.gift?.id || '');
            message.giftName = body.gift?.name || '';
            message.num = Number(body.repeatCount || 1);
            message.price = Number(body.gift?.diamondCount || 0);
            message.repeatEnd = body.repeatEnd === 1;
            message.combo = !!body.gift?.combo;
            message.groupId = String(body.groupId || '0');
        }
        if (typeName === 'LikeMessage') {
            message.num = Number(body.count || 0);
            message.total = String(body.total || '0');
        }
        messages.push(message);
    }
    return messages;
}
