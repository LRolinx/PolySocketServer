export function parseRoomId(input: string, platform: 'bilibili' | 'douyin'): string {
    const value = input.trim();
    if (/^\d+$/.test(value)) return value;
    try {
        const url = new URL(value);
        const host = platform === 'bilibili' ? 'live.bilibili.com' : 'live.douyin.com';
        const match = url.pathname.match(/^\/(\d+)\/?$/);
        if (url.protocol === 'https:' && url.hostname === host && match) return match[1];
    } catch { /* The input is neither an ID nor a supported room URL. */ }
    throw new Error(`无效的 ${platform} 房间地址`);
}

export function parsePort(input: string): number {
    const port = Number(input);
    if (!/^\d+$/.test(input) || port < 1 || port > 65535) throw new Error('端口必须为 1–65535');
    return port;
}
