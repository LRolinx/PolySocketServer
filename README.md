# PolySocketServer

采集 B 站、抖音直播间消息，转发到本机 WebSocket。支持评论、礼物、进房；抖音还支持点赞消息。

## 运行

需要 Node.js 22.12+、pnpm 11，以及 Chrome 或 Edge。抖音使用独立无头浏览器，不读取个人浏览器资料。单纯转发弹幕无需 MySQL。

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

编辑 `.env` 中的 `BILIBILI_ROOM_ID` 和 `DOUYIN_ROOM_ID`，填写房间号或完整的 HTTPS 直播间地址。`0` 表示关闭该平台。随后启动：

```powershell
pnpm start
```

没有环境配置时，终端启动会询问端口和房间。非交互启动默认关闭两个平台，仅启动转发服务。

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `888` | 本地转发端口 |
| `BILIBILI_ROOM_ID` | `0` | B 站房间号或地址 |
| `DOUYIN_ROOM_ID` | `0` | 抖音网页房间号或地址 |
| `DOUYIN_BROWSER_PATH` | 自动检测 | Chrome / Edge 可执行文件路径 |
| `DOUYIN_USER_AGENT` | 内置桌面 UA | 抖音浏览器 User-Agent |
| `MYSQL_ENABLED` | `0` | 设为 `1` 启用原有用户数据库命令 |

## 采集接口

| 平台 | 接口 | 用途 |
| --- | --- | --- |
| B 站 | `https://api.live.bilibili.com/room/v1/Room/room_init` | 解析真实房间号 |
| B 站 | `https://api.bilibili.com/x/web-interface/nav` | 获取 WBI 密钥 |
| B 站 | `https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo` | WBI 签名获取 token 和动态服务节点 |
| B 站 | `wss://{host}:{wss_port}/sub` | 认证、30 秒心跳、实时消息 |
| 抖音 | `https://live.douyin.com/webcast/im/fetch/` | 网页初始化及 HTTP 消息拉取 |
| 抖音 | `wss://{动态节点}/webcast/im/push/v2/` | 网页建立的实时推送连接 |

B 站自动获取匿名 `buvid3`，支持 zlib、Brotli 以及 `INTERACT_WORD_V2`、`SEND_GIFT_V2` 的 protobuf 数据。礼物批次中的每项分别转发。断线时刷新连接信息并延迟重连。

抖音通过 Puppeteer 监听网页实际收到的 HTTP / WebSocket 数据，解析 gzip 和 protobuf；签名、心跳和 ACK 由直播网页处理。连接不依赖写死的房间、签名、游标或聊天 DOM。消息 ID 用于去重，断线后重新打开直播页获取新连接。

这些是网页使用的接口，平台变更仍可能影响采集。匿名模式可能缺少平台限制的用户信息或礼物事件；直播间下播、页面验证和网络限制会导致连接失败。程序不会把网页加载成功当作采集成功。

## 本地转发

客户端连接 `ws://127.0.0.1:888`（或配置的端口），接收 JSON：

```json
{"cmd":"BiliBili_DANMU_MSG","text":"你好","uid":123,"name":"观众"}
```

```json
{"cmd":"DouYin_DANMU_MSG","id":"消息ID","roomid":"真实房间ID","uid":"用户ID","name":"观众","text":"你好"}
```

| 命令 | 内容 |
| --- | --- |
| `BiliBili_DANMU_MSG` | 普通评论、超级留言及进房提示，保留原有格式 |
| `BiliBili_SEND_GIFT` | 礼物或舰长购买，包含 `giftName`、`giftId`、`num`、`price` |
| `DouYin_DANMU_MSG` | 评论 |
| `DouYin_SEND_GIFT` | 礼物，包含 `giftName`、`giftId`、`num`、`price`、`groupId`、`combo`、`repeatEnd` |
| `DouYin_MEMBER` | 进房 |
| `DouYin_LIKE` | 点赞，`num` 为本次数量，`total` 为累计数量 |

抖音 ID 和 B 站 protobuf 用户 ID 使用字符串，避免 64 位整数精度丢失。抖音礼物 `num` 是该组连击的累计数量，客户端按 `groupId` 计算增量，避免重复计数；`repeatEnd` 表示连击结束。抖音 `price` 为单件钻石数，B 站 `price` 保留上游原值，两个平台的价格单位不同。

客户端发送无效 JSON 会收到 `ERROR`，服务继续运行。采集到的上游消息不会触发数据库命令回调。

## 检验

```powershell
pnpm check
pnpm test
pnpm verify:live --bili 1716079620 --douyin 708764876300 --seconds 45 --output resource/interface-verification.json
```

实况命令里的房间是验证样本；重新检验时应换成正在直播、有评论活动的房间。验证要求 B 站认证成功、收到心跳应答及真实评论；抖音收到 WebSocket 后续评论；两个平台的评论均送达本地 WebSocket 客户端；过程中没有采集错误。条件缺失时退出码为 `1`。

最近一次结果见 [接口验证记录](resource/interface-verification.json)。记录只保存时间、节点、消息计数和错误，不保存评论内容、用户资料或临时认证 token。协议测试覆盖压缩包、批量礼物、64 位 ID、错误输入、广播及应用启动。未在实况中发生的礼物或点赞事件以协议样例测试覆盖，不代表已完成实况送礼验证。

## 可选数据库

原有 `BiliBili_GetBilibiliUidForUser` 和 `BiliBili_SEND_GIFT` 用户注册命令需要 MySQL。导入 `resource/bilibilitopdown.sql` 后，在 `.env` 设置 `MYSQL_ENABLED=1`，并配置 `MYSQL_HOST`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`。默认关闭，密码不写入源码。数据库命令使用参数化查询。

第三方协议字段的来源和授权见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
