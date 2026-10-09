# OneShowLearn 工程维护

React + Express 模块化单体，SQLite WAL 保存业务状态，附件使用本地私有存储或已有 OSS 适配器。保留现有学习、支付、权限与内容模型，不为当前规模引入微服务。

## 本地开发与验收

使用 Node 22（最低 22.14）及其 npm 10，版本系列见 `.nvmrc`，包管理器基线见 `packageManager`。不要将真实环境文件、数据库、订单或上传附件放进测试环境。

```sh
nvm use
npm ci
npm run dev
```

开发账号/示例内容只在需要时显式执行 `npm run seed`；它不是线上升级或迁移步骤。

```sh
npm run check:engineering
npm run test:engineering
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

浏览器依赖从项目锁文件安装，不依赖某台电脑上的 Codex 目录。Linux 首次安装可用 `npx playwright install --with-deps chromium`。
课时浏览器验收还需要 FFmpeg，用于生成隔离的八秒测试视频。通过系统包管理器安装并放入 PATH，或显式设置 `FFMPEG_BIN`；CI 自动安装。线上视频播放和 API 服务不依赖此测试编码器，也不会重新处理真实课程视频。

打包验收和性能验收各自生成所需构建产物；干净 Git 检出后直接运行 `npm test`，无需先手动生成被忽略的 `dist/` 或准备本机课程课件。

## 发布与跨服务器迁移

通用容器部署、新站初始化、显式数据库迁移、备份恢复和代码回滚见 [部署手册](deploy/portable/README.md)。发布由不可变镜像 ID 标识；程序、数据、密钥分别管理。

GitHub Actions 自动运行工程检查、业务回归、构建、隔离浏览器检查和隔离容器部署演练。**CI 不持有线上密钥，不自动发布生产。** 工作流首次远端运行需要把审核后的改动提交并推送到仓库。

本轮本地验收：Linux / Node 22.23.3 容器内通过 469 项业务回归及 9 项工程测试；15 组隔离浏览器检查共 1,279 项通过（组内打印的子项不重复计数）；45 项容器部署演练通过，包括故意破坏迁移后的恢复、旧网页资源保留及数据库/密钥/附件迁移。线上发布、远端 CI 及清理记录见 [本次发布记录](docs/engineering-release-20261007.md)。真实支付/模型/SMS/邮件/OSS 操作不作为工程测试。

现有 `deploy/` 内历史发布脚本保持可用；新的 `deploy/portable/` 是独立流程，不自动接管当前服务器。当前生产工程发布使用 `deploy/update-engineering.sh`：校验预期在线文件、运行时依赖不变、生产副本无供应商请求演练，然后暂时让 API 返回带重试提示的 503，等待活跃任务结束，备份并仅切换 OneShowLearn 的少量服务模块与前端入口。失败回退代码而不回退当前数据；恢复原代理配置并核验数据库、公开价格、私有权限及其他服务不变。它是此次既有环境的受控发布脚本，不是跨服务器安装器。

发布输入必须包含经审核的源码、编译前端、`release.sha256` 和根据实际生产文件生成的 `live.sha256`，并位于严格限定的临时目录。不能复用历史预期哈希或跳过演练。跨服务器迁移请单独按部署手册停写、迁移数据和原加密密钥；不要用新站初始化命令覆盖现有商家配置。

## 维护原则

2026-10-08 商业化补齐已部署并通过线上只读验收，发布记录和后台操作见 [统计 / MinerU / 结业证书说明](docs/commercial-completion-20261008.md)。MinerU 密钥保持服务端私有，解析与体验采集待所有者开启，自动发证需确认完整正式课程目录；当前演示课时不能启用发证。本轮未提交或推送 Git。

- Git 仅管理源码、锁文件、测试和操作文档；密钥、数据库、附件与 QA 证据不提交。
- 正式镜像从干净的 Git 版本构建；先在隔离环境验收再批准上线。
- 升级只执行迁移，不导入演示数据、不重设管理员、不更改价格或历史订单。
- 代码回滚不等于数据恢复；新增迁移应保持向后兼容，数据恢复必须单独确认。
- SQLite 采用单机单写入实例。不得把一个 SQLite 文件挂在多台服务器的网络盘上共同写入。跨机迁移必须停写、备份并切换，不能并行运营同一份支付订单。

现有产品、课程内容和运营配置是否可正式交付，需要独立验收，不能从工程工具完善推导为全部功能或内容已经完成。
### Read-only commercial operations checks (October 9)

`npm run check:operations -- --origin http://127.0.0.1:8791 --data-dir /absolute/instance/data --backup-dir /absolute/verified-backup` checks `/api/ready`, data-volume free space (10% threshold), and an explicitly selected `oneshowlearn-backup-v1` backup's full file hashes and recorded creation time (48 hours by default). New portable backups record `createdAt`; existing backups without it retain hash/restore compatibility but cannot pass freshness checks. Copying a manifest does not refresh its recorded backup time. It performs no writes, restart, backup creation, deletion, provider request or credential output. Missing configuration and failures exit nonzero rather than claiming readiness. Existing systemd release backups use a different format and are not silently accepted as portable backups. A successful hash check does not prove application restore, off-site storage or a scheduled backup; continue isolated restore rehearsals and deliberately arrange the storage destination and stop-write window. No scheduler or alert channel is installed by this tool.

`npm run check:dependencies` uses the official npm registry, checks production dependencies at high severity, and fails closed on audit/TLS/network errors. CI now includes this gate; failure to obtain advisories is not a clean security result. Keep TLS verification enabled. No runtime dependency version has been changed by this refinement.

The Nginx HTTP/HTTPS templates now separate exact GET/HEAD account-information endpoints from login and verification operations. Login/registration/code requests and unknown paths retain the original 10/minute plus burst-10 guard; selected read-only account endpoints have a separate 120/minute plus burst-30 budget. Apply paired HTTP-level maps/zones and the application snippet only in a separately authorized production publication, after `nginx -t`, backup and read/mutation acceptance. These repository edits do not modify the running proxy.
