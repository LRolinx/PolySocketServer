# PolySocketServer

采集 B 站和抖音直播间弹幕，并通过本地 WebSocket 转发。

## 环境

- Node.js 18 或更新版本
- MySQL

安装依赖并启动：

```bash
pnpm install
pnpm start
```

启动时按提示输入转发端口、B 站房间地址和抖音房间地址。数据库结构见 `resource/bilibilitopdown.sql`，连接配置在 `app.ts`。

## B 站

启动时通过 `room_init` 解析真实房间号，再获取 WBI 密钥和 `buvid3`，签名请求 `getDanmuInfo` 取得弹幕 token 与 WebSocket 节点。连接使用服务端返回的节点和 token；消息解析支持 zlib v2、Brotli v3，并在断线后重新获取连接信息再重连。

## 抖音

当前入口使用 Puppeteer 读取直播页面渲染出的聊天内容。抖音页面结构变化可能影响采集。`DouYinSocket.connect()` 中的旧 WebSocket 地址不是当前入口使用的链路。

## 转发

默认监听地址为 `127.0.0.1`。启动时可设置端口，客户端连接后接收 JSON 弹幕消息。
