import axios from 'axios';

//获取真实房间号
const getbilibiliroomid = async (roomid: any) => {
    let data = await axios.get(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${roomid}`)
        .then(res => {
            return res.data;
        })
        .catch(error => {
            return null;
        });
    return data;
}

//获取哔哩哔哩用户图片地址
const getbilibiliurl = async (uid: any) => {
    let data = await axios.get(`https://tenapi.cn/bilibili/?uid=${uid}`)
        .then((res: any) => {
            return res.data;
        })
        .catch((error: any) => {
            return null;
        });
    return data;
}

export { getbilibiliroomid, getbilibiliurl }