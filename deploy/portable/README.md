# 独立部署与迁移手册

## 边界与准备

这套工具只操作指定的独立目录和 `osl-…` Docker Compose 项目，不修改当前线上 systemd、宿主 Nginx、域名或其他站点。支持有 Docker Engine、Compose **2.30+**、Node **22.14+ / 22.x** 的 Linux 主机；Mac Docker Desktop 可做演练。不宣称支持 Windows、无 Docker 主机或多机 SQLite 集群。

正式安装目录建议 `/srv/oneshowlearn-instance`。示例域名须替换为自己的域名；目录必须绝对、独立、非符号链接，初始化/恢复拒绝覆盖已有目录。管理命令在源码仓库根目录运行。

容器内部 API 不开放宿主端口，网页默认只监听宿主 `127.0.0.1:8080`。**公开访问前必须配置宿主反向代理、HTTPS、域名和防火墙**，把流量转发到该端口并传递正确的 Host / X-Forwarded-For / X-Forwarded-Proto。工具不会申请证书或更改 DNS。

API 以非 root 用户运行、代码只读、日志轮转；数据目录可写。配置文件仅当前操作用户/root 可读。Docker 管理权限等同主机高权限，镜像和备份都必须来自可信维护者；标签/源码哈希用于配对及追踪，不是供应链签名。

## 1. 从 Git 构建可追溯版本

```sh
git checkout <已经审核的提交或标签>
npm ci
npm run check:engineering
npm run test:engineering
npm test
npm run build
npm run ops -- build --release release-20261007
npm run test:deployment -- --release release-20261007
```

正式构建拒绝脏工作区。仅本地隔离演练可显式加 `--allow-dirty`，输出会标记 dirty，不能把它称为正式 Git 版本。发布清单在忽略的 `artifacts/releases/`，记录 Git revision、源码哈希和两枚不可变镜像 ID；默认跟踪 Node 22 / Nginx stable 补丁，每次重建必须重新验收。正式运输宜使用验收后的镜像，不在目标机器盲目重建。

网络受限时允许使用可信基础镜像，例如官方镜像的 ECR Public 镜像：

```sh
npm run ops -- build --release rehearsal --allow-dirty --node-image public.ecr.aws/docker/library/node:22-bookworm-slim --nginx-image public.ecr.aws/docker/library/nginx:stable-alpine
```

## 2. 全新空站：只初始化管理员，不导入课程/示例订单

```sh
npm run ops -- init --directory /srv/oneshowlearn-instance --origin https://learn.example.com --admin-email owner@example.com --port 8080
```

生成独立 JWT/支付/AI/登录加密密钥与管理员密码，只写入该目录 `app.env`，不打印。默认注册、开发邮件和环境 AI 调用关闭；网页样式/商品等使用应用实际配置，**新站没有现有课程**。由管理员在正常后台维护内容；迁移现有站点应走下一节，不能先 seed。

在本机安全编辑 `app.env`。格式为字面 `KEY=value`，不执行 shell，不加引号包裹，也不支持多行变量。开启注册前配置真实邮件服务；开启模型/收款前按既有后台流程配置并独立验收。不要把任何密钥放进 VITE_ 变量或 Git。管理员密码只用于首次空站初始化，之后更改这个变量不会重设已有账号密码。

```sh
npm run ops -- deploy --directory /srv/oneshowlearn-instance --api oneshowlearn-api:release-20261007 --web oneshowlearn-web:release-20261007 --bootstrap
npm run ops -- status --directory /srv/oneshowlearn-instance
```

首次 `--bootstrap` 遇到已有账号/订单/课程/项目就拒绝。无需示例数据可直接运行真实平台；公开运营前仍要完成内容、邮件、支付/回调、服务信息、TLS 与备份配置。

## 3. 日常升级与代码回滚

先在外层反向代理安排维护窗口，停止接收新的用户写入，确保支付/AI/上传操作完成。维护期间支付通知需让上游重试，恢复后按现有补查流程核验，不可把请求失败视为付款失败。

```sh
npm run ops -- deploy --directory /srv/oneshowlearn-instance --api oneshowlearn-api:release-next --web oneshowlearn-web:release-next --allow-maintenance
```

