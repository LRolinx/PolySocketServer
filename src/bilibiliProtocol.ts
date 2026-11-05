import protobuf from 'protobufjs';

// 字段定义参考 blivedm-go（MIT），授权声明见 THIRD_PARTY_NOTICES.md。
const root = protobuf.parse(`syntax = "proto3";
message UserBase { string name = 1; }
message UserInfo { uint64 uid = 1; UserBase base = 2; }
message GiftItem { uint32 giftId = 1; string giftName = 2; uint32 num = 3; uint64 price = 5; }
message SendGift { uint64 uid = 1; string uname = 2; repeated GiftItem gifts = 10; UserInfo sender = 15; }
message InteractWord { uint64 uid = 1; string uname = 2; uint32 msgType = 5; UserInfo sender = 22; }
`).root;

/** Expand protobuf events to the legacy JSON shapes, including every gift in a batch. */
export function normalizeBilibiliEvent(event: any): any[] {
    const cmd = String(event?.cmd || '').split(':')[0];
    if (cmd !== 'SEND_GIFT_V2' && cmd !== 'INTERACT_WORD_V2') return [event];
    if (typeof event?.data?.pb !== 'string' || !event.data.pb) return [];
    const type = root.lookupType(cmd === 'SEND_GIFT_V2' ? 'SendGift' : 'InteractWord');
    const data = type.toObject(type.decode(Buffer.from(event.data.pb, 'base64')), { longs: String }) as any;
    const uid = data.uid || data.sender?.uid || '0';
    const uname = data.uname || data.sender?.base?.name || '';
    if (cmd === 'INTERACT_WORD_V2') {
        return data.msgType === 1 ? [{ cmd: 'INTERACT_WORD', data: { uid, uname, msg_type: data.msgType } }] : [];
    }
    return (data.gifts || []).map((gift: any) => ({ cmd: 'SEND_GIFT', data: {
        uid, uname, giftId: gift.giftId, giftName: gift.giftName,
        num: gift.num || 1, price: Number(gift.price || 0),
    } }));
}
