# 首页备案号上线记录

2026-09-29，按用户明确请求发布至腾讯云上海既有 `oneshowlearn.com` 站点。

- 官网首页底部居中展示用户提供的 `浙ICP备2026052190号-4`，链接 `https://beian.miit.gov.cn/`，新窗口打开并设置 noopener/noreferrer。未独立核验备案记录，未添加公安备案号。
- 仅发布前端；未变更课程、用户、数据库、配置或后端代码，未运行 seed、重启或重载服务。
- 发布前构建、33 项平台测试、4 项 Sites 测试通过。上一轮本地 320/390/768/1440/1920/2560px 检查备案链接居中且无溢出。
- 服务端及本机分别验证 21 个 HTTPS 页面入口、35 个资源文件哈希，API 健康及匿名权限保护通过。线上浏览器调用超时，不计作线上视觉验收。
- OneShowLearn PID 2008471、Nginx PID 543821，均 active、异常重启 0，与发布前一致。
- 备份：`/var/backups/oneshowlearn/frontend-QsnyeWOW/client`。保留旧资源，可通过恢复旧入口回退。
- 暂存：`/tmp/oneshowlearn-platforms-icp-20260929-87M0HcOU`。
- 本地归档：`/tmp/oneshowlearn-icp-20260929-eoxgz8dq/frontend.tar.gz`。打包排除 macOS 扩展属性与旁文件。
- 归档 SHA-256：`50af1a49c52a8235725e0e93490256cefd3d8a18bf3fe2ee5787e1901ca1ed8e`。
- 入口 SHA-256：`8e08d50633658f8c27bb5b18cfcf1da8d73e7bb63d4f3e1dcd7300a4e74bd8af`。
- 当前 JS：`index-DETC6QXi.js`；CSS：`index-CA3aYHbs.css`。
- 当前工作区构建，未执行 Git 提交或推送。
