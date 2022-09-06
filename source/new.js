const pako = require("./pako")
const WebSocket = require("./node_modules/ws")
let timer = null;
let ws;

class BilibiliSocket {
    constructor(roomid) {
        this.roomid = roomid


        this.onOpen = e => { };
        /**
         * @type {(value: number) => any}
         */
        this.onMessage = msg => { };
        /**
         * @type {(e: Event) => any}
         */
        this.onClose = e => { };
        /**
         * @type {(e: ErrorEvent) => any}
         */
        this.onError = e => { };
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
        ws.onopen = (e) => {
            //组合认证数据包 并发送
            ws.send(getCertification(JSON.stringify(json)).buffer);
            //心跳包的定时器
            timer = setInterval(function () { //定时器 注意声明timer变量
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
        ws.onclose = (e) => {
            console.log("连接已关闭");
            //要在连接关闭的时候停止 心跳包的 定时器
            if (timer != null)
                clearInterval(timer);



            this.onClose(e);
        };

        //WebSocket接收数据回调
        ws.onmessage = (evt) => {
            let blob = evt.data;
            //对数据进行解码 decode方法
            decode(blob, (packet) => {
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

        this.onerror = (e) => {
            this.onError(e);
            this.connect();
        };
    }
}

// function WebSocketTest(roomid) {

//     let url = 'wss://broadcastlv.chat.bilibili.com/sub';

//     let json = {
//         "uid": 0,
//         "roomid": parseInt(roomid), //注意roomid是数字
//         "protover": 1,
//         "platform": "web",
//         "clientver": "1.4.0",
//         // "key": key
//     }

//     if (ws) //防止重复连接
//         ws.close()
//     // 打开一个 web socket
//     ws = new WebSocket(url);

//     // WebSocket连接成功回调
//     ws.onopen = function () {
//         //组合认证数据包 并发送
//         ws.send(getCertification(JSON.stringify(json)).buffer);
//         //心跳包的定时器
//         timer = setInterval(function () { //定时器 注意声明timer变量
//             let n1 = new ArrayBuffer(16)
//             let i = new DataView(n1);
//             i.setUint32(0, 0),  //封包总大小
//                 i.setUint16(4, 16), //头部长度
//                 i.setUint16(6, 1), //协议版本
//                 i.setUint32(8, 2),  // 操作码 2 心跳包
//                 i.setUint32(12, 1); //就1
//             ws.send(i.buffer); //发送
//         }, 30000)   //30秒
//     };

//     // WebSocket连接关闭回调
//     ws.onclose = function () {
//         console.log("连接已关闭");
//         //要在连接关闭的时候停止 心跳包的 定时器
//         if (timer != null)
//             clearInterval(timer);
//     };

//     //WebSocket接收数据回调
//     ws.onmessage = function (evt) {
//         let blob = evt.data;
//         //对数据进行解码 decode方法
//         decode(blob, function (packet) {
//             //解码成功回调
//             if (packet.op == 5) {
//                 //会同时有多个 数发过来 所以要循环
//                 for (let i = 0, len = packet.body.length; i < len; i++) {
//                     let element = packet.body[i];
//                     //做一下简单的打印

//                     switch (element.cmd) {
//                         case 'DANMU_MSG':
//                             console.log("uid: " + element.info[2][0]
//                                 + " 用户: " + element.info[2][1]
//                                 + " \n内容: " + element.info[1]);
//                             break;
//                         case 'ENTRY_EFFECT':
//                             console.log("进入直播特效");
//                             break;
//                         case 'INTERACT_WORD':
//                             console.log("进入直播: " + element.data.uname);
//                             break;
//                         case 'ONLINE_RANK_COUNT':
//                             console.log("直播排名")
//                             break;
//                         case 'ONLINE_RANK_V2':
//                             console.log("在线排名V2")
//                             break;
//                         case 'SEND_GIFT':
//                             console.log("送礼物")
//                             break;
//                         case 'WATCHED_CHANGE':
//                             console.log('观看变化')
//                             console.log(element);//数据格式从打印中就可以分析出来啦
//                             break;
//                         case 'ROOM_REAL_TIME_MESSAGE_UPDATE':
//                             console.log('房间实时消息更新')
//                             break;
//                         case 'STOP_LIVE_ROOM_LIST':
//                             console.log('停止直播房间列表');
//                             break;
//                         default:
//                             console.log('---未确认格式---');
//                             console.log(element);//数据格式从打印中就可以分析出来啦
//                     }
//                 }

//             }
//         });
//     };


// }

// 文本解码器
let textDecoder = new TextDecoder('utf-8');
// 从buffer中读取int
const readInt = function (buffer, start, len) {
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
function decode(blob, call) {
    let buffer = Buffer.from(blob);

    let result = {}
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


//组合认证数据包
function getCertification(json) {
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

//字符串转bytes //这个方法是从网上找的QAQ
function str2bytes(str) {
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

module.exports = BilibiliSocket;