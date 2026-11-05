import axios from 'axios';
import { createHash } from 'crypto';

const BILIBILI_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const WBI_MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
];

type BilibiliWbiConfig = {
    mixinKey: string;
    cookie: string;
    buvid3: string;
};

type BilibiliDanmuInfo = {
    token: string;
    host_list: Array<{ host: string; wss_port: number }>;
    buvid3: string;
};

const getBilibiliWbiConfig = async (): Promise<BilibiliWbiConfig> => {
    const headers = {
        'User-Agent': BILIBILI_USER_AGENT,
        Referer: 'https://www.bilibili.com/',
    };
    const homepage = await axios.get('https://www.bilibili.com/', { headers, timeout: 15000 });
    const setCookies = homepage.headers['set-cookie'] || [];
    const cookieLines = Array.isArray(setCookies) ? setCookies : [setCookies];
    const buvidCookie = cookieLines.find((cookie: string) => cookie.startsWith('buvid3='));
    const buvid3 = buvidCookie?.match(/^buvid3=([^;]+)/)?.[1];

    if (!buvid3) {
        throw new Error('未能获取哔哩哔哩 buvid3');
    }

    const cookie = `buvid3=${buvid3}`;
    const navResponse = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
        headers: { ...headers, Cookie: cookie },
        timeout: 15000,
    });
    const wbiImage = navResponse.data?.data?.wbi_img;
    const imgKey = wbiImage?.img_url?.match(/\/([^/]+)\.png$/)?.[1];
    const subKey = wbiImage?.sub_url?.match(/\/([^/]+)\.png$/)?.[1];

    if (!imgKey || !subKey) {
        throw new Error('未能获取哔哩哔哩 WBI 密钥');
    }

    const rawKey = imgKey + subKey;
    const mixinKey = WBI_MIXIN_KEY_ENC_TAB.map((index) => rawKey[index]).join('').slice(0, 32);
    return { mixinKey, cookie, buvid3 };
};

const signWbiParams = (params: Record<string, string>, mixinKey: string): Record<string, string> => {
    const signedParams = { ...params, wts: Math.floor(Date.now() / 1000).toString() };
    const query = Object.keys(signedParams)
        .sort()
        .map((key) => {
            const value = encodeURIComponent(signedParams[key]).replace(/[!'()*]/g, '');
            return `${encodeURIComponent(key)}=${value}`;
        })
        .join('&');

    signedParams.w_rid = createHash('md5').update(query + mixinKey).digest('hex');
    return signedParams;
};

// 获取真实房间号
const getbilibiliroomid = async (roomid: any) => {
    try {
        const response = await axios.get(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${roomid}`, {
            headers: {
                'User-Agent': BILIBILI_USER_AGENT,
                Referer: `https://live.bilibili.com/${roomid}`,
            },
            timeout: 15000,
        });
        return response.data;
    } catch (error) {
        return null;
    }
};

// 获取哔哩哔哩弹幕连接信息，包含 WBI 签名、认证 token 和动态服务节点
const getBilibiliDanmuInfo = async (roomid: any): Promise<BilibiliDanmuInfo> => {
    const { mixinKey, cookie, buvid3 } = await getBilibiliWbiConfig();
    const response = await axios.get('https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo', {
        params: signWbiParams({ id: String(roomid), type: '0' }, mixinKey),
        headers: {
            'User-Agent': BILIBILI_USER_AGENT,
            Referer: `https://live.bilibili.com/${roomid}`,
            Cookie: cookie,
        },
        timeout: 15000,
    });

    if (response.data?.code !== 0 || !response.data?.data?.token || !response.data?.data?.host_list?.length) {
        throw new Error(`获取哔哩哔哩弹幕连接信息失败：${response.data?.message || response.data?.code || '无效响应'}`);
    }

    return { ...response.data.data, buvid3 };
};

// 获取哔哩哔哩用户头像地址
const getbilibiliurl = async (uid: any) => {
    try {
        const { mixinKey, cookie } = await getBilibiliWbiConfig();
        const response = await axios.get('https://api.bilibili.com/x/space/wbi/acc/info', {
            params: signWbiParams({ mid: String(uid) }, mixinKey),
            headers: {
                'User-Agent': BILIBILI_USER_AGENT,
                Referer: `https://space.bilibili.com/${uid}`,
                Cookie: cookie,
            },
            timeout: 15000,
        });

        if (response.data?.code !== 0 || !response.data?.data?.face) {
            return null;
        }
        return { data: { avatar: response.data.data.face } };
    } catch (error) {
        return null;
    }
};

export { getbilibiliroomid, getbilibiliurl, getBilibiliDanmuInfo }
