import WebSocket from 'ws';
import { getBilibiliDanmuInfo } from './axiosManage';
import { decode, getCertification } from './tools';

type DanmuServer = { host: string; wss_port: number };

class BilibiliSocket {
    roomid: any;
    onOpen: (e: any) => void;
    onMessage: (msg: any) => void;
    onClose: (e: any) => void;
    onError: (e: any) => void;

    private ws: WebSocket | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;
    private reconnectAttempts = 0;

    constructor(roomid: any) {
        this.roomid = roomid;
        this.onOpen = (_e: any): void => { };
        this.onMessage = (_msg: any): void => { };
        this.onClose = (_e: any): void => { };
        this.onError = (_e: any): void => { };
    }

    /** Connect using a fresh Bilibili danmaku token and server list. */
    connect() {
        this.stopped = false;
        this.reconnectAttempts = 0;
        void this.open();
    }

    private async open() {
        try {
            const danmuInfo = await getBilibiliDanmuInfo(this.roomid);
            if (this.stopped) return;

            const hostList = danmuInfo.host_list as DanmuServer[];
            const server = hostList[this.reconnectAttempts % hostList.length];
            const ws = new WebSocket(`wss://${server.host}:${server.wss_port}/sub`);
            this.ws = ws;

            ws.onopen = () => {
                if (this.ws !== ws || this.stopped) return;
                const auth = {
                    uid: 0,
                    roomid: Number(this.roomid),
                    protover: 3,
                    platform: 'web',
                    type: 2,
                    key: danmuInfo.token,
                    buvid: danmuInfo.buvid3,
                };
                ws.send(getCertification(JSON.stringify(auth)));
                this.startHeartbeat(ws);
            };

            ws.onmessage = (event: any) => {
                try {
                    decode(event.data, (packet: any) => {
                        if (packet.op === 8) {
                            if (packet.body?.code === 0) {
                                this.reconnectAttempts = 0;
                                this.onOpen(packet.body);
                            } else {
                                this.onError(new Error(`哔哩哔哩弹幕认证失败：${packet.body?.message || packet.body?.code || '未知错误'}`));
                                ws.close();
                            }
                            return;
                        }

                        if (packet.op === 5 && Array.isArray(packet.body)) {
                            packet.body.forEach((message: any) => this.onMessage(message));
                        }
                    });
                } catch (error) {
                    this.onError(error);
                }
            };

            ws.onclose = (event: any) => {
                if (this.ws === ws) {
                    this.ws = null;
                    this.clearHeartbeat();
                }
                this.onClose(event);
                this.scheduleReconnect();
            };

            ws.onerror = (error: any) => {
                this.onError(error);
            };
        } catch (error) {
            if (this.stopped) return;
            this.onError(error);
            this.scheduleReconnect();
        }
    }

    private startHeartbeat(ws: WebSocket) {
        this.clearHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const packet = Buffer.alloc(16);
            packet.writeUInt32BE(16, 0);
            packet.writeUInt16BE(16, 4);
            packet.writeUInt16BE(1, 6);
            packet.writeUInt32BE(2, 8);
            packet.writeUInt32BE(1, 12);
            ws.send(packet);
        }, 30000);
    }

    private clearHeartbeat() {
        if (this.heartbeatTimer !== null) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private scheduleReconnect() {
        if (this.stopped || this.reconnectTimer !== null) return;
        const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.reconnectAttempts, 5)));
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.open();
        }, delay);
    }

    /** Close this room connection and prevent automatic reconnects. */
    close() {
        this.stopped = true;
        this.clearHeartbeat();
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws !== null) {
            const ws = this.ws;
            this.ws = null;
            ws.close();
        }
    }
}

export default BilibiliSocket;
