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

现有 `deploy/` 内发布脚本是各次受控发布的历史输入，不能直接复用；新的 `deploy/portable/` 是独立流程，不自动接管当前服务器。2026-10-10 发布使用新生成的 `deploy/package-commercial-refinement.mjs` / `deploy/update-commercial-refinement.sh`：校验实际在线文件与审核后的依赖差异、生产副本无供应商请求演练，然后暂时让 API 返回带重试提示的 503，等待活跃任务结束，备份并切换已审核模块、依赖、前端与本站代理。失败回退代码而不回退当前数据；恢复原代理配置并核验数据库、公开价格、私有权限及其他服务不变。这是此次既有环境的受控发布，不是跨服务器安装器。

发布输入必须包含经审核的源码、编译前端、`release.sha256` 和根据实际生产文件生成的 `live.sha256`，并位于严格限定的临时目录。不能复用历史预期哈希或跳过演练。跨服务器迁移请单独按部署手册停写、迁移数据和原加密密钥；不要用新站初始化命令覆盖现有商家配置。

## 维护原则

2026-10-08 商业化补齐已部署并通过线上只读验收，发布记录和后台操作见 [统计 / MinerU / 结业证书说明](docs/commercial-completion-20261008.md)。MinerU 密钥保持服务端私有，解析与体验采集待所有者开启，自动发证需确认完整正式课程目录；当前演示课时不能启用发证。该补齐及后续精修源码已于 2026-10-10 提交并推送 Git。

- Git 仅管理源码、锁文件、测试和操作文档；密钥、数据库、附件与 QA 证据不提交。
- 正式镜像从干净的 Git 版本构建；先在隔离环境验收再批准上线。
- 升级只执行迁移，不导入演示数据、不重设管理员、不更改价格或历史订单。
- 代码回滚不等于数据恢复；新增迁移应保持向后兼容，数据恢复必须单独确认。
- SQLite 采用单机单写入实例。不得把一个 SQLite 文件挂在多台服务器的网络盘上共同写入。跨机迁移必须停写、备份并切换，不能并行运营同一份支付订单。

现有产品、课程内容和运营配置是否可正式交付，需要独立验收，不能从工程工具完善推导为全部功能或内容已经完成。
### Read-only commercial operations checks (October 9)

`npm run check:operations -- --origin http://127.0.0.1:8791 --data-dir /absolute/instance/data --backup-dir /absolute/verified-backup` checks `/api/ready`, data-volume free space (10% threshold), and an explicitly selected `oneshowlearn-backup-v1` backup's full file hashes and recorded creation time (48 hours by default). New portable backups record `createdAt`; existing backups without it retain hash/restore compatibility but cannot pass freshness checks. Copying a manifest does not refresh its recorded backup time. It performs no writes, restart, backup creation, deletion, provider request or credential output. Missing configuration and failures exit nonzero rather than claiming readiness. Existing systemd release backups use a different format and are not silently accepted as portable backups. A successful hash check does not prove application restore, off-site storage or a scheduled backup; continue isolated restore rehearsals and deliberately arrange the storage destination and stop-write window. No scheduler or alert channel is installed by this tool.

`npm run check:dependencies` uses the official npm registry, checks both production and build/development dependencies at high severity, and fails closed on audit/TLS/network errors. Failure to obtain advisories is not a clean security result. Keep TLS verification enabled. The October 10 owner-approved security repair pins affected dependencies and their required browser metadata; it supersedes the earlier retained-runtime-only release scope. Existing systemd publication uses fresh `deploy/package-commercial-refinement.mjs` and `deploy/update-commercial-refinement.sh` inputs with schema/data/environment protection, not the historical October 8 migration package.

The Nginx HTTP/HTTPS templates separate exact GET/HEAD account-information endpoints from login and verification operations. Login/registration/code requests and unknown paths retain the original 10/minute plus burst-10 guard; selected read-only account endpoints have a separate 120/minute plus burst-30 budget. The paired maps/zones and application snippet were published on October 10 after backup and actual old-to-new hot-reload acceptance, using a distinct write-zone name to avoid changing the old shared-memory key. Future publications require fresh live hashes and paired review; do not blindly overwrite the production site's TLS/custom settings.

### October 10 verified publication

Runtime source: `54ba72a`; [full CI acceptance](https://github.com/YulongLee/oneshowLearn/actions/runs/37966578621) passed, including 512 business regressions, 17 engineering tests, 1,374 isolated browser checks, 65 actual proxy checks and container deployment/recovery tests. Official-registry full audit and candidate production audit reported zero vulnerabilities at publication; TLS verification was retained. CI proxy acceptance uses its freshly tagged web build, not a machine-specific base-image cache.

Fresh stage `/tmp/oneshowlearn-refinement-qWReavM2`; root-only recoverable backup `/var/backups/oneshowlearn/refinement-xR6K2rbn`, receipt time `2026-10-09T17:41:39.622Z` (October 10 in Asia/Shanghai). Existing systemd service is healthy after the controlled restart (PID 2863067, NRestarts 0). All 74 existing schemas and 71 complete non-transient business tables are preserved; prices/catalogue/private records/environment and unrelated services are unchanged. Provider-blocked copy rehearsal protected all 74 table values. No schema migration, supplier request, activation, Docker takeover or cleanup occurred.

41 HTTPS entry hashes, 144 exact assets and 178 live read-only browser checks passed after publication, with no browser errors, writes or external requests. Final post-browser database, configuration, runtime and backup hashes passed. Frontend entry SHA256 is `6c08765ae54563075e0762eee6cec303f5d84032ab3d51cb2984faf9f19841b6`; lock SHA256 is `bcb75539f79ceafea43c8b2965ae8a81e0279c57541283aee3b3182c243c75ef`. Backup retains the consistent pre-cutover database, private environment/keys, original code/runtime/frontend/proxy and local attachments; rollback restores code/runtime/frontend/proxy only, never an old database over current records. Backup hash verification is not an off-site backup or a live data-restore claim.
