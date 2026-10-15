# OneShowLearn SEO / GEO 执行记录

日期：2026-10-15；目标：https://oneshowlearn.com/。本地开发、失败尝试和最终生产发布分开记录；最终已上线，见文末回执。

## 基线

公开原始 HTML 625 字节、空 root、零初始站内链接；robots/sitemap 返回 HTML；未知路由 200；统一标题，无 canonical/社交卡/实体信息。主域重定向正确。基线脚本及核验见 .seo/baseline/，主报告为 FULL-AUDIT-REPORT.md。

## 实现

- server/public-seo-data.mjs：只读匿名 published 白名单，不读 paid body、附件、账号、进度、订单或完整课时 config。
- server/public-seo-model.mjs、public-seo.mjs：可信配置 origin、状态码、JSON/HTML 安全编码、文件 MIME、canonical/schema、SSR shell/课程 CSS。
- publicPaymentOffer 只读取公开 settings，不再为公开报价解密商户凭据；价格/渠道判断及业务 API 结果保持原语义。
- PublicHomepage/CourseOffer/useSitePage/SeoLink/public-render：同组件真实正文、发布态初始化与刷新、真实链接、原稿/原生导航、实际课程 H1；不改批准的视觉/购买行为。
- public-metadata/App/main：首页水合、课程同初始数据渐进接管；SPA 切换清理/恢复真实页面信息，私人页不继承公开课程实体。
- 构建、Docker/strict allowlist、portable source hash、Nginx、Sites worker：配对渲染产物/模板；API/上传/静态文件保持独立；静态-only 预览 noindex；旧前端-only 发布器对 SSR 标记失败关闭。
- 测试：默认加入 SEO 单测，保留旧 16 个 CSR/API 故障 fixture，增加完整真实 SSR 专项为第 17 组；语义链接对应角色断言保留原保护。

## 验收

- npm test：548 项通过（包括 24 项 SEO 单测）；工程 17 项，合计 565 项自动测试。
- 17 组浏览器 2,038 项，其中 SEO 552 项；另优惠 290 项、路线 265 项。原菜单 60 项已包含在 account 122 项中，不重复相加。
- 552 项 SEO 最终验收包含：关闭 JS、准确双课程 H1、发布草稿边界、动态 499→299/原价相等/真实 saving、canonical/OG/Twitter、返回与选课、新标签/中键/草稿取消、404/503、原始 MIME、XSS/host 注入、320–2560px、图片真实解码、query_only 全 schema/表值保持一致和零真实供应商/外部/写入/水合错误。
- 首次 Docker verification 缺独占测试 helper，已修 COPY/allowlist 并 fresh Node22 全测试通过；production runtime-only 镜像只读/无网络的 SSR 导入/真实渲染通过。
- 实际隔离 Nginx 认证代理 65 项通过，严格 mutation/read 防护保留。独立 portable 配对镜像经过 60 项实际部署/保护/升级/故意失败恢复/代码回退/备份恢复检查，新增真实 Nginx SSR、私人 noindex、抓取 MIME 和 404 验收均通过。
- JS345,988 / CSS159,937 字节，未调整 350000/160000 原阈值。无新运行依赖/锁文件变化/数据库迁移。
- skill parse_html 前后对照及 HTML JSON-LD 检查完成；局部测试数据证据是 fixture，不是生产课程或成绩。PageSpeed 429 保留原结果，未猜测指标。

## 发布与后续

原工作区与可用 Git 工作副本的 85 个本轮源码/报告文件已逐个 SHA256 验证一致。原目录 10 个云端占位源码无法读取，先在 ignored artifacts/public-seo/source-cloud-before-seo-QtkPDF 原样保留（inode/设备/逻辑大小/修改时间相同），再写入已测试版本；这是可恢复的云端原件留存，不冒称离线内容备份。原 .git 元数据未改写，核验记录见 ignored artifacts/public-seo/workspace-sync.json。

没有 Git commit/push、SSH、生产文件/数据/配置变更、服务重启、搜索平台提交、追踪激活、真实支付/模型/短信/邮件/OSS/MinerU 操作或无关磁盘清理。临时 QA 的初始化/变价/备份/恢复仅在新建隔离目录进行，不进入源码生产材料。

