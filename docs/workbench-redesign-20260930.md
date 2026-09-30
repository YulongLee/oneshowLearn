# 工作台参考图重设计 · 2026-09-30

最初完成本地开发与验证；用户随后明确要求部署，已于 2026-09-30 发布前端。未修改生产内容或账户。

## 设计与数据

依据用户的 `codex-clipboard-d6c963b9-ab61-48f8-a07c-876d947577ee.png` 重组 `/app`。保留共享导航和顶部账户栏，使用浅色山景欢迎区、并列的课程/项目继续卡、五阶段路径、紧凑项目推荐、最近学习、个人成果，以及任务/日历/导师辅助栏。

课程来自账户课程库，继续动作进入实际课时；项目来自当前账户已开始的项目，阶段来自 CMS。最近学习只包含真实进度记录。推荐项目来自已发布目录，并尊重工作台的显式项目关联。无课程、项目或成果时展示明确空态。没有添加参考图中的虚构进度、学习时长、销量或成果。

AI 导师明确标记实时回答未接入，只能将问题保存为私人笔记。任务、打卡和笔记继续使用原有版本冲突保护。公开首页、管理后台及播放器均未改变。

## 验证

- `npm run build` 成功，Sites 交付目录完整；仍有现有的主包体积提示。
- `npm test`：114 项通过（51 平台/界面模型、59 API、4 Sites）。
- 本地隔离预览数据库：任务创建、勾选，刷新后保留；日历切换月份/返回本月；导师问题保存为私人笔记，笔记数更新并在刷新后保留。
- 继续课程进入 `/learn/preview-course/lessons/1`；继续项目进入 `/projects/preview-project-1/workspace`，原有视频、课件、资料和笔记正常呈现。
- 390、768、1024、1440、1536、1920、2560、3440 像素宽度检查：页面无横向溢出，窄屏单列，辅助栏在内容空间不足时下移，项目推荐 4/2/1 列重排。
- 桌面与手机截图人工检查；浏览器无 error/warn 日志。

## 欢迎区图片生成记录

生成模式：内置 `image_gen`，不是 CLI。图片仅作装饰背景；文字和按钮仍为可访问的 HTML。

最终应用素材：`/Users/liyulong/Documents/ChatGPT/OneshowLearn/src/assets/workbench-welcome-v2.webp`（1600px 宽，约 32KB）。

原始输出：`/Users/liyulong/.codex/generated_images/019fdb78-dbaf-7042-93a5-d4b61dafa665/exec-8d3f8763-7588-45ac-ab2c-a7922e2aff38.png`。

最终提示词：

> Use case: stylized-concept. Asset type: a shallow wide background illustration for the signed-in OneShowLearn learner dashboard, not a whole UI mockup. Generate a premium editorial landscape with soft layered lavender and pale lilac mountain silhouettes fading into a near-white misty sky. At far right (85% horizontal position), a small full-body person seen from behind wearing an indigo jacket stands on a rocky summit looking into the distance. Restrained refined semi-realistic 3D/painterly detail, calm hopeful morning light. Composition: wide landscape approximately 3:1, left 55% almost entirely empty off-white #f8f9ff fading smoothly to the mountains at right; no large dark areas. Subject entirely visible within the right quarter, centered vertically, not cropped. This will be displayed as a shallow 130px-tall banner, so keep mountains simple and subject silhouette readable. No words, lettering, logos, UI, cards, border, watermark or decoration.

## 生产发布

- 目标：现有腾讯云上海站点 `https://oneshowlearn.com/app`，仅静态前端；未上传数据库、测试账号、学习记录、后端代码或配置。
- 发布前重新执行构建和全部 114 项测试，通过。
- 发布后只读 HTTPS 验证：22 个页面入口、35 个资源哈希与本地一致，API 健康、资源目录和匿名权限保护正常。
- 线上浏览器读取超时；未声称完成线上登录交互或截图验收。交互与响应式检查在上一节的隔离本地环境完成。
- 回退备份：`/var/backups/oneshowlearn/frontend-jtnmGegY/client`；保留旧哈希资源供旧标签页和回退使用。
- 临时发布目录：`/tmp/oneshowlearn-platforms-xdjKxvSn`。
- 发布包 SHA-256：`092520ef0e12e91a2eb44ffb3f14a39863d23b80c33e41046aeaf48c68354721`。
- 入口 SHA-256：`5b6c97683fb295d60900e18d395ae835bcb869cb98bd4bce67c2e52a354e578a`。
- 主资源：`index-C9vLYomp.js`、`index-DoPbeo3f.css`。
- 后端服务保持 active，PID `3792799`、异常重启数 `0` 不变；未重启本产品或其他产品服务。
