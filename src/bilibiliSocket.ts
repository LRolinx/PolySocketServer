
import WebSocket from 'ws';
import { decode, getCertification } from './tools';

let timer: any = null;
let ws: WebSocket;

class BilibiliSocket {
    roomid: any;
    onOpen: (e: any) => {};
    onMessage: (msg: any) => {};
    onClose: (e: any) => {};
    onError: (e: any) => {};


    constructor(roomid: any) {
        this.roomid = roomid

        this.onOpen = (e: any): any => { };

        this.onMessage = (msg: any): any => { };

        this.onClose = (e: any): any => { };

        this.onError = (e: any): any => { };
    }


    /**
     * 连接
     */
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
                let dataview = new DataView(n1);
                dataview.setUint16(4, 0x0010);
                dataview.setUint16(6, 0x0001);
                dataview.setUint16(10, 0x0002);
                dataview.setUint16(14, 0x0001);
                // dataview.setUint32(0, 0);  //封包总大小
                // dataview.setUint16(4, 16); //头部长度
                // dataview.setUint16(6, 1); //协议版本
                // dataview.setUint32(8, 2);  // 操作码 2 心跳包
                // dataview.setUint32(12, 1); //就1


                ws.send(dataview.buffer); //发送
            }, 30000)   //30秒
            this.onOpen(e);
        };

        // WebSocket连接关闭回调
        ws.onclose = (e) => {
            console.log((new Date()).toLocaleTimeString(), "连接弹幕服务已关闭", e.code);
            //要在连接关闭的时候停止 心跳包的 定时器
            if (timer != null)
                clearInterval(timer);

            this.onClose(e);

            if (e.code == 1006) {
                //非正常断开 重连
                this.connect();
            }
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

    /**
     * 关闭
     */
    close() {
        ws.close();
    }
}

export default BilibiliSocket;