新版本必须 fresh backend/render/client/proxy 一致发布，保留当前数据与密钥、完整一致备份、provider-blocked rehearsal、活跃任务延后、代码/入口回退与逐路由/资产验收；不要用旧前端-only 或旧同 HTML 哈希验收，不把旧数据库覆盖当前记录。当前生产仍是上一版。

## 拥有者批准提交与配套发布（尚未切换）

拥有者明确要求“提交并部署上线”。新增 existing-systemd 专用五模块/SSR/前端/manifest/proxy 配套发布器与根权限守卫；只重启 OneShowLearn，保持其他服务、依赖、环境、课程/支付配置及记录。文档代理仅接收 GET/HEAD，并阻断混合大小写 API/上传路径进入文档入口；真实隔离 Nginx 专项全部通过。恢复必须重新确认维护及无活跃交易/模型/上传/解析任务，且只恢复代码与配套页面，不恢复旧数据库。最终备份核验前不解除外层恢复保护。

本轮 fresh 验证：17 组浏览器 2,038 项；完整单测文件运行 604 通过、0 失败，另 1 项真实 Nginx 集成显式留给专用执行（已独立通过）；官方 npm registry 全依赖审计 0 漏洞；Linux Node22 构建/业务/工程验证通过，随后当前发布守卫 35 项在无网络 Linux 环境通过。第一轮 Linux 并发 API 测试出现连接失败，保留失败日志，后续完整同命令重新运行通过，不将失败尝试计为验收。JS/CSS 原阈值未放宽。

已完成新鲜只读 SSH 环境/代码/服务/运行依赖核查，尚未改生产文件或重启服务。旧安装沿用既有启动 bootstrap（其环境未设置 DATABASE_AUTO_MIGRATE）；发布演练会在单独数据库副本验证既有启动过程不改变全表/结构，随后主演练显式禁止迁移与写入。下一门槛是新鲜 stage 的 production-copy/browser 演练、正式配套切换、真实 HTTPS/browser 验收和完整私密备份回执。没有站长平台提交或追踪激活。

## 首次受保护发布与精确回退（未作为上线成功）

实现 `87ef25a` 与只增加浏览器子进程退出诊断的 `eb1c13c` 已推送。CI 首轮在 homepage 浏览器步骤静默中断，原输出没有异常/信号，不能推断根因；补充诊断后的独立完整 run 38680956197 全部 success（包括 17 浏览器组、容器、认证代理和部署回退）。本地定向首页连续三次各 221 项通过不重复计数。production-copy 演练 65 API/SSR 检查及 307 实际响应浏览器检查通过，关闭副本后全 76 表/结构不变、无写入/供应商请求。

正式 stage `/tmp/oneshowlearn-seo-lA1fj9` 的配套代码/API/SSR/HTTPS 检查通过，但外层全 156 资产验收发现 `assets/dmsans-OFL.txt` 被新通用网页代理送入后端 404。外层保护在最终回执前自动回退代码、render、入口、manifest 和代理；备份 `/var/backups/oneshowlearn/seo-6deevOf8` 保留，旧首页入口恢复为 `b4a3524e02e793a446a914fbc48c24e33862c76c02cf479cd359732ed0dc8073`，本次不计成功发布。无旧数据库/环境/依赖回灌，其他三项服务身份不变。恢复后的精确 73 表/结构、17,556 runtime 文件、全部旧资产及环境/Node/配置守卫通过。

已补两套代理的精确 `/assets/` 高优先级静态位置（不把所有 txt 当静态，robots/sitemap/llms 仍动态），实际 Nginx 专项 3/3 覆盖两套模板及两份许可证准确内容、缺失 txt 404、认证/文档边界；portable 验收增加真实许可证检查。恢复器取消无必要 lock 重写，并在原子切换前保留原文件 uid/gid/mode，包含 600/640/644 实测。首次回退只改变了两份包清单的文件模式，内容未变；已依据一致备份及逐文件 cmp 恢复原模式，完整守卫再次通过。最终回执现在还强制验证 CI、浏览器、全资产及零写/零供应商证明后才原子解除保护。新鲜修复版须重新提交、验证、演练、配对发布和验收，不复用上次 stage 或已回退发布的接受状态。

## 最终配套上线完成

