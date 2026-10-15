# OneShowLearn SEO / GEO 执行记录

日期：2026-10-15；目标：https://oneshowlearn.com/。这是本地开发/验收记录，不是生产发布记录。

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
