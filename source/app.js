const datapipe = require('./datapipe');
const BilibiliSocket = require("./new")
const readline = require("readline");
const axios = require('axios');
const mysql = require('mysql');

const conn = mysql.createConnection(
    {
        host: 'localhost',
        user: 'root',
        password: '123',
        database: 'bilibili'
    }
)

conn.connect((err) => {
    console.log("Mysql连接状态->", err);
})

//房间号
let bilibiliClient;
//端口
let pipe;

//获取真实房间号
async function getbilibiliroomid(roomid) {
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

function rlPromisify(fn) {
    return async (...args) => {
        return new Promise(resolve => fn(...args, resolve));
    };
}

const question = rlPromisify(rl.question.bind(rl));
(async () => {


    const answer = await question("请输入BiliBili直播地址：");
    // let res = request('GET', `https://api.live.bilibili.com/room/v1/Room/room_init?id=${answer.match(/\d+/g)[0]}`);
    // console.log(res.getBody());
    bilibiliClient = answer.match(/\d+/g);
    bilibiliClient = bilibiliClient ? bilibiliClient[0] : 24393
        ;

    //获取真实房间id
    let roomidData = await getbilibiliroomid(bilibiliClient);
    bilibiliClient = roomidData.data.room_id

    const answer2 = await question("请输入转发端口：");
    pipe = answer2.match(/\d+/g);
    pipe = pipe ? pipe[0] : 888;

    rl.close();

    // WebSocketTest(bilibiliClient);

    // //房间号
    bilibiliClient = new BilibiliSocket(bilibiliClient);
    //端口
    pipe = new datapipe(pipe);
    //协议监听
    bilibiliClient.onOpen = async function () {
        console.log(`已进入${bilibiliClient.roomid}号房间,等待客户端连接即可转发`);
    };
    bilibiliClient.onClose = async function (e) {
        console.log(`已退出${bilibiliClient.roomid}号房间`);
    }
    bilibiliClient.onError = async function (e) {
        console.log(`出现未知错误\n${e.message},正在重连房间`);
    }
    bilibiliClient.onMessage = async function (msg) {
        //将数据中转出去
        pipe.danmaku(msg);
    }
    bilibiliClient.connect();
})();
