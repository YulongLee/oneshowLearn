# 课程购买入口（2026-10-01）

## 范围

- 将共享侧栏底部“课程与权益”改为“解锁完整课程 / 查看课程与价格”，图标模式保留可访问的“购买课程”入口。
- `/membership` 按用户参考图改为浅紫介绍区、权益卡片、真实课程目录、右侧价格/购买卡和底部行动区。复用现有插画与共享导航，不改变公开首页。
- 课程选择读取已发布 CMS 目录；章节与试听优先读取共享课时接口，兼容旧资料目录。价格取实际商品价格，保留零价语义；未关联商品时显示“价格待配置”并禁用购买。
- 已有访问权限可直接进入课程。访客使用原有账号登录组件就地登录，避免丢失所选课程；未购用户通过确认弹窗调用现有订单接口，不自动扣款或授予权限。
- 使用现有人工收款确认流程，订单成功后显示真实订单号与应付金额；请求期间防重复点击，失败时提示先核对订单状态。未新增微信/支付宝支付接口。
- 不复制参考图中的 ¥399、原价、优惠、学员数量、评价、无限 AI、终身服务或退款保证；独立实战项目不会因课程购买自动解锁。

## 验证

- 构建通过；90 项平台/模型、93 项 API、4 项 Sites 测试通过，共 187 项。构建仍有既存大包提示。
- 新增测试验证零价格、缺失价格、真实课时分组和链接、免费/付费标记、旧资料兼容与空目录。
- 复用的订单创建、人工确认收款和权益边界由既有隔离 API 测试覆盖；未在生产环境下单。
- 本地真实浏览器验证共享侧栏入口、已授权状态、未配置商品不可购买、免费试听进入现有课时阅读器。
- 320 / 390 / 768 / 1440 / 1920 / 2560px 布局无整页横向溢出，手机先介绍再购买卡，辅助说明与课程内容自然堆叠。测试后恢复默认窗口尺寸。
- 未改动生产内容、价格、账号或订单；未部署、未推送 Git。

本地预览：`http://127.0.0.1:4179/membership`。

后续正式收款仍需经营者确认课程价格、交付范围、官方收款联系方式和售后规则。若需要自动支付，需要单独配置支付服务并验证回调及退款流程。

## 生产发布（2026-10-01）

- 用户随后明确要求“上线部署吧”，重新构建和 187 项测试通过后，仅发布前端。未推送 Git。
- 备份：`/var/backups/oneshowlearn/frontend-8CsUhbuv/client`；发布暂存：`/tmp/oneshowlearn-platforms-b9RgGuEy`。
- 23 个 HTTPS 页面入口、34 个静态资源精确哈希通过；API 健康、公开目录和匿名访问保护通过。
- 额外逐项读取 7 门已发布课程的商品详情及共享课时接口，全部正常；独立请求 `/membership` 入口与构建哈希一致。
- 入口 SHA-256：`082ef010c881587f86bac1d36e7766c817335ba400513c7233a4ef94de3cec6e`。
- 服务文件、环境与 Nginx 配置哈希不变；服务 active，PID `393316`、异常重启 `0`，此次没有重启。
- 未上传本地数据库、测试账号或订单，未修改线上课程价格、内容及用户记录。线上只读验证，没有真实下单或支付测试；收款仍为人工确认。
- 如需回退，仅恢复备份入口，保留现有哈希资源与实时业务数据。

## 参考图忠实度修正（2026-10-01，本地未发布）

用户再次明确要求完全遵循 `codex-clipboard-e43412cd-d8e4-4a73-9349-98ae23aef4ff.png` 的整体风格。本节覆盖前述“复用共享导航”的购买页视觉决定，不改变其他页面。

