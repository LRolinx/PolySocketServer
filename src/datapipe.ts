import WebSocket, { WebSocketServer } from 'ws';
import { DouyinMessage } from './douyinProtocol';
import { normalizeBilibiliEvent } from './bilibiliProtocol';

export function mapBilibiliMessage(data: any): Record<string, any> | null {
    const cmd = String(data?.cmd || '').split(':')[0];
    switch (cmd) {
        case 'DANMU_MSG':
            if (!Array.isArray(data.info) || !Array.isArray(data.info[2])) return null;
            return { cmd: 'BiliBili_DANMU_MSG', text: data.info[1], uid: data.info[2][0], name: data.info[2][1] };
        case 'SUPER_CHAT_MESSAGE':
        case 'SUPER_CHAT_MESSAGE_JPN':
            if (!data.data) return null;
            return { cmd: 'BiliBili_DANMU_MSG', text: data.data.message, uid: data.data.uid, name: data.data.user_info?.uname || '' };
        case 'INTERACT_WORD':
            if (!data.data) return null;
            return { cmd: 'BiliBili_DANMU_MSG', text: '我来了~', uid: data.data.uid, name: data.data.uname };
        case 'SEND_GIFT':
        case 'GUARD_BUY': {
            const gift = data.data;
            if (!gift) return null;
            return {
                cmd: 'BiliBili_SEND_GIFT', uid: gift.uid, name: gift.uname || gift.username,
                giftName: gift.giftName || gift.gift_name, giftId: gift.giftId ?? gift.gift_id,
                giftType: gift.giftType, num: gift.num, price: gift.price,
            };
        }
        default: return null;
    }
}

export function mapDouyinMessage(data: DouyinMessage): Record<string, any> | null {
    const commands: Record<string, string> = {
        WebcastChatMessage: 'DouYin_DANMU_MSG', WebcastGiftMessage: 'DouYin_SEND_GIFT',
        WebcastMemberMessage: 'DouYin_MEMBER', WebcastLikeMessage: 'DouYin_LIKE',
    };
    const cmd = commands[data.cmd];
    return cmd ? { ...data, cmd } : null;
}

export default class datapipe {
    onMessage: (message: any) => void | Promise<void> = () => {};
    onError: (error: any) => void = () => {};
    readonly ws: WebSocketServer;
    saveDataPath = '';

    constructor(port: number) {
        this.ws = new WebSocketServer({ host: '127.0.0.1', port });
        this.ws.on('error', (error) => this.onError(error));
        this.ws.on('connection', (socket) => {
            socket.on('error', (error) => this.onError(error));
            socket.on('message', (payload) => {
                let data: any;
                try {
                    data = JSON.parse(payload.toString());
                    if (!data || typeof data !== 'object' || typeof data.cmd !== 'string') throw new Error('无效命令');
                } catch {
                    socket.send(JSON.stringify({ cmd: 'ERROR', text: '无效 JSON 命令' }));
                    return;
                }
                if (data.cmd === 'BiliBili_SaveDataPath') this.saveDataPath = String(data.text || '');
                Promise.resolve().then(() => this.onMessage(data)).catch((error) => this.onError(error));
            });
        });
    }

    bilibilidanmaku = (data: any) => {
        for (const event of normalizeBilibiliEvent(data)) {
            const message = mapBilibiliMessage(event);
            if (message) this.pub(message);
        }
    };

    douyindanmaku = (data: DouyinMessage) => {
        const message = mapDouyinMessage(data);
        if (message) this.pub(message);
    };

    pub = (message: any) => {
        const payload = JSON.stringify(message);
        for (const client of this.ws.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
    };

    close = (): Promise<void> => new Promise((resolve) => {
        for (const client of this.ws.clients) client.terminate();
        this.ws.close(() => resolve());
    });
}
