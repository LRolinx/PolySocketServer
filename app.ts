///入口文件
import datapipe from './src/datapipe';
import BilibiliSocket from "./src/bilibiliSocket";
import DouYinSocket from "./src/douyinSocket";
import SQLManage from "./src/sqlManage";
import readline from "readline";

import { getbilibiliroomid } from './src/axiosManage';


/**
 * 数据库
 */
let sqlmanage: SQLManage;

//默认Bilibili房间号
let defaultBiliBiliRoomID = 25591667;
//默认转发端口
let defaultPipe = 888;
//Bilibili房间号
let BiliBiliRoomID: any;
//转发端口
let Pipe: any;

//默认DouYin房间号
let defaultDouYinRoomID = 628857406017;
//DouYin房间号
let DouYinRoomID: any;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function rlPromisify(fn: any) {
    return async (...args: any) => {
        return new Promise(resolve => fn(...args, resolve));
    };
}

const question = rlPromisify(rl.question.bind(rl));
(async () => {
    //获取输入的转发端口
    const answer2: any = await question(`请输入转发端口(${defaultPipe})：`);
    Pipe = answer2.match(/\d+/g);
    Pipe = Pipe ? Pipe[0] : defaultPipe;

    //获取BiliBili直播地址
    const answer: any = await question(`请输入BiliBili直播地址(${defaultBiliBiliRoomID})：`);
    BiliBiliRoomID = answer.match(/\d+/g);
    BiliBiliRoomID = BiliBiliRoomID ? BiliBiliRoomID[0] : defaultBiliBiliRoomID;

    //获取BiliBili真实房间id
    let roomidData = await getbilibiliroomid(BiliBiliRoomID);
    BiliBiliRoomID = roomidData.data.room_id

    //获取DouYin直播地址
    const answer3: any = await question(`请输入DouYin直播地址(${defaultDouYinRoomID})：`);
    DouYinRoomID = answer3.match(/\d+/g);
    DouYinRoomID = DouYinRoomID ? DouYinRoomID[0] : defaultDouYinRoomID;

    rl.close();

    //连接数据库
    sqlmanage = new SQLManage('localhost', 'root', '1234', 'bilibilitopdown').connect();

    // 监听Socket
    const bilibiliWebSocket = new BilibiliSocket(BiliBiliRoomID);
    //转发Socket
    const pipeWebSocket = new datapipe(Pipe);
    //协议监听
    bilibiliWebSocket.onOpen = async () => {
        console.log((new Date()).toLocaleTimeString(), `已进入${bilibiliWebSocket.roomid}号房间`);
    };
    bilibiliWebSocket.onClose = async (e: any) => {
        console.log((new Date()).toLocaleTimeString(), `已退出${bilibiliWebSocket.roomid}号房间`);
    }
    bilibiliWebSocket.onError = async (e: any) => {
        console.log((new Date()).toLocaleTimeString(), `出现未知错误\n${e.message},正在重连房间`);
    }
    bilibiliWebSocket.onMessage = async (msg: any) => {
        //将数据中转出去
        pipeWebSocket.danmaku(msg);
    }
    bilibiliWebSocket.connect();


    //抖音的Socket
    const douyinWebSocket = new DouYinSocket(DouYinRoomID);


    douyinWebSocket.connect();
    // handleWebcast(DouYinRoomID, (name, content, html) => {
    //     // console.log(html);
    //     const data = JSON.stringify({ name, content, html });
    // //     io.clients.forEach((client) => {
    // //       client.send(data);
    // //     });
    //   });
    

    /**
     * 接收客户端发送过来的命令
     * @param data
     */
    pipeWebSocket.onMessage = async (data) => {
        let miniMsg = {};
        let sql: any;

        switch (data.cmd) {
            case "BiliBili_GetBilibiliUidForUser":
                //通过bilibili用户id获取用户是否存在
                sql = await sqlmanage.query(`select * from user where bilibiliUid = ${data.text}`)
                if (sql.length != 0) {
                    miniMsg = {
                        cmd: "BiliBili_GetBilibiliUidForUser",
                        text: true,
                        uid: data.text
                    }
                } else {
                    miniMsg = {
                        cmd: "BiliBili_GetBilibiliUidForUser",
                        text: false,
                        uid: data.text
                    }
                }

                pipeWebSocket.pub(miniMsg)
                break;

            case "BiliBili_SEND_GIFT":
                if (data.data.giftName == "粉丝团灯牌") {
                    //检查用户是否存在
                    sql = await sqlmanage.query(`select * from user where bilibiliUid = ${data.data.uid}`)

                    if (sql.length == 0) {
                        //添加用户
                        sqlmanage.query(`
                            insert into user
                            (phone,bilibiliUid,douyinUid,wechatOpenid,qq,money,isBlockade,isDelete)
                            values(null,${data.data.uid},null,null,null,0,0,0)
                            `)
                    }
                    break;
                }
        }
    }

    process.on('SIGINT', () => {
        console.log((new Date()).toLocaleTimeString(), '主动退出服务');
        bilibiliWebSocket.close();
        pipeWebSocket.close();
        process.exit(0);
    });
})();
