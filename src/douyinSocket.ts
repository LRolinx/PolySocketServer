import puppeteer, { Browser, Page } from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { decodeDouyinFrame, decodeDouyinResponse, DouyinMessage } from './douyinProtocol';

export interface DouyinOptions {
    executablePath?: string;
    userAgent?: string;
    headless?: boolean;
    connectTimeoutMs?: number;
    reconnectDelayMs?: number;
}

export function findBrowser(): string {
    const candidates = [
        process.env.DOUYIN_BROWSER_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    ];
    const result = candidates.find((path) => path && existsSync(path));
    if (!result) throw new Error('未找到 Chrome/Edge，请设置 DOUYIN_BROWSER_PATH');
    return result;
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Read the live page's own HTTP/WebSocket messages; the page manages signing and ACKs. */
export default class DouYinSocket {
    onOpen: (info: any) => void = () => {};
    onMessage: (message: DouyinMessage) => void = () => {};
    onClose: (info: any) => void = () => {};
    onError: (error: any) => void = () => {};
    endpoint = '';
    stats = { webSocketFrames: 0, httpResponses: 0, decodedMessages: 0 };

    private browser: Browser | null = null;
    private page: Page | null = null;
    private stopped = true;
    private generation = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private cancelReady: (() => void) | null = null;
    private seen = new Set<string>();
    private legacyCallback?: (name: string, content: string, html: string) => void;

    constructor(public roomid: string | number, private options: DouyinOptions = {}) {
        if (!/^\d+$/.test(String(roomid))) throw new Error('抖音房间号必须为数字');
    }

    async connect(): Promise<void> {
        await this.close();
        this.stopped = false;
        this.seen.clear();
        this.stats = { webSocketFrames: 0, httpResponses: 0, decodedMessages: 0 };
        await this.open(++this.generation);
    }

    private active(generation: number) {
        return !this.stopped && this.generation === generation;
    }

    private async open(generation: number): Promise<void> {
        try {
            const browser = await puppeteer.launch({
                executablePath: this.options.executablePath || findBrowser(),
                headless: this.options.headless ?? true,
                args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
                defaultViewport: { width: 1440, height: 900 },
            });
            if (!this.active(generation)) { await browser.close(); return; }
            this.browser = browser;
            const page = await browser.newPage();
            this.page = page;
            await page.setUserAgent({ userAgent: this.options.userAgent || process.env.DOUYIN_USER_AGENT || DEFAULT_USER_AGENT });
            const cdp = await page.createCDPSession();
            await cdp.send('Network.enable');
            const requests = new Set<string>();
            let ready = false;
            let notifyReady = () => {};

            const dispatch = (messages: DouyinMessage[], endpoint: string) => {
                if (!this.active(generation) || messages.length === 0) return;
                this.endpoint = endpoint;
                this.clearReconnect();
                if (!ready) {
                    ready = true;
                    notifyReady();
                    this.onOpen({ roomid: String(this.roomid), endpoint });
                }
                for (const message of messages) {
                    const key = message.id && message.id !== '0' ? `${message.cmd}:${message.id}` : '';
                    if (key && this.seen.has(key)) continue;
                    if (key) this.seen.add(key);
                    if (this.seen.size > 4096) this.seen.delete(this.seen.values().next().value!);
                    this.stats.decodedMessages++;
                    this.onMessage(message);
                    if (message.cmd === 'WebcastChatMessage') this.legacyCallback?.(message.name, message.text || '', '');
                }
            };

            const endpoints = new Map<string, string>();
            cdp.on('Network.webSocketCreated', ({ requestId, url }) => {
                const parsed = new URL(url);
                if (!parsed.pathname.startsWith('/webcast/im/push')) return;
                requests.add(requestId);
                endpoints.set(requestId, parsed.origin + parsed.pathname);
            });
            cdp.on('Network.webSocketFrameReceived', ({ requestId, response }) => {
                if (!this.active(generation) || !requests.has(requestId) || response.opcode !== 2) return;
                this.stats.webSocketFrames++;
                try {
                    dispatch(decodeDouyinFrame(Buffer.from(response.payloadData, 'base64')), endpoints.get(requestId)!);
                } catch (error) { this.onError(error); }
            });
            cdp.on('Network.webSocketClosed', ({ requestId }) => {
                if (requests.delete(requestId) && this.active(generation)) this.scheduleReconnect(generation);
            });
            page.on('response', async (response) => {
                const url = new URL(response.url());
                if (url.pathname !== '/webcast/im/fetch/' || !this.active(generation)) return;
                try {
                    const data = await response.content();
                    if (!this.active(generation) || data.length === 0) return;
                    this.stats.httpResponses++;
                    dispatch(decodeDouyinResponse(data), url.origin + url.pathname);
                } catch (error) { if (this.active(generation)) this.onError(error); }
            });
            browser.on('disconnected', () => { if (this.active(generation)) this.scheduleReconnect(generation); });
            page.on('error', (error) => { if (this.active(generation)) { this.onError(error); this.scheduleReconnect(generation); } });

            await page.goto(`https://live.douyin.com/${this.roomid}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
            if (!ready && this.active(generation)) {
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('抖音未返回弹幕消息；请检查直播状态、页面验证或网络')), this.options.connectTimeoutMs ?? 60000);
                    notifyReady = () => { clearTimeout(timeout); this.cancelReady = null; resolve(); };
                    this.cancelReady = () => { clearTimeout(timeout); reject(new Error('抖音连接已关闭')); };
                });
            }
        } catch (error) {
            if (this.active(generation)) {
                this.onError(error);
                this.scheduleReconnect(generation);
            }
            throw error;
        }
    }

    private clearReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    private scheduleReconnect(generation: number) {
        if (!this.active(generation) || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            if (!this.active(generation)) return;
            const next = ++this.generation;
            this.cancelReady?.();
            this.cancelReady = null;
            await this.dispose();
            this.onClose({ reconnecting: true });
            void this.open(next).catch(() => {});
        }, this.options.reconnectDelayMs ?? 10000);
    }

    /** Compatibility with the old chat callback. The protocol has no DOM HTML. */
    handleWebcast(callback: (name: string, content: string, html: string) => void) {
        this.legacyCallback = callback;
        return this.connect();
    }

    private async dispose() {
        const browser = this.browser;
        this.browser = null;
        this.page = null;
        await browser?.close().catch(() => {});
    }

    async close(): Promise<void> {
        this.stopped = true;
        ++this.generation;
        this.clearReconnect();
        this.cancelReady?.();
        this.cancelReady = null;
        await this.dispose();
    }
}
