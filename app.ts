///入口文件
import datapipe from './src/datapipe';
import BilibiliSocket from "./src/bilibiliSocket";
import SQLManage from "./src/sqlManage";
import readline from "readline";
import { getbilibiliroomid } from './src/axiosManage';


/**
 * 数据库
 */
let sqlmanage: SQLManage;

//默认房间号
let defaultRoomID = 25591667;
//默认端口
let defaultPipe = 888;

//房间号
let RoomID: any;
//端口
let pipe: any;

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


    const answer: any = await question(`请输入BiliBili直播地址(${defaultRoomID})：`);
    // let res = request('GET', `https://api.live.bilibili.com/room/v1/Room/room_init?id=${answer.match(/\d+/g)[0]}`);
    // console.log(res.getBody());
    RoomID = answer.match(/\d+/g);
    RoomID = RoomID ? RoomID[0] : defaultRoomID;

    //获取真实房间id
    let roomidData = await getbilibiliroomid(RoomID);
    RoomID = roomidData.data.room_id

    const answer2: any = await question(`请输入转发端口(${defaultPipe})：`);
    pipe = answer2.match(/\d+/g);
    pipe = pipe ? pipe[0] : defaultPipe;

    rl.close();

    //连接数据库
    sqlmanage = new SQLManage('localhost', 'root', '1234', 'bilibilitopdown').connect();

    // 监听Socket
    const bilibiliWebSocket = new BilibiliSocket(RoomID);
    //转发Socket
    const pipeWebSocket = new datapipe(pipe);
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

    /**
     * 接收客户端发送过来的命令
     * @param data 
     */
    pipeWebSocket.onMessage = async (data) => {
        let miniMsg = {};
        let sql: any;

        switch (data.cmd) {
            case "LWS_GetBilibiliUidForUser":
                //通过bilibili用户id获取用户是否存在
                sql = await sqlmanage.query(`select * from user where bilibiliUid = ${data.text}`)
                if (sql.length != 0) {
                    miniMsg = {
                        cmd: "LWS_GetBilibiliUidForUser",
                        text: true,
                        uid: data.text
                    }
                } else {
                    miniMsg = {
                        cmd: "LWS_GetBilibiliUidForUser",
                        text: false,
                        uid: data.text
                    }
                }

                pipeWebSocket.pub(miniMsg)
                break;

            case "SEND_GIFT":
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
