import WebSocket from 'ws';
import puppeteer from "puppeteer";


let timer: any = null;
let ws: WebSocket;

export default class DouYinSocket {
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
        let url = 'wss://webcast3-ws-web-hl.douyin.com/webcast/im/push/?app_name=douyin_web&version_code=180800&webcast_sdk_version=1.3.0&update_version_code=1.3.0&compress=gzip&imprp=u6Xml_b3cAgAFASMAAAAAAAAAEyR9&internal_ext=internal_src:dim|wss_push_room_id:7146820818603871013|wss_push_did:7139416318604609063|dim_log_id:202209241655020101512081060E87639C|fetch_time:1664009702866|start_time:0|seq:1|next_cursor:t-1664009702866_r-1_d-1_u-1_h-1|next_live_cursor:u-1_d-1|door:6-n35|wss_info:0-1664009702866-0-0&cursor=t-1664009702866_r-1_d-1_u-1_h-1&host=https://live.douyin.com&aid=6383&live_id=1&did_rule=3&debug=false&device_platform=web&cookie_enabled=true&screen_width=1536&screen_height=864&browser_language=zh-CN&browser_platform=Win32&browser_name=Mozilla&browser_version=5.0%20(Windows%20NT%2010.0;%20Win64;%20x64)%20AppleWebKit/537.36%20(KHTML,%20like%20Gecko)%20Chrome/108.0.0.0%20Safari/537.36&browser_online=true&tz_name=Asia/Shanghai&identity=audience&room_id=7146820818603871013&heartbeatDuration=0';

        if (ws) //防止重复连接
            ws.close()
        // 打开一个 web socket
        ws = new WebSocket(url);
        //WebSocket连接成功回调
        ws.onopen = (e: any) => {
            //连接上先发送心跳
            this.heartbeat()
            //组合认证数据包 并发送
            // ws.send(getCertification(JSON.stringify(json)).buffer);

            //心跳包的定时器
            timer = setInterval(() => { //定时器 注意声明timer变量
                this.heartbeat();
            }, 10000)   //30秒
            this.onOpen(e);
        };

        // WebSocket连接关闭回调
        ws.onclose = (e) => {
            console.log((new Date()).toLocaleTimeString(), "DouYin弹幕服务已关闭", e.code);
            //要在连接关闭的时候停止 心跳包的 定时器
            if (timer != null)
                clearInterval(timer);

            this.onClose(e);

            if (e.code == 1006) {
                //非正常断开 重连
                // this.connect();
            }
        };

        //WebSocket接收数据回调
        ws.onmessage = (evt: any) => {
            let blob = evt.data;
            // //对数据进行解码 decode方法
            // decode(blob, (packet: any) => {
            //     //解码成功回调
            //     if (packet.op == 5) {
            //         //会同时有多个 数发过来 所以要循环
            //         for (let i = 0, len = packet.body.length; i < len; i++) {
            //             let element = packet.body[i];
            //             //将数据回调回去
            //             this.onMessage(element)
            //         }

            //     }
            // });
        };

        ws.onerror = (e: any) => {
            // this.onError(e);
            // this.connect();
        };

    }

    /**
     * 心跳
     */
    heartbeat() {
        let n1 = new ArrayBuffer(4);
        let dataview = new DataView(n1);
        dataview.setUint16(0, 0x3a02);
        dataview.setUint16(2, 0x6862);
        ws.send(dataview.buffer); //发送
    }

    handleWebcast(cb: (name: string, content: string, html: string) => void) {
        puppeteer
            .launch({
                devtools: false,
                slowMo: 400,
                defaultViewport: { width: 1280, height: 800 },
            })
            .then(async (browser) => {
                const page = await browser.newPage();
                await page.goto(`https://live.douyin.com/${this.roomid}`);
                // 放一个函数到window上,并且这个函数会在node中执行
                await page.exposeFunction(
                    "addMessage",
                    (name: string, content: string, html: string) => {
                        
                        if (content && name && html) {
                            cb(name, content, html);
                        }
                    }
                );

                await page.evaluate(() => {
                    function getElementTextWithImg(parent: Node | null) {
                        if (!parent || !parent.childNodes) {
                            return "";
                        }
                        let content = "";
                        for (const node of parent.childNodes) {
                            if (node.nodeType === 1) {
                                for (const child of node.childNodes) {
                                    if (child.nodeType === 3) {
                                        //文本
                                        content += (child as Text).data;
                                    } else if (child.nodeType === 1) {
                                        // 元素
                                        const el = child as HTMLElement;
                                        if (el.tagName === "IMG") {
                                            content += (el as HTMLImageElement).alt || "";
                                        }
                                    }
                                }
                            }
                        }
                        return content;
                    }

                    // //截取用户发的消息
                    const items = document.querySelector(
                        ".webcast-chatroom___items > div"
                    ) as HTMLDivElement;
                    const appendChild = items.appendChild;
                    items.appendChild = function (n: Node) {
                        const node = n as Element;
                        const html = node.innerHTML;
                        const div = node.childNodes[0] as HTMLDivElement;

                        const name = div.childNodes[1]?.textContent?.replace(":", "") || "";
                        const content = getElementTextWithImg(div.childNodes[2]);

                        (window as any)["addMessage"](name, content, html);

                        return appendChild.call(this, node) as any;
                    };

                    // //截取有人进来了
                    // const enter = document.querySelector(
                    //     ".webcast-chatroom___bottom-message"
                    // ) as HTMLDivElement;
                    // const enterappendChild = enter.appendChild;
                    // enter.appendChild = function (n: Node) {
                    //     const node = n as Element;
                    //     const html = node.innerHTML;
                    //     const div = node.childNodes[0] as HTMLDivElement;

                    //     const name = div.childNodes[1]?.textContent || "";
                    //     const content = getElementTextWithImg(div.childNodes[2]);
                    //     (window as any)["addMessage"](name, content, html);

                    //     return enterappendChild.call(this, node) as any;
                    // };


                });
                console.log((new Date()).toLocaleTimeString(), `DouYin已进入${this.roomid}号房间`);
            });
    }
}

//抖音10秒一个心跳
//心跳内容00000000:3a02 6862
