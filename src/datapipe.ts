///数据管道
import crypto from 'crypto';
import net from 'net';
import fs from 'fs';
import axios from 'axios';
import WebSocketServer from 'ws';

let uidlist: any = [];
let saveDataPath = "";

//获取哔哩哔哩用户图片地址
async function getbilibiliurl(uid: any) {
    let data = await axios.get(`https://tenapi.cn/bilibili/?uid=${uid}`)
        .then((res: any) => {
            return res.data;
        })
        .catch((error: any) => {
            return null;
        });
    return data;
}

async function savebilibiliheadImg(uid: any, url: any) {
    let data = await axios.get(url, {
        responseType: 'arraybuffer'
    }).then((response: any) => {
        // console.log(response.status);
        // console.log(response.headers);
        // fs.writeFileSync(`${saveDataPath}/${uid}.png`, response.data, (err: any) => { });
        return true;
    });
    return data;
}

class datapipe {
    clients: any;
    ws: WebSocketServer.Server<WebSocketServer.WebSocket>;
    //事件注册
    constructor(port: any) {
        // const this = this;
        /**
         * @type {WebSocket.WebSocket[]}
         */
        this.clients = [];
        //this.cmdHandler["ONLINE_RANK_V2"] = this.top;

        this.ws = new WebSocketServer.Server({ host: "127.0.0.1", port: port });

        this.ws.once("listening", function () {
            //获取地址信息
            let address = this.address();
            //获取地址详细信息
            console.log((new Date()).toLocaleTimeString(),"转发到该地址->", address)
            // console.log("转发服务器监听的地址是：" + address.address);
            // console.log("转发服务器监听的端口是：" + address.port);
            // console.log("转发服务器监听的地址类型是：" + address.family);
        })

        this.ws.on('connection', (socket: any) => {
            socket.setMaxListeners(10);
            this.clients.push(socket);

            console.log((new Date()).toLocaleTimeString(),'有客户端接入中转服务');
            console.log(`${(new Date()).toLocaleTimeString()} Client Disconnect. ${this.clients.length}|${socket.getMaxListeners()}`);

            socket.on("message", (payloadData: any) => {
                // console.log("server rcv data=" + payloadData);
                let data = JSON.parse(payloadData);
                switch (data.cmd) {
                    case "LWS_SaveDataPath":
                        //得到保存数据的路径
                        saveDataPath = data.text;
                        break;
                }

            });

            socket.on("close", () => {
                let index = this.clients.indexOf(socket);
                if (index != -1) {
                    this.clients.splice(index, 1);
                    console.log(`${(new Date()).toLocaleTimeString()} Client Disconnect. ${this.clients.length}|${socket.getMaxListeners()}`);
                }
            });

            socket.on("error", (err: any) => {
                let index = this.clients.indexOf(socket);
                if (index != -1) {
                    this.clients.splice(index, 1);
                    console.log(`${(new Date()).toLocaleTimeString()} Client Disconnect. ${this.clients.length}|${socket.getMaxListeners()}`);
                }
            });
        });

        this.ws.on("close", () => {
            console.log((new Date()).toLocaleTimeString(),'转发服务已关闭');
        })

        this.ws.on("error", (err: any) => {
            console.log((new Date()).toLocaleTimeString(),'转发服务运行异常', err);
        })
    }