- 仅 `/membership` 使用参考图的独立 58px 横向导航；学习页面继续使用原有共享侧栏。
- 还原黑色卫衣单人物、浅紫首屏、右侧购买栏、4×2 权益卡、最多五列真实课程章节、深色山景行动横幅。移除上一版不匹配的多人插画。
- 搜索真实已发布课程，支持切换、登录、试听和购买定位。保持现有人工确认订单、价格缺失保护、权限和重复提交防护。
- 不复制参考图的虚构优惠、评价与退款承诺。评价位置使用购买前说明；目录不足五章时保留实际数量，不造假填满。
- 构建及 92 项平台测试通过；本轮此前已通过 93 项 API 和 4 项 Sites 测试，总计 189 项。保留既有打包体积提示。
- 浏览器检查 320、390、768、1226、1440、1920、2560px，无整页横向溢出；检查手机导航、课程搜索、购买卡聚焦、免费试听进入原有播放器。试听后仍使用共享学习导航。
- 本次未修改线上内容/价格，未创建生产订单，未部署或推送 Git。

### 首屏局部图二次修正（本地未发布）

根据 `codex-clipboard-23bc0450-e073-4c77-85a0-980ba2244326.png` 调整：连续浅紫背景与下沿、接近等大的两行粗标题、三行手写标注、气泡/浮动卡片、透明人物落点。购买卡收紧，将课程选择和说明保留在可展开区域。四项统计均取当前课程实际章节、内容、资料和免费内容，不引入参考示例数据。

本轮构建、93 项平台测试及差异格式检查通过；浏览器检查 320/390/768/1001/1185/1440/1920/2560px 无整页横向溢出，展开课程选择正常。保留既有构建大包提示。未部署。

通过内置 imagegen（非 CLI）将上一版人物改成真实透明 PNG，检查 `hasAlpha: yes`。最终文件：`src/assets/course-sales-mascot-v2.png`，保留 v1 原文件。最终提示词：

```text
Use case: background-extraction. Image 1 is the edit target. Remove only the pale lavender background and produce a clean mascot cutout with a genuinely transparent alpha background. Preserve this exact black-hoodie character, face, glasses, hair, raised index finger pose, lighting, waist-up framing and white hoodie text 'OneShow' / 'Learn' unchanged. Do not redraw, restyle, add shadows, text, props or a checkerboard pattern. Preserve fine hair and clothing edges, no pale halo. Output a transparent PNG for the existing website hero.
```

### 插画制作记录

使用内置 imagegen（非 CLI），以下两份图片以用户设计图为参考生成。文字、按钮和卡片均保持为真实 HTML，不使用整页截图作为页面。

- 人物：`src/assets/course-sales-mascot-v1.png`
- 横幅：`src/assets/course-sales-banner-v1.png`

人物提示词：

```text
Use case: stylized-concept. Asset type: website hero illustration asset, NOT a full webpage. Reference image 1 is the exact style and character reference. Recreate ONLY the black-hoodie 3D mascot in the top hero: friendly young East Asian male, large round black eyeglasses, fluffy swept dark hair, smiling face, raised right index finger, waist-up front view. Match reference face, pose, proportions, black hoodie, soft premium 3D materials. Hoodie must say exactly 'OneShow' on first line, 'Learn' on second line in white. Single character centered, filling 90% image height, waist at bottom edge. Soft extremely pale lavender (#f7f7ff) background. No other people, no website cards, no typography besides hoodie, no floating labels or boxes. Image roughly square, high quality, suitable for placing on right half of hero. Preserve the reference mascot design; do not substitute a robot or group illustration.
```

横幅提示词：

```text
Use case: ads-marketing. Asset type: wide website closing banner background, no webpage UI. Reference image 1: recreate ONLY the sunset mountain panorama within the bottom horizontal banner. Landscape, aspect ratio 3:1. A lone young man wearing dark hoodie seen from behind, sitting cross-legged on rock with open laptop, right-of-center at x=72%, amidst layered blue-violet mountains under soft peach/pink dusk sky. Bottom rocks dark navy. Left 50% is low-detail very dark navy-violet negative space, suitable for white HTML text overlay. Person and mountain skyline must be visible even when cropped to a shallow 6:1 banner. Match the supplied exact composition, realistic editorial photography, not cartoon. No text, no UI, no logos, no buttons, no quotation marks.
```