实现 `13837477fd4f2cb512ed15b9c00e67bbbccf14b1` 已推送 origin/main。[完整 CI 38683652344](https://github.com/YulongLee/oneshowLearn/actions/runs/38683652344) 全部 success，包含安装、依赖审计、工程/业务、17 组浏览器、配对镜像、真实认证代理及部署/恢复检查。最新全单测文件运行 617 通过、0 失败，1 个显式 Nginx 集成 skip 由真实专项 3/3 另行覆盖；不要把工程或嵌套菜单子检查再次相加。官方 registry 审计零漏洞，依赖锁哈希不变。

新增实际部署测试发现 Docker 构建未包含既有 public 素材，已补 15 个逐文件白名单输入，public 纳入 source hash；不开放 public 通配或私人目录。最终独立 portable 65 项通过，Linux Node22 的 158 个 client/17 个 render 文件与发布包逐字节/SHA256 一致，JS345,988/CSS159,937 字节仍满足原预算。

第二次 stage `/tmp/oneshowlearn-seo-nxb3xR` 通过配套 API/HTTPS 后，外层资源读取发生 `fetch failed`，保护再次恢复原代码而未回灌数据，备份 `/var/backups/oneshowlearn/seo-HuKyyVQd` 保留。随后同样 6 并发全 156 资源及独立 Node/curl/Chromium 抽样精确哈希全部通过；未复现，不能猜测具体网络根因。仅给临时发布校验加入最多两次明确连接中断退避重试，HTTP、重定向、429、TLS 证书及内容不符仍立即失败；5 个独立单测通过。本次失败不是最终验收。

最终使用全新 stage `/tmp/oneshowlearn-seo-i6zcD1`，257 个清单文件、156 个资产、17 个 render 文件；清单 SHA256 `24188e78a33b4f163e3c775936f90c59c34e39e3e60030b0f7fb061838f075ad`，压缩包 SHA256 `7ccaf9a80038430e5e7bd5b8bd1490586260d54b7e7820c09e01dc1bf346d6eb`。provider-blocked production-copy 65 项 API/SSR 与 307 项实际浏览器检查通过，副本关闭后完整 76 表及结构相同、零写入/供应商；既有 legacy 启动过程在另一个副本被验证结构与数据中性，线上环境不变。

维护及无活跃任务确认后，仅切换五个审定 server 模块、package scripts、render/client/manifest 与精确静态/文档代理；沿用 systemd，只重启 OneShowLearn 并 reload Nginx。线上 API/HTTPS 各 65 项、全部 156 资源精确哈希、307 SEO +190 首页优惠/路线 +32 匿名浏览器检查通过（529 浏览器项），覆盖无 JS、真实 CMS/课程/报价、320–2560px、私人 noindex/鉴权、正确 MIME/404 与实际图片解码。最终运行零响应覆盖/写入/供应商请求，未触发 transport 重试。桌面/手机及无 JS 实际截图已复核，批准的布局、文案和商业行为保留。

最终一致 root-only 备份 `/var/backups/oneshowlearn/seo-SuBcDODq`，回执时间 `2026-10-15T05:11:52.379Z`；19,841 备份文件及完整备份数据/结构通过核验。receipt SHA256 `5d700d7771627e5d8261e6993be6051df87ef22d49321e60fa4e6a37669f7a9a`，备份清单 `2bf282cfa78e986e36bd683212848a67a6592b40d01e8b71b356b0f255af68c7`，最后原子 final marker 通过后才解除本次外层恢复保护。旧入口 `b4a3524e…` → 新入口 `c7a8ca37…`。完整 73 业务表值/结构、17,556 runtime 文件、环境/密钥/Node/site/lock、2,167 个旧资产条目和其他三项服务身份均保留；只排除三张指定瞬时 auth/lease 表。OneShowLearn PID2699761/NRestarts0，Nginx master543821 不变。

没有 schema、依赖升级、环境、CMS、价格、用户记录、支付/模型等供应商能力激活、Docker 线上接管、旧数据库恢复、站长提交、追踪或清理操作。原工作区 94 个变更文件已与可用 Git 副本精确一致，原 File Provider Git 元数据未改。公开可提交的验收摘要见 `.seo/implementation/production-release-20261015.json`；运行日志与截图留在 ignored artifacts。收录、排名、流量和 AI 引用效果仍未知，不能把上线通过等同于搜索效果保证。
