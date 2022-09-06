const crypto = require('crypto');
const net = require("net");
const fs = require('fs')
const axios = require('axios');
const WebSocketServer = require("ws").Server;

let uidlist = [];
let saveDataPath = "";

//获取哔哩哔哩用户图片地址
async function getbilibiliurl(uid) {
    let data = await axios.get(`https://tenapi.cn/bilibili/?uid=${uid}`)
        .then(res => {
            return res.data;
        })
        .catch(error => {
            return null;
        });
    return data;
}

async function savebilibiliheadImg(uid, url) {
    let data = await axios.get(url, {
        responseType: 'arraybuffer'
    }).then(function (response) {
        // console.log(response.status);
        // console.log(response.headers);
        fs.writeFileSync(`${saveDataPath}/${uid}.png`, response.data, function (err) {
        });
        return true;
    });
    return data;
}

class datapipe {

    //事件注册
    constructor(port) {
        const self = this;
        /**
         * @type {WebSocket.WebSocket[]}
         */
        self.clients = [];
        //this.cmdHandler["ONLINE_RANK_V2"] = this.top;

        const ws = new WebSocketServer({ host: "127.0.0.1", port: port })

        ws.once("listening", function () {
            //获取地址信息
            let address = ws.address();
            //获取地址详细信息
            console.log("转发服务器监听的地址是：" + address.address);
            console.log("转发服务器监听的端口是：" + address.port);
            console.log("转发服务器监听的地址类型是：" + address.family);
        })

        ws.on('connection', function (socket) {
            socket.setMaxListeners(10);
            self.clients.push(socket);

            console.log('有新的客户端接入');
            console.log(`${(new Date()).toLocaleTimeString()} Client Disconnect. ${self.clients.length}|${socket.getMaxListeners()}`);

            socket.on("message", function (payloadData) {
                // console.log("server rcv data=" + payloadData);
                let data = JSON.parse(payloadData);
                switch (data.cmd) {
                    case "LWS_SaveDataPath":
                        //得到保存数据的路径
                        saveDataPath = data.text;
                        break;
                }

            });

            socket.on("close", function () {
                let index = self.clients.indexOf(socket);
                if (index != -1) {
                    self.clients.splice(index, 1);
                    console.log(`${(new Date()).toLocaleTimeString()} Client Disconnect. ${self.clients.length}|${socket.getMaxListeners()}`);
                }
            });

            socket.on("error", function (err) {
                let index = self.clients.indexOf(socket);
                if (index != -1) {
                    self.clients.splice(index, 1);
                    console.log(`${(new Date()).toLocaleTimeString()} Client Disconnect. ${self.clients.length}|${socket.getMaxListeners()}`);
                }
            });
        });

        ws.on("close", function () {
            console.log('服务已关闭');
        })

        ws.on("error", function (err) {
            console.log('服务运行异常', err);
        })
    }

    //游戏弹幕
    async danmaku(data) {
        if (this.clients.length >= 0 || saveDataPath != "") {
            //没获取到保存资源路径和没有任何需要转发的客户端则不转发弹幕
            let miniMsg = {}
            switch (data.cmd) {
                case 'DANMU_MSG':
                    //普通弹幕

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
                    console.log("超级弹幕", data)

                    miniMsg = {
                        cmd: "DANMU_MSG",
                        text: data.data.message,
                        uid: data.data.uid,
                    }

                    this.pub(miniMsg);
                case 'ENTRY_EFFECT':
                    //进入直播特效
                    break;
                case 'INTERACT_WORD':
                    //进入直播
                    // console.log("进入直播: " + data.data.uname);
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
                        name:data.data.uname,
                        giftName: data.data.giftName,
                        giftId: data.data.giftId,
                        giftType: data.data.giftType,
                        num: data.data.num,
                        price: data.data.price,
                    }
                    console.log("送礼", data)
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
                    case 'GUARD_BUY':
                        //续费舰长
                        miniMsg = {
                            cmd: "SEND_GIFT",
                            uid: data.data.uid,
                            name:data.data.username,
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
                default:
                    console.log('---未确认格式---', data);
            }
        }
    }

    async isnullsaveHead(data) {
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
    pub(msg) {
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
module.exports = datapipe;