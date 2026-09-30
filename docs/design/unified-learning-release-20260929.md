# 学习课程合并版生产发布

日期：2026-09-29。按用户明确部署请求，发布到腾讯云上海 `124.223.104.160` 的既有 `https://oneshowlearn.com`。

## 范围与验证

- 仅更新前端静态资源及入口，合并侧栏“学习课程”、页内完整路线、旧 `/paths` 和阶段链接兼容。
- 发布前重新构建与完整自测：平台 32、API 42、Sites 4，共 78 项通过。已有大包体积提示仍在。
- 未上传本地数据库、用户记录、课程映射或凭据；未发布后端模块、修改配置、运行 seed 或重启服务。旧资源保留，入口原子替换。
- 服务端正式 HTTPS 校验通过 21 个入口及暂存资源；本机独立校验 21 个入口及 35 个构建资源 SHA-256 完全匹配。服务端归档解压包含 macOS 元数据旁文件，因此服务端资源总数为 70；业务构建资源为 35。
- API 健康、资源目录以及匿名访问个人数据/后台的 401 保护通过；验收只读，无生产测试数据写入。
- OneShowLearn PID 2008471、Nginx 543821、OneShowSEO 1047623、PocketLedger 2079556 均保持不变，active，异常重启次数 0。
- 线上浏览器打开调用超时，没有完成线上截图验收；不将该调用作为视觉验证成功。布局和交互依据上一轮同一构建的本地检查，详见 `unified-learning-20260928.md`。

## 发布与回退记录

- 前端备份：`/var/backups/oneshowlearn/frontend-zrElcr2X/client`。可恢复备份入口回退，不覆盖数据库。
- 远端暂存：`/tmp/oneshowlearn-platforms-learning-20260929-VQd0lYzw`。
- 本地归档：`/tmp/oneshowlearn-learning-20260929-rP9ooiSz/frontend.tar.gz`。
- 归档 SHA-256：`a7e335960378d86394da1f8a0e6d721c8c0212274a907efbf37024753f579e8f`。
- 入口 SHA-256：`40ece37b6e7906a08995381a05f514c1bf4106187fc592b399fb22853fa3e3ff`。
- JS：`index-1RSs8HAX.js`；CSS：`index-CiFagUgA.css`。
- 从当前工作区构建发布，未提交或推送 Git。
