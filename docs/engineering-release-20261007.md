# 工程发布与安全清理记录 · 2026-10-07

## 线上发布

业主授权提交当前已审核代码、更新线上服务、自测通过后清理无用文件。本次保留既有 systemd / Nginx 服务，并未将真实账号、数据库和商家密钥切换到新建 Docker 安装。

- 已上线运行时代码：`341177b7b760cdfba8ee21aeb8a67809ad8d1e3c`。
- 后续 Git 修正只涉及干净检出的测试准备、诊断输出及 Docker 未开放端口的验收兼容；最近代码版本 `fd73254`。
- 发布归档 SHA256：`f73e9a56417430164a42a6892db625c6f17ca726c1554c9ebbbdefd8fc18a00c`。
- 当前工程暂存目录：`/tmp/oneshowlearn-engineering-hA5dydRV`，本次保留。
- 可恢复备份：`/var/backups/oneshowlearn/engineering-cYzncjLF`，含旧代码、依赖、环境、前端、停写快照和本地附件。本次保留全部历史生产备份。
- 前端入口 SHA256：`776914b6852ba71eaa2f794569b8c6f3af2a668fe318bf0601a993d51b3ef9c9`，与发布前相同。工程更新不改变已批准页面。

发布前校验预期在线文件、运行时依赖版本及完整性，生产数据库一致副本演练时禁止供应商传输。API 暂时以可重试 503 停止接入，活跃支付/模型/上传任务检查通过后仅重启 OneShowLearn。保留旧静态资源、采用原子入口替换；失败恢复代码而不回退业务数据库。环境、站点及其他服务均保持不变。

## 验收证据

- 469 项业务回归，9 项工程测试；干净 Linux / Node 22.23.3 容器构建成功。
- 15 组隔离浏览器检查共 1,279 项，通过。原 1,299 汇总重复加入了组内 20 项子检查，本记录以各组最终计数为准。
- 45 项真实隔离容器部署演练通过；新建空站、升级、活跃任务拒绝、故意破坏迁移后的恢复、代码回滚及备份恢复均验证，不使用生产账号或供应商。
- 线上 41 个 HTTPS 入口和 141 个静态资源精确哈希核对；92 项响应式首页检查和 32 项跨路由匿名浏览器检查通过，无脚本错误、外部供应商或写请求。
- 68 张表结构、65 张业务表全量值保护、当前账号只读访问和匿名权限检查通过。仅排除自动过期的认证/租约记账；价格、目录、登录及服务配置不变。
- 数据库 `quick_check=ok`，外键异常为 0；OneShowLearn 就绪接口正常，`NRestarts=0`。Nginx、OneShowSEO、PocketLedger 主进程身份与重启计数不变。
- 桌面及移动端线上截图保存在被 Git 忽略的 `artifacts/homepage-commercial/live/` 和 `artifacts/functional-hardening/live/`。

远端验收：[GitHub Actions](https://github.com/YulongLee/oneshowLearn/actions/runs/37541725842) 整体成功，代码版本 `fd73254eba05509a0c75526c87873b9aece46fdc`。Linux Docker 会为镜像声明但未发布的端口返回 `null`；修正验收脚本处理这种格式，并新增测试，仍拒绝公开、缺失或意外的端口绑定。没有因验收格式问题修改线上端口配置。

最新干净本地镜像：`oneshowlearn-api:engineering-20261007-release` / `oneshowlearn-web:engineering-20261007-release`；源码哈希 `4cc3dd775e9d7117e1e69a9e04dcee4278d406045fabbe243adba9ca27eb1807`，配对记录位于被忽略的 `artifacts/releases/engineering-20261007-release.json`。镜像与当前既有服务独立，不自动接管线上数据。

## 清理边界

全部验收通过后于北京时间 2026-10-07 06:47 执行清理。预先核验精确目标、无活动进程持有及正式备份存在，不使用目录通配符或全局 prune：

- 服务器七个废弃暂存目录：`/tmp/oneshowlearn-homepage-cEGBmXnK`、`/tmp/oneshowlearn-homepage-nWzmYsiD`、`/tmp/oneshowlearn-homepage-MKwnfRdC`、`/tmp/oneshowlearn-hardening-0LnqBOlq`、`/tmp/oneshowlearn-favorite-source-bZaFeDZO`、`/tmp/oneshowlearn-favorite-source-rwc2WNhY`、`/tmp/oneshowlearn-engineering-HF1PpIHy`，已全部移除，释放已分配文件空间 743,211,008 字节。
- 本地冗余初版发布目录 `/private/tmp/oneshowlearn-engineering-package-77x24n` 及其 `.tgz`，释放 20,832,256 字节。最终发布归档仍保留。
- 移除两个从未启动的本项目测试容器 `elated_keller` / `distracted_jang`，未删除其绑定的源码目录或任何卷。
- 移除 `oneshowlearn-api` / `oneshowlearn-web` 的 `engineering-qa`、`engineering-20261007`、`engineering-20261007-v2` 六个旧镜像标签，先确认无容器依赖。保留 `engineering-20261007-final` 与最新 `engineering-20261007-release` 镜像。共享镜像层或构建缓存未计入释放量，未做全局缓存/卷清理。

文件清理合计 764,043,264 字节，约 0.76 GB；不重复计算 Docker 共享层。服务器凭据保护清理回执保存在 `engineering-cYzncjLF/cleanup-20261007.json`，本地回执为被忽略的 `artifacts/engineering/cleanup-local-20261007.json`。服务器剩余空间约 37 GB。

清理后再次通过 HTTPS 68 张表结构/65 张业务表值/权限/价格配置保护检查，依赖、受保护文件及其他服务身份不变，就绪接口正常，OneShowLearn 主进程 `803135`、重启计数 0。清理未触发服务重启。另有 32 项只读跨路由浏览器复核通过，包含已知/未知/旧路由、私有访问保护、¥499 价格和 320–1440px 布局，无脚本错误、外部供应商或写请求。

不会清理真实课程视频/PPT、原始与生成品牌素材、上传内容、生产数据库/密钥、历史生产备份、当前发布暂存和归档、其他项目的容器/卷/镜像或共享 Docker 构建缓存。删除后的临时产物可从 Git 重建，历史恢复依赖保留的正式备份；不会宣称删除文件可直接从回收站恢复。

工程验收不等于真实供应商、完整课程交付或多机写入验收。跨服务器迁移仍须独立停写和保护原数据/加密密钥，不能使用新站初始化覆盖真实商家环境，也不宣称零停机或多节点 SQLite。
