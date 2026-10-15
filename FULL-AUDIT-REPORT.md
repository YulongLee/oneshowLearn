# OneShowLearn 系统 SEO / GEO 审计报告

2026-10-15。范围：全站公开入口、技术抓取、页面信息、实体内容、性能证据与私人索引边界。下文基线问题为优化前发现；本轮最终已提交并配套上线，未向搜索平台提交网址。发布经过与验收见 SEO-EXECUTION-LOG.md。

## A. 审计摘要

原线上存在明显技术缺口，主要修复已实现、通过隔离和实际线上验收并发布。原问题是无可读初始正文、抓取文件错误、公共/私人页面共用搜索信息；现已提供公开正文、实际课程目录、统一品牌与讲师实体。缺少第一方搜索数据，不给精确评分。

Google 能渲染 JavaScript，原有空壳不等于一定无法收录；SSR 减少了对后续渲染的依赖。[Google JavaScript 指南](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)

## B. Findings

| ID | 区域 | 严重度 | 置信度 | 线上问题及证据 | 本地修复及影响 |
|---|---|---|---|---|---|
| SEO-01 | 正文 | Warning | Confirmed | 625 字节原始 HTML、空 root，无 H1/正文 | 首页/真实课程介绍同组件匿名 SSR；无 JS 可读，原布局/动态价格保留 |
| SEO-02 | 抓取文件 | Critical | Confirmed | robots/sitemap 返回 200 HTML SPA 壳 | 正确纯文本/XML，仅真实公开 URL，不把五章包装成五门课 |
| SEO-03 | 状态码 | Warning | Confirmed | 随机不存在网址也返回 200 壳 | 未知/未发布课程 404，读失败 503 + Retry-After；API/附件/资产不被覆盖 |
| SEO-04 | 页面信息 | Warning | Confirmed | 无 canonical、OG/Twitter、实体 JSON-LD | 逐页信息、真实分享图、有效报价；选课/前进后退同步 |
| SEO-05 | 内链 | Warning | Confirmed | 导航 button + JS，初始站内链接为 0 | 跨页/课程/试看改 a[href]，支付/展开仍为按钮；保留草稿/键盘/新标签 |
| SEO-06 | 私人索引 | Warning | Confirmed | 账户/工作区壳未 noindex | 私人/工作区/结算/协议 noindex，不导出私人记录/授权附件 |
| GEO-01 | 实体内容 | Warning | Confirmed | 出品方大小写混用，AI OPC 缺独立定义 | 统一 OneShowLearn、OneShowAiLab、Cody老师，原 FAQ 补定义 |
| SEO-07 | 图片/预算 | Pass | Confirmed | 已有 WebP、尺寸、首图优先与懒加载 | 保留布局/预算；SSR 课程加载真实 manifest 样式 |
| SEO-08 | 域名 | Pass | Confirmed | HTTP、www 均 301 到 HTTPS 主域 | 原 TLS/跳转保留 |
| SEO-09 | 测量 | Info | Confirmed | 无 GSC/GA4 数据，PageSpeed 429/null | 明确未知，不推断处罚、排名、转化或真实 CWV |

原始发现与去重验证见 .seo/baseline/findings.json、findings-verified.json。HTML、robots、llms、社交标签、响应头、重定向、内链和 PageSpeed 均有脚本证据。“未单列 AI 爬虫”不等于缺陷，wildcard 规则仍有效。

## C. 行动与验收

已完成匿名已发布白名单、同组件正文、失败关闭、规范网址、动态报价、实体信息、真实链接、抓取文件、SPA metadata、SSR 构建/代理配对、业务与浏览器回归。

公开索引入口为 / 和 /course-offer?course=<真实slug>，追踪参数不进 canonical。/paths、/opc、项目/资源/AI 等学习工作区保留行为但 noindex；首页公开五阶段路线，课程页公开实际目录，不额外制造薄落地页。会员文章继续鉴权。协议是支持性说明而非搜索落地页，不自动改写运营方正文。

schema 为真实 Organization、WebSite、WebPage、Person、Course、BreadcrumbList；Offer 只匹配实际商品/有效当前价。不加评分、收入、正式教学总时长、认证、成绩或完成率；普通问答不加 FAQPage/HowTo。一门课程不满足 Google Course list 至少三门要求，普通语义标记不代表富结果资格。[官方课程指南](https://developers.google.com/search/docs/appearance/structured-data/course)

验收：
- 业务/构建、工程、SEO 数据/metadata/安全证据解析测试通过。
- 17 组隔离浏览器共 2,038 项，其中 SEO 专项 552 项；菜单子检查不重复计数。
- 另验优惠 290 项、路线 265 项；覆盖 320–2560px、键盘、reduced-motion、草稿、图片失败。
- SEO 读取阶段 SQLite query_only，完整 schema/表值相同，零浏览器写入/外部请求/水合错误/真实供应商请求。
- Linux Node 22 clean Docker verification 通过；runtime-only、只读/无网络的真实 SSR 渲染通过。首次 Docker 缺测试 helper，补精确白名单后重新通过，不把失败计为验收。
- 独立部署在真实隔离 Nginx 下通过 60 项 SSR/私人索引/抓取文件/404/升级/失败恢复/代码回退/备份恢复验收；原认证代理另有 65 项检查通过。
- JS <350,000、CSS <160,000 字节预算未放宽；无新依赖/表迁移/改价/课程或 CMS 修改/供应商激活/生产重启。

最终已以新 backend + SSR bundle + client shell/assets + proxy 配对上线，完整 CI38683652344及529项真实线上浏览器、156资源哈希、65 API/65 HTTPS检查通过。最终备份和73业务表/结构/runtime/环境守卫通过；实现1383747，详见执行记录。两次失败尝试均回退，未计验收。历史前端-only 发布器继续拒绝本版，不能套用旧“41 页同一 HTML 哈希”验收。静态 Sites 预览没有公开后端时保持 noindex，不冒充完整 SEO 发布。

## D. 未知与后续

Search Console、GA4、关键词量、真实收录/排名/AI 引用率未知；本机 MCP 配置存在不等于已经取得数据。PageSpeed 限流，无真实 CWV 或分数。过期技能材料已用当前官方资料复核；中文不套用英文词数/阅读等级阈值。

GEO 重点是真实、可发现、可理解的公开内容。Google 无专用 AI 文件或特殊 schema 要求，llms.txt 只是补充导航。[Google AI 搜索指南](https://developers.google.com/search/docs/appearance/ai-features) OpenAI 搜索与训练爬虫独立，本轮不擅自改变训练偏好。[官方爬虫说明](https://developers.openai.com/api/docs/bots)

后续用真实发布的章节形成公开知识文章/案例摘要，不开放会员正文或批量造薄页。没有反链采购、外联、自动索引提交、定时监控或正式课程内容补录。