工具配对镜像角色/源码、检查尚未完成的支付补查/租约、近期模型任务与上传租约，停止本站容器，生成一致备份，再显式迁移并等待健康检查。存在未处理支付补查会拒绝维护，须先按业务流程核验，不能删除订单或强制清理租约。

有短暂停机，**不是零停机或蓝绿方案**。发布工具不会代替外层维护页，也无法在接受新用户请求时保证“检查与停止”之间绝无新写入。因此外层停写是升级前置条件。镜像不可变，程序只读；业务数据和密钥不会随镜像替换。旧版本哈希静态资源保留在独立只读挂载目录，避免已打开网页的后续加载变成 404；同名不同内容会拒绝发布，资源不会自动删除。

```sh
npm run ops -- rollback --directory /srv/oneshowlearn-instance --allow-maintenance
```

回滚最近记录的代码版本，同样备份/健康检查。迁移/启动失败时尝试恢复上一个镜像，不覆盖数据库；数据库损坏或不兼容迁移可能使旧代码无法启动，不能保证所有未来升级自动恢复。后续迁移必须采用向后兼容的增量策略。只有核对当前订单与权益后才考虑独立数据恢复。

操作互斥锁防止并发发布；异常断电遗留 `.operation-lock` 时，先确认本站没有任何管理命令运行并审计容器/备份状态，再由维护者移除该锁，不要盲目解锁。

## 4. 停机一致备份与异机恢复

```sh
npm run ops -- stop --directory /srv/oneshowlearn-instance
npm run ops -- backup --directory /srv/oneshowlearn-instance
```

运行中的站点拒绝离线备份。备份使用 SQLite `VACUUM INTO`，不是简单拷贝 WAL 主文件；包含数据库、附属数据/加密文件、本地公开/私有/暂存附件、`app.env` 与部署状态，并逐文件做 SHA256 校验。哈希校验防止传输损坏，不证明备份来源可信。

**备份含真实用户资料及密钥**，权限应为私有，须加密后离机保存，不进入 Git、网页、公开对象存储或 CI 工件。OSS 模式的数据库只包含对象引用，这套工具不复制远端对象；必须另行备份 OSS 对象、版本和访问权限。容量/备份保留时间及定时任务由维护者配置，本工具不会自动删除历史备份。

在目标机器导入验收过的镜像（默认要求与源机 CPU 架构一致；不同架构须另行构建并验收，不直接保证可用）：

```sh
docker save -o release-images.tar oneshowlearn-api:release-20261007 oneshowlearn-web:release-20261007
# 将镜像和加密的备份通过可信渠道传输到目标机器；解密到私有目录。
docker load -i release-images.tar
npm run ops -- restore --directory /srv/oneshowlearn-restored --from /srv/private-backups/<指定备份> --port 8080
npm run ops -- deploy --directory /srv/oneshowlearn-restored --api oneshowlearn-api:release-20261007 --web oneshowlearn-web:release-20261007 --allow-maintenance
```

恢复拒绝覆盖现有目录、链接文件、缺失/多余文件或哈希不匹配。必须保留源站密钥与加密文件，否则后台支付/AI/登录配置不可解密。不要在恢复前重新 init 或换密钥。先以原域名配置验收目标，不让源/目标同时收款写入；切换时验证回调 URL、HTTPS、权限、附件、课程和历史订单，再关闭旧入口。不要用恢复旧库来覆盖迁移期间新产生的付款。

## 验收范围

`test:deployment` 只操作新建隔离目录与随机 Compose 项目，使用虚构账号/订单和禁用的提供商，测试空站、匿名权限、只读/端口/日志边界、升级、故障恢复、代码回滚、一致备份和另目录恢复；结束清理这些临时容器和虚构数据，不清理其他服务。证据只记录检查数/镜像源码哈希，排除密钥与业务正文。

这不等于真实云主机、域名证书、OSS、支付通知或真实模型接口验收。当前线上旧目录首次迁入新体系需要单独审批并制作一致快照，本轮工程优化不自动执行该操作。
