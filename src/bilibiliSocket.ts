import pako from 'pako'
import WebSocket from 'ws';

let timer: any = null;
let ws: any;


// 文本解码器
let textDecoder = new TextDecoder('utf-8');
// 从buffer中读取int
const readInt = (buffer: any, start: any, len: any) => {
    let result = 0
    for (let i = len - 1; i >= 0; i--) {
        result += Math.pow(256, len - i - 1) * buffer[start + i]
    }
    return result
}
/**
* blob blob数据
* call 回调 解析数据会通过回调返回数据
*/
const decode = (blob: any, call: any) => {
    let buffer = Buffer.from(blob);

    let result: any = {}
    result.packetLen = readInt(buffer, 0, 4)
    result.headerLen = readInt(buffer, 4, 2)
    result.ver = readInt(buffer, 6, 2)
    result.op = readInt(buffer, 8, 4)
    result.seq = readInt(buffer, 12, 4)
    if (result.op == 5) {
        result.body = []
        let offset = 0;
        while (offset < buffer.length) {
            let packetLen = readInt(buffer, offset + 0, 4)
            let headerLen = 16// readInt(buffer,offset + 4,4)
            let data = Uint8Array.from(buffer).slice(offset + headerLen, offset + packetLen);

            let body = "{}"
            if (result.ver == 2) {
                //协议版本为 2 时  数据有进行压缩 通过pako.js 进行解压
                body = textDecoder.decode(pako.inflate(data));
            } else {
                //协议版本为 0 时  数据没有进行压缩
                body = textDecoder.decode(data);
            }
            if (body) {
                // 同一条消息中可能存在多条信息，用正则筛出来
                const group = body.split(/[\x00-\x1f]+/);
                group.forEach(item => {
                    try {
                        result.body.push(JSON.parse(item));
                    } catch (e) {
                        // 忽略非JSON字符串，通常情况下为分隔符
                    }
                });
            }
            offset += packetLen;
        }
    }
    //回调
    call(result);
}


//字符串转bytes
const str2bytes = (str: any): any => {
    const bytes = []
    let c
    for (let i = 0, len = str.length; i < len; i++) {
        c = str.charCodeAt(i)
        if (c >= 0x010000 && c <= 0x10FFFF) {
            bytes.push(((c >> 18) & 0x07) | 0xF0)
            bytes.push(((c >> 12) & 0x3F) | 0x80)
            bytes.push(((c >> 6) & 0x3F) | 0x80)
            bytes.push((c & 0x3F) | 0x80)
        } else if (c >= 0x000800 && c <= 0x00FFFF) {
            bytes.push(((c >> 12) & 0x0F) | 0xE0)
            bytes.push(((c >> 6) & 0x3F) | 0x80)
            bytes.push((c & 0x3F) | 0x80)
        } else if (c >= 0x000080 && c <= 0x0007FF) {
            bytes.push(((c >> 6) & 0x1F) | 0xC0)
            bytes.push((c & 0x3F) | 0x80)
        } else {
            bytes.push(c & 0xFF)
        }
    }
    return bytes
}

//组合认证数据包
const getCertification = (json: any): any => {
    let bytes = str2bytes(json);  //字符串转bytes
    let n1 = new ArrayBuffer(bytes.length + 16)
    let i = new DataView(n1);
    i.setUint32(0, bytes.length + 16), //封包总大小
        i.setUint16(4, 16), //头部长度
        i.setUint16(6, 1), //协议版本
        i.setUint32(8, 7),  //操作码 7表示认证并加入房间
        i.setUint32(12, 1); //就1
    for (let r = 0, len = bytes.length; r < len; r++) {
        i.setUint8(16 + r, bytes[r]); //把要认证的数据添加进去
    }
    return i; //返回
}


class BilibiliSocket {
    roomid: any
    onOpen: (e: any) => {}
    onMessage: (msg: any) => {}
    onClose: (e: any) => {}
    onError: (e: any) => {}


    constructor(roomid: any) {
        this.roomid = roomid

        this.onOpen = (e: any): any => { };

        this.onMessage = (msg: any): any => { };

        this.onClose = (e: any): any => { };

        this.onError = (e: any): any => { };
    }



    connect() {
        let url = 'wss://broadcastlv.chat.bilibili.com/sub';

        let json = {
            "uid": 0,
            "roomid": parseInt(this.roomid), //注意roomid是数字
            "protover": 1,
            "platform": "web",
            "clientver": "1.4.0",
            // "key": key
        }

        if (ws) //防止重复连接
            ws.close()
        // 打开一个 web socket
        ws = new WebSocket(url);
        // WebSocket连接成功回调
        ws.onopen = (e: any) => {
            //组合认证数据包 并发送
            ws.send(getCertification(JSON.stringify(json)).buffer);
            //心跳包的定时器
            timer = setInterval(() => { //定时器 注意声明timer变量
                let n1 = new ArrayBuffer(16)
                let i = new DataView(n1);
                i.setUint32(0, 0),  //封包总大小
                    i.setUint16(4, 16), //头部长度
                    i.setUint16(6, 1), //协议版本
                    i.setUint32(8, 2),  // 操作码 2 心跳包
                    i.setUint32(12, 1); //就1
                ws.send(i.buffer); //发送
            }, 30000)   //30秒
            this.onOpen(e);
        };

        // WebSocket连接关闭回调
        ws.onclose = (e: any) => {
            console.log("连接已关闭");
            //要在连接关闭的时候停止 心跳包的 定时器
            if (timer != null)
                clearInterval(timer);



            this.onClose(e);
        };

        //WebSocket接收数据回调
        ws.onmessage = (evt: any) => {
            let blob = evt.data;
            //对数据进行解码 decode方法
            decode(blob, (packet: any) => {
                //解码成功回调
                if (packet.op == 5) {
                    //会同时有多个 数发过来 所以要循环
                    for (let i = 0, len = packet.body.length; i < len; i++) {
                        let element = packet.body[i];
                        //将数据回调回去
                        this.onMessage(element)
                    }

                }
            });
        };

        ws.onerror = (e: any) => {
            this.onError(e);
            this.connect();
        };
    }
}

export default  BilibiliSocket;