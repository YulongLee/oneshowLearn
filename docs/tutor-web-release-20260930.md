# AI 导师联网回答发布记录

2026-09-30，按用户明确部署请求发布至 https://oneshowlearn.com/tutor。

## 范围

- 联网回答与真实网页引用、后台功能开关、私有会话模式持久化。
- 简洁胶囊按钮、开关勾选反馈、44px 点击区域及键盘焦点。
- 移除之前用户要求隐藏的权限范围与快捷键说明，保留真实权限检查与快捷键功能。
- 服务端严格限于 ai-configuration、ai-provider、ai-web-search、course-ai-service、tutor-conversations 五个模块；其他模块和依赖锁文件比对一致。
- 未导入本地数据库、测试账号、课程或聊天记录；未替换生产环境配置。

## 验证

- 构建与 167 项自动化测试通过。
- 发布前服务器内备份：`/var/backups/oneshowlearn/tutor-web-sN3ltQgm`。
- 发布暂存：`/tmp/oneshowlearn-tutor-web-LAKkD1yu`。
- 数据库演练：47 张原表内容不变；上线验证 44 张原表不变，仅验证登录/限流/调用用量三张表产生预期变化。
- 线上已配置的 deepseek-v4-flash 实际联网返回 1 处有效网页引用，调用用量已记录；未创建生产测试对话。
- HTTPS 历史列表、鉴权、no-store、后台联网开关与能力接口通过。
- 23 个 HTTPS 页面入口及 33 个资源哈希与构建一致。
- 服务 ActiveState=active、MainPID=248166、NRestarts=0。
- 环境文件、服务配置、Nginx 配置与其他产品服务 PID 均保持不变。
- 入口 SHA256：`7acd63cb7594c5e2926cad06ef04bf2ae740e18c78eb43cde38b338c414d3e2e`。

回滚备份保留旧服务端和前端入口；已有带哈希资源保留。回滚代码时不覆盖上线后真实用户数据。
