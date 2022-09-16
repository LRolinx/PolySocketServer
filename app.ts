///入口文件
import datapipe from './src/datapipe';
import BilibiliSocket from "./src/bilibiliSocket";
import readline from "readline";
import axios from 'axios';
import mysql from 'mysql';

// const conn = mysql.createConnection(
//     {
//         host: 'localhost',
//         user: 'root',
//         password: '123',
//         database: 'bilibili'
//     }
// )

// conn.connect((err: any) => {
//     console.log("Mysql连接状态->", err);
// })

//默认房间号
let defaultRoomID = 25591667;
//默认端口
let defaultPipe = 888;

//房间号
let RoomID: any;
//端口
let pipe: any;

//获取真实房间号
async function getbilibiliroomid(roomid: any) {
    let data = await axios.get(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${roomid}`)
        .then(res => {
            return res.data;
        })
        .catch(error => {
            return null;
        });
    return data;
}


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

    // WebSocketTest(bilibiliClient);

    // 监听Socket
    const bilibiliWebSocket = new BilibiliSocket(RoomID);
    //转发Socket
    const pipeWebSocket = new datapipe(pipe);
    //协议监听
    bilibiliWebSocket.onOpen = async function () {
        console.log((new Date()).toLocaleTimeString(),`已进入${bilibiliWebSocket.roomid}号房间`);
    };
    bilibiliWebSocket.onClose = async function (e: any) {
        console.log((new Date()).toLocaleTimeString(),`已退出${bilibiliWebSocket.roomid}号房间`);
    }
    bilibiliWebSocket.onError = async function (e: any) {
        console.log((new Date()).toLocaleTimeString(),`出现未知错误\n${e.message},正在重连房间`);
    }
    bilibiliWebSocket.onMessage = async function (msg: any) {
        //将数据中转出去
        pipeWebSocket.danmaku(msg);
    }
    bilibiliWebSocket.connect();

    process.on('SIGINT', function () {
        console.log((new Date()).toLocaleTimeString(),'主动退出服务');
        bilibiliWebSocket.close();
        pipeWebSocket.close();
        process.exit(0);
    });
})();
