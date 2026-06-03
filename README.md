# 黑白棋小局

一个适合微信浏览器打开的双人黑白棋房间原型。

## 本地运行

```bash
npm start
```

如果本机没有 npm，也可以直接运行：

```bash
node server.js
```

打开：

```text
http://127.0.0.1:8080/
```

进入页面后，点右上角分享按钮会创建房间链接。另一台设备打开同一个链接会加入白棋。

## 部署到公网

这个项目是零依赖 Node 服务，部署平台只需要支持 Node Web Service。

推荐配置：

```text
Build Command: 留空，或 npm install
Start Command: npm start
```

服务端已经使用：

```js
process.env.PORT || 8080
0.0.0.0
```

所以可以适配 Render、Railway、Fly.io 这类会自动注入 `PORT` 的平台。

## 重要说明

- 当前房间数据保存在服务器内存里。
- 服务重启后，房间会消失。
- 免费托管平台可能会休眠，第一次打开会慢一点。
- 想长期稳定保存战绩或房间，需要下一步接数据库。