    //游戏弹幕
    async danmaku(data: any) {
        if (this.clients.length >= 0 || saveDataPath != "") {
            //没获取到保存资源路径和没有任何需要转发的客户端则不转发弹幕
            let miniMsg = {}
            switch (data.cmd) {
                case 'DANMU_MSG':
                    //普通弹幕
                    console.log((new Date()).toLocaleTimeString(),data.info[2][1], "->", data.info[1])
                    miniMsg = {
                        cmd: "DANMU_MSG",
                        text: data.info[1],
                        uid: data.info[2][0],
                        name: data.info[2][1],
                    }

                    this.pub(miniMsg);

                    break;
                case 'SUPER_CHAT_MESSAGE_JPN':
                    //超级弹幕
                    // console.log((new Date()).toLocaleTimeString(),"超级弹幕", data)

                    miniMsg = {
                        cmd: "DANMU_MSG",
                        text: data.data.message,
                        uid: data.data.uid,
                    }

                    console.log((new Date()).toLocaleTimeString(),"超级弹幕->", miniMsg)

                    this.pub(miniMsg);
                case 'ENTRY_EFFECT':
                    //进入直播特效
                    break;
                case 'INTERACT_WORD':
                    //进入直播
                    // console.log(data.data)
                    // console.log("进入直播: " + data.data.uname);

                    miniMsg = {
                        cmd: "DANMU_MSG",
                        text: "我来了~",
                        uid: data.data.uid,
                        name: data.data.uname,
                    }

                    console.log((new Date()).toLocaleTimeString(),miniMsg)

                    this.pub(miniMsg);
                    break;
                case 'ONLINE_RANK_COUNT':
                    //直播排名
                    break;
                case 'ONLINE_RANK_V2':
                    ////在线排名V2
                    break;
                case 'HOT_RANK_CHANGED':
                    //热门排行
                    break;
                case 'HOT_RANK_CHANGED_V2':
                    //热门排名V2
                    break;
                case 'SEND_GIFT':
                    //送礼物
                    miniMsg = {
                        cmd: "SEND_GIFT",
                        uid: data.data.uid,
                        name: data.data.uname,
                        giftName: data.data.giftName,
                        giftId: data.data.giftId,
                        giftType: data.data.giftType,
                        num: data.data.num,
                        price: data.data.price,
                    }
                    console.log((new Date()).toLocaleTimeString(),"送礼", data)
                    this.pub(miniMsg);
                    break;
                case 'COMBO_SEND':
                    //组合送礼
                    // console.log("组合送礼", data)
                    break;
                case 'WATCHED_CHANGE':
                    //观看变化
                    // console.log('观看变化', data);//数据格式从打印中就可以分析出来啦
                    break;
                case 'ROOM_REAL_TIME_MESSAGE_UPDATE':
                    //在线房间列表
                    break;
                case 'STOP_LIVE_ROOM_LIST':
                    //离线房间列表
                    break;
                case 'LIVE_INTERACTIVE_GAME':
                    //现场互动游戏
                    break;
                case 'NOTICE_MSG':
                    //通知消息
                    break;
                case 'SUPER_CHAT_MESSAGE':
                    //醒目留言
                    break;
                case 'GUARD_BUY':
                    //续费舰长
                    miniMsg = {
                        cmd: "SEND_GIFT",
                        uid: data.data.uid,
                        name: data.data.username,
                        giftName: data.data.gift_name,
                        giftId: data.data.gift_id,
                        giftType: data.data.giftType,
                        num: data.data.num,
                        price: data.data.price,
                    }
                    this.pub(miniMsg);

                    break;
                case 'USER_TOAST_MSG':
                    //续费舰长通知
                    break;
                case 'LIVE':
                    //直播开始啦
                    break;
                default:
                    console.log((new Date()).toLocaleTimeString(),'---未确认格式---', data);
            }
        }
    }

    async close() {
        this.ws.close();
    }

    async isnullsaveHead(data: any) {
        //检查是否已经有对应玩家的头像没有则保存
        if (!uidlist.includes(data.info[2][0])) {
            //添加防止重复获取头像
            uidlist.push(data.info[2][0]);

            var bilibilimgdata = await getbilibiliurl(data.info[2][0]);
            if (bilibilimgdata != null) {
                await savebilibiliheadImg(data.info[2][0], bilibilimgdata.data.avatar)
            }
        }
    }

    /**
     * 发送给所有客户端
     * @param {object} msg 
     */
    pub(msg: any) {
        // let buffer = Buffer.from(JSON.stringify(msg))
        // let send = Buffer.alloc(2 + buffer.length);
        // //0b10000000表示发送结束
        // send[0] = 0x81;
        // //载荷数据的长度
        // send[1] = buffer.length;
        // buffer.copy(send, 2);

        if (this.clients.length > 0) {
            for (let i = 0, len = this.clients.length; i < len; i++) {
                let c = this.clients[i];
                c.send(JSON.stringify(msg));
            }
        }
    }

}

export default datapipe