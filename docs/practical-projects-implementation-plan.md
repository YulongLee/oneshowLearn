# OneShowLearn 实战项目系统 Implementation Plan

**2026-09-29 · 原始方案已获用户后续实施及部署授权**

> 状态更新：课程与项目共用课时、媒体、笔记、Prompt 版本、订单和 AI 服务边界的实现已完成本地验收。实际表/API、功能边界及部署结果见 [本次交付与验收记录](learning-release-20260929.md)。下文是保留的评审方案，不再表示仍等待授权。

依据本次完整需求与参考图 `codex-clipboard-e3bdfc2b-8f66-4873-b370-f92f30520890.png` 制定。已结合上一轮课程系统核查，重新检查当前实战项目、后台管理、资源访问、个人成果、支付和路由实现，并在本地浏览器打开 `/projects`。

本轮仅产出方案，等待确认后再编码。没有修改业务代码、迁移业务数据库、导入示例项目或部署生产。上一份课程学习系统方案也仍处于待确认状态，不能把其计划中的组件当作已经存在。

## 总体决策建议

**课程负责知识学习，项目负责实际开发与验收；两者共享内容、媒体、账号、支付和 AI 基础能力，但不混用完成状态。**

保留 `practice_projects` 作为项目主实体，扩展为：

选择项目 → 开始个人项目 → 学习教程/课件 → 使用 Prompt 与操作步骤 → 完成清单 → 阶段验收 → 记录成果 → 用户确认上线及商业化里程碑。

本次首先交付真实数据驱动的项目首页、详情、个人进度及后台维护；工作台和 Prompt 在后续阶段落地。复制 Prompt 不等于执行成功，学完教程不等于产品上线，平台不会自动操作用户的代码仓库、服务器或支付商户。

## 1. 当前项目架构

| 领域 | 当前实现 | 方案方向 |
| --- | --- | --- |
| 前端 | React 19、Vite 6、JS/JSX | 增量组件，不换框架 |
| 路由 | `src/App.jsx` 的 History API 路由 | 增加明确详情/工作台分支，保留历史路由 |
| 公共布局 | 一个持续挂载的 `WorkspaceShell`，共享侧栏、顶栏、账号 | 项目首页/详情继续使用，保留拖拽、折叠、隐藏偏好 |
| 后端 | Express 5、Node ESM | 增加项目领域服务，不启动第二套 API 系统 |
| 数据库 | SQLite WAL，迁移集中在 `server/db.mjs` | 版本化增量迁移，保留原记录 |
| 登录 | 同一账号、JWT、邮箱验证、角色和会话失效控制 | 直接复用，个人项目按当前账号隔离 |
| 内容系统 | 课程包、章节、资料投放、统一资料库、私有附件 | 用关联共享资料，不复制出另一套正文 |
| 支付 | 商品、订单、支付记录、课程权益；人工确认收款 | 扩展商品/权益支持项目，不新建第二套收银系统 |
| AI | 导师界面和私人提问记录，未接真实模型 | 共用未来 AI 服务，增加项目上下文适配 |
| 个人成果 | `workspace_state.achievements` 中的私人记录 | 扩展项目来源和成果字段，保留现有记录与页面 |

命名特别注意：现有 `project_packs` 实际是课程，不是本次实战项目；真正的项目表已经叫 `practice_projects`。不能因为名称相似而把两者重新合并。

## 2. 当前已有能力与实际缺口

### 已有

- `/projects` 已有目录、分类按钮、卡片、项目进度辅助栏和导师预览。
- 后台 `/admin/projects` 可以维护独立项目及其关联课程，支持草稿、发布、归档和过期编辑拒绝。
- `/api/practice-projects` 从数据库返回已发布项目，不是将示例项目硬编码到卡片中。
- 关联课程仍执行原课程访问权；查看项目介绍不会直接开放所有付费资料。
- 已有课程资料学习状态、个人笔记/成果、私有附件下载和管理员审计。

### 还没有

1. **动态分类**：前端 `PROJECT_CATEGORIES` 和后端分类校验都是固定枚举；目前还按标题猜分类。
2. **真正独立的项目教程**：项目必须关联已发布课程才能发布；详情是弹窗，内容来自课程目录。
3. **项目开发状态**：进度由关联课程的资料完成数相加得到；这不是环境搭建、编码、测试和部署的验收记录。
4. **阶段/课时/Prompt 编排**：没有项目阶段、课时、操作步骤、Prompt 版本和阶段验收实体。
5. **独立项目权益**：商品和权益表只支持课程 `pack_id`；不能直接安全地售卖独立项目。
6. **完整搜索和指标**：没有项目技术栈/标签全量搜索、难度、真实学习人数或热度统计。
7. **独立工作台**：`/projects/*` 当前统一进入 `ProjectsCatalog`，只解析第一个 slug，不能直接增加一个工作台 URL 就认为已经可用。
8. **真实 AI**：目前项目导师只能把问题保存为私人笔记，没有模型回答。

本地当前展示“实战项目正在准备中”，这是尚无可展示项目的真实空态，不应拿参考图里的完成数、学习人数填进去。

## 3. 可以复用的组件

| 文件/能力 | 复用方式 |
| --- | --- |
| `Workspace.jsx`、`workspace-shell.css`、`workspace-responsive.css` | 统一公共布局、移动抽屉、内容宽度响应式 |
| `ProjectsCatalog.jsx`、`projects.css` | 渐进拆分目录卡片、Hero、过滤、进度栏，不重写无关页面 |
| `project-model.js` | 保留时间格式化等纯函数；动态分类、搜索与排序改为 API 驱动 |
| `AdminPlatform.jsx`、`AdminDialog.jsx` | 扩展项目后台、编辑守卫、版本提示与弹层 |
| `AdminCms.jsx`、`AttachLibrary.jsx` | 引用真实资料、上传附件、发布和访问配置 |
| `CourseReader.jsx`、课程方案中的媒体/课件组件 | 统一底层阅读与媒体能力；新组件需真正实现后再复用 |
| `AiTutor.jsx`、`tutor-model.js` | 保留导师入口与提问记录，扩展真实上下文，不复制一个新导师 |
| `NotesWorkspace.jsx`、`AchievementsWorkspace.jsx`、`PersonalShared.jsx` | 项目笔记与成果回流现有“我的”页面 |
| `api.js`、`platforms.js`、导航模型 | 会话、错误处理、路由激活、登录返回 |

保留已有受保护资源和旧课程阅读 API；独立项目升级不能让资源中心、学习课程或旧收藏链接失效。

## 4. 可以复用的数据模型

| 现有模型 | 业务含义 | 处理 |
| --- | --- | --- |
| `practice_projects` | 项目介绍与发布实体 | 直接扩展，不另建 `projects` 表 |
| `practice_project_courses` | 项目与课程显式关联 | 保留；升级为推荐/配套关系，不默认互相授予权益 |
| `project_packs` / `project_steps` | 课程/章节 | 保留，不拿课程章节冒充项目开发阶段 |
| `content_library` | 可复用图文、代码、Prompt 等原资料 | 原文唯一来源；新项目内容通过引用使用 |
| `content_items` | 课程资料的投放与访问范围 | 保留 ID、预览规则、正文引用和历史进度 |
| `assets` | 原始文件信息 | 视频、PPT、代码包、截图继续使用；扩展关联和私有访问 |
| `users` | 账号和角色 | 直接复用 |
| `products` / `orders` / `order_items` / `payments` | 商品与账务 | 原表扩展支持项目，保留历史单据 |
| `entitlements` | 有效访问权益 | 同表扩展项目目标，并共用授权服务 |
| `progress` | 资料阅读状态 | 只代表学习，不直接赋值为项目验收完成 |
| `workspace_state` | 私人笔记、收藏、成果、日常任务 | 保留；逐条项目执行状态不放进一个反复整体覆盖的大 JSON |
| `cms_audit` | 管理操作审计 | 项目、阶段、Prompt 发布与归档纳入审计 |

## 5. 需要新增的数据模型

按职责新增，而不是机械地把需求中的每个英文名都建成一张独立表。

### 内容编排

- `ProjectCategory`：可由管理员维护的分类，含 slug、排序、启停。
- `ProjectStage`：有顺序、目标、产出和验收规则的开发阶段。
- `ProjectLesson`：阶段中的实战课时，关联共享教程和项目操作内容。
- `ProjectPrompt`：课时中的 Prompt 投放位置、说明、顺序与版本引用。
- `PromptDefinition / PromptRevision`：共享 Prompt 资产与不可变历史版本。
- `OperationStep / ChecklistItem`：带稳定 ID 的步骤和验收项。

### 当前用户执行记录

- `UserProjectRun`：一个用户实际开始/加入一个项目后产生的记录；不是浏览目录就创建。
- `UserProjectLessonState / UserProjectStageState`：个人课时、阶段的开发与验收状态。
- `UserProjectTask`：清单勾选、证据、保存版本，按用户实例隔离。
- `ProjectResultLink`：把项目完成过程关联至现有成果 ID，而非复制出第二份成果正文。

### 不重复建设

- `ProjectAsset` 是对现有 `assets` 的关联，不是新存储系统。
- `UserProjectAccess` 是扩展后的权益查询结果，不建立一套独立购买账本。
- `UserProjectProgress` 是执行记录和验收结果的聚合，不允许客户端直接上传一个百分比。
- AI 服务与课程方案共享；播放器/PPT/笔记内核只做一次。

## 6. Database Schema

以下为拟定逻辑 Schema，不是本轮执行的 SQL。FK 表示真实外键；JSON 仅用于有限的展示属性/历史快照，关键关系和状态不用任意 JSON 替代约束。

### 6.1 项目、分类与阶段

| 表 | 主要字段 / 约束 |
| --- | --- |
| `practice_projects`（扩展） | 保留原 ID/slug；新增 `subtitle`、`tech_stack_json`、`difficulty` 1–5、`estimated_minutes`、`audience`、`prerequisites`、`outcomes_json`、`access_type`、`original_price_cents`、`is_featured`、`is_recommended`、`hot_until`、`published_at`、`created_at`、`version`、`content_mode` |
| `project_categories` | `id PK, slug UNIQUE, name, sort_order, is_active, version` |
| `practice_project_categories` | `project_id FK, category_id FK, sort_order, is_primary`；复合唯一，最多一个主分类 |
| `practice_project_stages` | `id PK, project_id FK, slug, title, description, expected_result, sort_order, prerequisite_stage_id FK?, status, version`；同项目 slug 唯一，前置阶段同属项目且不可循环 |
| `practice_project_lessons` | `id PK, stage_id FK, learning_lesson_id FK, slug, is_preview, is_required, sort_order, status, version`；项目路径与阶段归属由服务端验证 |

`status=draft/published/archived` 是内容发布状态，不能混用为用户的“开发中/已完成”。`purchased`、`locked` 是当前用户的访问结果，不作为所有人共用的项目属性。

项目可属于多个分类，例如“AI SaaS + AI Agent”。已有 `category` 字符串按明确映射迁入分类关系，保留兼容字段直至旧调用方迁完；不能重新按标题推断分类。停用分类不删除其中项目，已有项目在“全部项目”仍可见。

### 6.2 与课程方案共用的课时内核

上一份课程方案提出 `course_lessons` 与媒体/笔记能力，但尚未实施。本次建议在写迁移前统一一次边界：

| 表 | 主要字段 / 约束 |
| --- | --- |
| `learning_lessons`（共享教程） | `id PK, title, subtitle, status, version`；知识内容身份，不直接拥有课程/项目权益 |
| `course_lessons`（课程投放） | `id PK, chapter_id FK, learning_lesson_id FK, sort_order, is_preview, status, version` |
| `lesson_contents`（共享内容编排） | `id PK, learning_lesson_id FK, library_id FK, role, sort_order, is_required`；原资料由 `content_library` 维护 |
| `lesson_operations` | `id PK, project_lesson_id FK, instruction_library_id FK, sort_order, expected_asset_id FK?, version` |
| `lesson_assets` | `id PK, learning_lesson_id FK, asset_id FK, role, sort_order, access_rule`；原件仍在 `assets` |
| `ppt_decks / ppt_slides / video_slide_mappings` | 与课程方案共用，绑定共享教程、稳定页 ID 和媒体版本，只迁移一次 |
| `course_project_lesson_links` | `course_lesson_id FK, project_lesson_id FK, relation_type, sort_order`；推荐/前置阅读关系，不授予访问权 |

课时内容访问必须带课程投放或项目投放的上下文；不能通过一个裸 `learning_lesson_id` 绕过付费权限。旧课程的 `content_items` 使用兼容读取，管理员明确关联后才升级，不重写旧课程的全部数据。

这是**两份待确认方案的协调建议**，不是宣称当前已经有共享课时表；实施时以一次联合 Schema 审查确定，不允许课程与项目分别建两套 PPT/视频/笔记表。

### 6.3 Prompt 与验收

| 表 | 主要字段 / 约束 |
| --- | --- |
| `prompt_definitions` | `id PK, library_id FK UNIQUE, usage_instructions, current_revision_id, status, version`；库资料类型必须为 prompt |
| `prompt_revisions` | `id PK, prompt_id FK, version_number, body_snapshot, description_snapshot, change_note, created_by, created_at`；同 Prompt 版本唯一，发布后不可改写 |
| `project_prompts` | `id PK, project_lesson_id FK, prompt_id FK, prompt_revision_id FK, sort_order, usage_override?`；stage/project 由课时归属推导，避免矛盾外键 |
| `project_checklist_items` | `id PK, stage_id FK?, project_lesson_id FK?, title, instructions, required, evidence_type, sort_order, version, status`；阶段或课时目标二选一 |
| `project_content_releases` | `id PK, project_id FK, release_number, manifest_json, published_by, published_at`；记录发布时的课时/Prompt/清单版本及 ID，不另存一套可编辑正文 |

Prompt 原文只有资料库这个编辑来源；`body_snapshot` 是不可变历史版本，不是可以各自修改的第二份正文。发布 Prompt 新版本后显式更新项目引用，不静默把用户正在执行的 Prompt 换掉。

### 6.4 用户项目执行与成果

| 表 | 主要字段 / 约束 |
| --- | --- |
| `user_project_runs` | `id PK, user_id FK, project_id FK, release_id FK, status, current_stage_id FK?, current_lesson_id FK?, current_prompt_id FK?, last_learned_at, started_at, completed_at, archived_at, version`；首版一个账号/项目一个实例 |
| `user_project_lesson_states` | `run_id FK, project_lesson_id FK, status, completed_at, version`；复合主键 |
| `user_project_stage_states` | `run_id FK, stage_id FK, acceptance_status, accepted_at, checklist_revision, version`；复合主键 |
| `user_project_task_states` | `run_id FK, checklist_item_id FK, checked, evidence_text, evidence_asset_id FK?, updated_at, version`；复合主键 |
| `project_result_links` | `run_id FK UNIQUE, user_id FK, achievement_id TEXT, version`；指向现有私人成果，服务器验证同一用户 |

项目笔记使用统一笔记存取层，增加项目/阶段/课时引用；不复制成另外一个不可在“学习笔记”找到的孤岛。公共学习位置由共享课时进度服务保存；项目执行状态另存，因为它表达的是开发和验收。

成果正文保存在现有 `workspace_state.achievements`，增补可选的项目来源、截图资产、GitHub URL、完成技能、完成时间和上线确认字段。旧成果没有这些字段仍可读写；项目成果关联与 JSON 更新在同一数据库事务完成，检测原状态版本，重试不能生成重复成果。

### 6.5 商品与权益扩展

- 扩展既有 `products`：`pack_id` 可空，增加 `practice_project_id FK`，用 CHECK 保证只指向课程或项目之一，分别建立唯一索引；订单项继续引用同一个商品表。
- 扩展既有 `entitlements`：同样支持课程/项目二选一的目标，并分别约束 `(user_id, pack_id)` 与 `(user_id, practice_project_id)` 唯一。
- 增加共用 `entitlement_grants` 授权来源流水和退款记录，供课程/项目共用。来源可为购买、人工授权或已启用的会员；同一项目多来源并存时，撤销一个来源不能误伤其他来源。
- `purchasedAt` 来自关联订单的真实支付时间；人工授权不伪装为购买。价格、币种由商品服务计算，卡片与详情读取同一个有效价格。
- 将表的 NOT NULL/FK 约束改为上述结构时，需要经验证的 SQLite 表重建迁移：保留原主键、订单/权益引用，完整外键检查；不在运行中临时忽略约束凑数。

### 6.6 迁移和开发示例策略

采用与课程方案共用的 `schema_migrations` 账本，迁移编号不重复。对数据副本执行 dry-run、重复执行和一致性校验；上线前再做数据库一致性备份与私有附件备份，不能只复制运行中 WAL 数据库的主文件。

你本次允许六个开发示例，方案安排为：显式命令导入**独立本地演示数据库**，通过正常 API 展示，页面标注“开发示例”；默认启动、默认迁移、生产部署都不执行。六个项目为 AI 面试助手、AI 工具聚合站、AI 健康饮食管理 App、AI SEO 自动化工具、微信 AI 小程序、AI Agent 自动化工作流。演示指标须与演示数据一致，不能填不存在的 26 节教程或 38 个 Prompt；不导入真实账号的进度和权益。

## 7. API 设计

### 项目发现与详情

| 接口 | 功能 |
| --- | --- |
| `GET /api/project-categories` | 活跃分类、顺序和真实项目数 |
| `GET /api/practice-projects?q=&category=&sort=&cursor=&limit=` | 数据库级搜索、筛选、排序、分页及公开卡片 DTO |
| `GET /api/practice-projects/:slug` | 独立详情、已发布目录、价格/权益、教程与材料数量，不泄露付费正文 |
| `GET /api/practice-projects/:slug/lessons/:id` | 返回授权的课时内容、步骤、Prompt 引用、课件和清单 |
| `GET /api/practice-projects/:slug/prompts/:id` | 校验项目/阶段/课时关系后返回允许版本的 Prompt |
| `GET /api/practice-projects/:slug/resources` | 授权资料清单及短期下载入口 |

已有 `/api/projects/:slug` 实际读取课程包，且资源中心也在调用；保留为兼容端点，不把它直接改成另一个数据实体。

搜索覆盖项目名称、简介、技术栈和标签；参数长度、分页大小、排序字段使用白名单，SQL 参数化。筛选/搜索结果与总数来自同一可发布内容范围。

### 个人项目执行

| 接口 | 功能 |
| --- | --- |
| `GET /api/me/projects` | 本人实例、待开始/进行中/已完成、最近操作目标 |
| `POST /api/me/projects/:projectId/start` | 幂等加入/开始；在有权限且有已发布课时时创建实例 |
| `GET /api/me/project-runs/:id` | 恢复本人阶段、课时、Prompt、验收和权限状态 |
| `PATCH /api/me/project-runs/:id/position` | 版本化保存当前位置，不接收客户端伪造的总进度 |
| `PUT /api/me/project-runs/:id/tasks/:taskId` | 保存清单勾选和证据，验证当前发布版本与归属 |
| `POST /api/me/project-runs/:id/lessons/:lessonId/complete` | 校验本节必需任务后完成；返回下一步 |
| `POST /api/me/project-runs/:id/stages/:stageId/accept` | 服务端检查必学课时/验收清单，事务更新阶段状态 |
| `POST /api/me/project-runs/:id/result` | 幂等创建/关联私人成果草稿；不自动公开发布 |
| `PATCH /api/me/project-runs/:id` | 归档/恢复等允许的个人状态变更 |

### 管理、支付与 AI

- 扩展 `/api/admin/platform/projects`，增加分类、阶段、课时、操作步骤、Prompt、清单、资源绑定、发布预览和历史版本子接口。
- 共用 `/api/admin/platform/library` 与现有附件上传；发布前检查引用是否有效、是否有权供该项目使用、媒体是否准备完毕。
- `POST /api/orders` 接收现有商品 ID；项目购买和课程购买进入相同的订单流程。
- 项目 AI 通过共用的 AI 服务接口附带 `projectId/runId/stageId/lessonId/promptId` 等上下文引用；服务器重新解析，不相信前端上传的“我已购买/已验收”。

统一响应约束：401 未登录、403 无有效访问权、404 不存在/不应公开、409 版本冲突、429 限流、503 服务未配置。错误不能显示成“保存成功”。返回 `access.reason` 区分“未购买”“前置阶段待验收”“内容待发布”，避免所有锁都弹购买框。

## 8. Route 设计

| 路由 | 用途 |
| --- | --- |
| `/projects` | 项目首页，筛选/搜索/排序状态放在查询参数 |
| `/projects/:slug` | 独立项目详情，替代目前只在列表上弹窗的交互 |
| `/projects/:slug/workspace` | 根据本人保存记录恢复阶段/课时/Prompt |
| `/projects/:slug/workspace/:stageSlug/:lessonSlug` | 工作台稳定深链接，支持刷新和分享目录位置，不分享私人笔记 |
| `/admin/projects` | 原项目管理入口，扩展分类及课程包编排 |
| `/admin/projects/:id` | 项目编辑与预览，复用管理平台权限 |
| `/achievements` | 现有成果页；项目完成后打开待确认的个人成果，不新增第二个成果中心 |
| `/tutor` | 原导师页面，可接收项目上下文引用并保留返回项目入口 |

路由解析先匹配 workspace 深路径，再匹配详情，最后列表。保留旧 `/projects/:slug` 可用，未发布或不存在时展示清晰状态；登录后回到原目标，浏览器前进/后退恢复筛选，不重新建立账号会话。

## 9. 页面结构

### 项目首页：以本次设计图为主要视觉参考

- 左侧使用原共享 Sidebar，保留 228px 默认、调整宽度/隐藏/图标模式和手机抽屉，不能用新页面 CSS 偷改所有页面的导航。
- 主区采用浅色、较低的 Hero：项目标题与说明在左、设备/产品示意图在右；四个价值说明在同一横向区，主 CTA 用黑色。紫色用于选中分类、进度、辅助强调。
- 分类、搜索、排序紧接 Hero；分类完全由 API 返回，多余分类收进“更多”。
- 主内容宽度充足时三列卡片，收窄到两列，手机一列；侧栏约 300px，但先让位于可读卡片，而非缩小字号。
- 卡片保持：封面 → 标题/简介 → 技术标签 → 教程/PPT/Prompt 数 → 难度/预计时长 → 查看项目。状态与推荐标记使用小型标签，不堆叠多块高饱和色。
- 右侧依次：本人项目进度、项目上下文导师、六步学习路径。平板可折叠/移到主内容后，手机 AI 使用抽屉或底部面板。
- 骨架/加载、网络失败可重试、空目录、筛选无结果、游客与无个人项目分别处理。

### 指标与排序的真实含义

- 教程数＝已发布项目课时数；PPT 数＝独立已发布课件数量，不是页数；Prompt 数＝当前项目可用的独立 Prompt 资产数，重复投放不重复计数。
- 难度由管理员设置 1–5 并配可读文本；未配置显示“难度待定”，不自动给三星。
- 预计时间为管理员配置，不用视频时长冒充全部开发耗时。
- 学习人数＝去重后的真实开始用户，不是浏览、购买或 Prompt 复制数。无数据时显示真实 0 或隐藏宣传数字。
- 推荐排序＝明确推荐权重/后台顺序；最新＝首次真实发布时刻；难度排序使用配置值，未配置置后。
- 最热门首版可按近 30 天真实开始人数排序，并显示口径；不编造热度。学习人数按累计真实开始人数排序，所有并列情况采用稳定 ID/排序兜底。
- `isHot` 可由限时人工精选标记或真实排名规则得出，但须区分“编辑精选”和“学习热度”。`isNew` 根据真实发布时间窗口派生，不能迁移时把所有旧项目标成最新。
- 权益未开通时，不照抄截图的“升级 Pro 解锁全部”“专属 AI 无限答疑”等承诺。

### 详情页

提供项目目标、最终效果、适合人群/前置要求、技术栈、难度、预计时间、内容统计、阶段目录、预期成果、源码/资源可用范围、购买信息。

免费且可开始：开始项目；已购买：继续项目；未购买：试看或购买；仅介绍已发布但教程待发布：明确“教程准备中”，不能跳转空白工作台。锁定资源只显示允许公开的元数据。

### 项目工作台基础框架

左侧项目阶段/课时目录；中间教程、PPT、操作步骤、预期效果与验收；右侧版本明确的 Codex Prompt、导师和项目笔记。继续复用公共顶栏；如切换为专注模式，只替换公共 shell 内的内容导航槽位，不新造一套账号/品牌栏。

初版必须让实际已有内容可读、Prompt 可复制、清单可保存、阶段可验收、进度可恢复，不能用一张概念图充当工作台。视频/PPT 同步依赖课程方案中的共享内核：内核尚未完成时明确标记功能阶段，不宣称“完整学习工作台已完成”。

## 10. Component Tree

```text
WorkspaceShell（共用顶栏 / Sidebar / 账号）
└── ProjectRoutes
    ├── ProjectsCatalogPage
    │   ├── ProjectHero
    │   ├── ProjectFilterBar（Categories / Search / Sort）
    │   ├── ProjectCardGrid → ProjectCard
    │   └── ProjectSideRail
    │       ├── MyProjectProgress
    │       ├── ProjectTutorContextCard
    │       └── ProjectLearningJourney
    ├── ProjectDetailPage
    │   ├── ProjectOverview / Outcomes / Requirements
    │   ├── ProjectStageOutline
    │   ├── ProjectResourceSummary
    │   └── ProjectAccessAction
    └── ProjectWorkspacePage
        ├── ProjectStageDirectory
        ├── ProjectLessonPanel
        │   ├── SharedLessonMedia（视频 / PPT / 图文 / 代码）
        │   ├── OperationSteps / ExpectedResult
        │   └── LessonChecklist / StageAcceptance
        └── ProjectWorkPanel
            ├── PromptPanel（版本 / 使用说明 / 复制）
            ├── SharedTutorPanel（项目上下文）
            └── SharedNotesPanel（项目来源）

AdminShell
└── ProjectEditor
    ├── CategoryManager / ProjectMetadata
    ├── StageEditor / LessonComposer
    ├── PromptLibraryPicker / PromptRevisionEditor
    ├── ChecklistEditor / AssetPicker
    └── Preview / Publish / History
```

API 查询、个人状态和访问判断封装成独立 hooks/services；组件不直接拼接数据库规则，不把管理员表单、项目阅读器和支付判断继续集中进单个大文件。

## 11. Project / Stage / Lesson / Prompt 的关系

```text
practice_projects（实战项目）
  └─ practice_project_stages（顺序开发阶段）
       ├─ 阶段验收清单
       └─ practice_project_lessons（实战课时投放）
            ├─ learning_lessons → 共享教程资料 / 视频 / PPT
            ├─ lesson_operations → 操作步骤 / 预期截图
            ├─ project_prompts → Prompt 定义 → 不可变版本
            ├─ 本节验收清单 / 实践任务
            └─ 用户执行记录（与作者内容分离）
```

一个课时可有多个有序 Prompt，一个 Prompt 可被多个课时引用。API 可返回 projectId/stageId/lessonId 方便界面使用，但关系从真实外键推导，不能接受彼此不匹配的 ID。

复制 Prompt：只复制当前有权读取的指定版本；真正写入剪贴板后才提示成功，失败提供选中文本手动复制。操作步骤可包含变量填空和注意事项，但不自动读取用户机器上的代码、`.env` 或密钥。

未来复制量只表示“复制事件”，不能宣传为“执行次数/成功次数”。收藏采用带类型与 ID 的记录，避免把 Prompt ID、项目 ID 和课程 ID 当作同一种数字而碰撞。

## 12. Course 与 Project 的关系

两者不完全割裂，也不直接共用业务完成状态：

| 能力 | 共享还是独立 |
| --- | --- |
| 原资料、视频、PPT、文件、Prompt 源 | 共享，明确投放上下文 |
| 播放器、PPT Viewer、富文本/时间点笔记组件 | 共享一个实现 |
| 课程章节与项目阶段 | 独立；知识章节不是项目验收阶段 |
| 教程阅读/观看历史 | 可共用内容级记录，并保留访问来源 |
| 课时练习/阶段验收 | 项目执行记录独立；学完课程不等于项目验收通过 |
| 商品/订单/支付服务 | 共享基础设施，商品目标与权益独立 |
| 课程与项目推荐 | 显式关联，无隐式授权 |
| AI | 同一服务，按课程/项目上下文切换 |

旧 `practice_project_courses` 只代表关联。购买一个项目不自动拥有推荐课程；买了课程也不自动拥有项目。若将来售卖明确的组合包，必须在商品权益中明确列出范围，由后端事务发放。

现有项目“按关联课程资料计算的进度”保留为标注清楚的历史学习信息，不迁成已通过项目验收。启用独立项目编排后，新的右侧开发进度按本人执行记录计算。

## 13. Payment 权限方案

### 商品与访问状态

项目内容类型可为 free/paid/membership，但 `membershipIncluded` 只有在真实会员方案和服务端会员权益上线后才生效；本阶段不能把浏览器显示的“普通会员”当有效付费凭证。

统一的 `canAccessProjectPlacement(user, placement, context)` 负责：

1. 项目、阶段、课时、资料均已发布且关系有效。
2. 当前用户状态正常、会话有效。
3. 访问来源为免费/明确试看/有效项目权益/明确组合包/管理预览之一。
4. 该操作允许访问对应文件、Prompt 版本或 API；阶段推进锁与商业购买锁单独计算。

**共享资料不意味着共享权益**：项目购买仅允许在已授权的项目投放中读取相应资料，不能据此遍历原课程全部资料。公开试看文件一旦放行即可能被保存，不把相同字节的文件同时宣传为绝对保密。

### 购买与支付

继续使用现有订单/订单项/支付记录。服务器读取价格与商品状态，创建快照订单；真实渠道回调需签名、金额/币种/订单校验、唯一交易号和幂等处理，事务发放权益。退款/撤销只影响对应授权来源，已创建的私人笔记和成果不得因此删除。

现有人工确认收款保留，但收款/退款操作限定管理员财务权限，不能因为编辑者能维护教程就允许确认收款。未选择真实渠道前，不能将创建订单或回调模拟视为支付上线成功。

项目源码下载、Prompt 原文、PPT 页/原件、视频、字幕、AI 检索和任务证据都分别检查权限。文件令牌短期有效且可重新鉴权续期；页面上有锁图标不构成安全措施。

## 14. Progress 方案

### 创建与恢复

访问列表/详情不创建项目实例。点击“开始项目”时幂等创建记录，保存当时项目发布版本；重复点击恢复同一实例。付费购买但尚未开始可展示为“待开始”，免费项目只有用户主动加入后才计入个人列表，不能把整个免费目录算作我的项目。

保存当前阶段、课时、Prompt、媒体位置和清单状态。正文阅读进度与项目执行进度分开；用户回到某节复习，不把后续已验收状态改成未完成。

### 计算口径

- 课时完成：所有必需实践项完成后，由用户明确点击提交；看视频或复制 Prompt 不自动完成。
- 阶段验收：必学课时完成 + 必需阶段验收项满足；在服务器事务内判定并记录版本。
- 首版进度可按“必学课时完成单元 + 阶段验收单元”等权聚合，并在界面解释；客户端不能写入 100%。零课时项目不算完成。
- 已完成项目：所有必需阶段验收完成；仅意味着按平台清单完成，不代表平台独立审计了外部产品。
- “已上线”“已接入支付”“获得首位用户”“首笔收入”是单独的成果里程碑，必须由用户填写/确认相应信息，不能从学习进度推导。

未满足前置阶段时，下一阶段显示“待前一阶段验收”；与“未购买”区分，不诱导已购用户重复购买。阶段锁是否允许预览由后台策略明确，默认只开放目录元数据。

### 版本与一致性

逐条状态使用版本号/`If-Match`，写入失败不先显示成功；多端冲突明确提示。新增课程内容不悄悄改变旧验收记录：个人实例绑定内容发布版本，管理员发布新版后，提示可更新及受影响清单，保留旧完成依据。撤下敏感资料仍可立即阻断访问，不能因历史版本继续公开。

### 成果衔接

完成项目后提供“整理我的成果”。以真实项目目标和实际时间预填私人草稿，让用户补项目介绍、截图、项目 URL、可选 GitHub URL、技术栈和已完成技能。

保存为 `achievements` 中的一项带来源的记录；幂等关联、允许编辑/归档/恢复，不公开到社区。不默认填“你的产品已经上线”。证书发放、外部代码测试和线上可用性验证尚未接入时不显示验证通过。

## 15. AI Tutor 集成方案

复用现有 `/tutor` 入口和课程方案拟定的服务接口，增加 `ProjectContextProvider`，不创建另一套聊天账号或独立模型密钥。

上下文为：当前项目、发布版本、阶段目标、当前课时、指定 Prompt 版本、用户自己的验收状态、用户主动提供的问题/笔记。数据由服务器根据当前账号查出；未购买的课时、别人的成果或私有代码不进入模型上下文。

推荐问题可由后台阶段配置，或根据“初始化/登录/支付/部署”等显式主题匹配，不依赖标题猜用户正在做什么。跳转导师保留返回工作台位置，手机用同一个面板的抽屉形式。

没有真实模型配置时：展示“尚未连接 AI 服务”，允许保存带项目上下文的私人问题；不播放示例回答冒充生成结果。连接后统一限流、预算、超时、来源引用和隐私提示；输入代码/日志先提醒清理密钥，模型不得自动运行命令、部署或支付。

## 16. 开发 Phase

遵循本次的 11 阶段顺序；权限校验从 API 第一版就有，Phase 9 是支付闭环，不是最后才补安全。

| Phase | 实施范围 | 阶段出口 |
| --- | --- | --- |
| 1 阅读与方案 | 当前结构核查、19 项方案、课程/项目边界协调 | 用户确认；本轮在此停止 |
| 2 数据模型/Migration | 动态分类、项目阶段/课时、共享教程关系、执行记录、必要权益模型 | 隔离迁移通过，旧数据完整，无自动示例导入 |
| 3 Project API | 列表、搜索/排序/分页、详情、访问判断；同步扩展后台最小维护能力 | 可以从后台建立项目，由学员 API 读取正确发布版本 |
| 4 项目首页 | 按图实现 Hero、三列卡片、动态过滤和辅助栏 | 多尺寸视觉检查、真实空态、隔离演示 API 数据展示 |
| 5 详情页 | 独立路由、目录、成果目标、素材摘要、购买/试看入口 | 刷新/深链接/登录返回、锁定信息准确 |
| 6 个人进度 | 开始/恢复、项目实例、课时任务与阶段验收 API | 多用户隔离、幂等、冲突保护，服务端计算进度 |
| 7 Workspace 基础 | 阶段目录、教程、操作步骤、清单/验收、笔记入口 | 能真实完成一个开发阶段并恢复；复用已实现的媒体内核 |
| 8 Prompt System | 后台版本维护、引用、查看/复制、使用说明 | 正确版本、真实复制提示、归档与付费内容不泄漏 |
| 9 Payment / Access | 统一商品和权益、人工流程加固、确定渠道后的回调与退款 | 支付状态机、重复通知、金额校验、过期权益测试 |
| 10 AI Context | 项目上下文、导师入口/问答、课程服务复用 | 无配置诚实降级，已配置时真实调用与权限隔离 |
| 11 Testing / Optimization | 全流程、性能、响应式、安全、迁移回退演练 | 基线与新测试通过，交付完整验收记录 |

后台不是拖到最后才做：分类在 Phase 2–3 同步维护，阶段/课时在 Phase 3，操作/验收在 Phase 6–7，Prompt 版本在 Phase 8。否则前台再漂亮也无法供管理员真正运营。

建议第一个可检查里程碑为 Phase 2–6：后台可维护，首页/详情真实读取，账号能加入和恢复项目。随后完成工作台、Prompt 和验收交互。完整视频/PPT/富文本能力与课程方案共同排期，不能在两边重复开发，也不承诺在课程内核尚未完成时全部可用。

每阶段运行构建和相关测试，最终跑全量回归。目前项目没有 TypeScript/Lint 脚本；批准后先补适合 JS/JSX 的 Lint 与接口结构检查，若采用 TS 新模块再明确类型检查配置。不把未配置的检查报成已通过，不整体迁移现有项目语言。

## 17. 预计修改文件

### 现有文件

- `src/ProjectsCatalog.jsx`、`src/project-model.js`、`src/projects.css`：目录、动态分类、搜索、统计与卡片结构。
- `src/App.jsx`、`src/workspace-navigation.js`：详情/工作台路由顺序、深链接、账号返回。
- `src/Workspace.jsx`、`src/workspace-responsive.css`：仅必要的上下文/响应式接口，保留现有公共布局偏好。
- `src/AdminPlatform.jsx`、`src/AdminCms.jsx`、`src/AttachLibrary.jsx`、`src/admin-cms.css`：分类与项目编排、真实资源和 Prompt 管理。
- `src/AiTutor.jsx`、`src/tutor-model.js`：项目上下文适配，保留独立导师既有页面。
- `src/NotesWorkspace.jsx`、`src/AchievementsWorkspace.jsx`、`src/FavoritesWorkspace.jsx`、`src/personal-model.js`：带来源的笔记/成果/收藏兼容，不重做布局。
- `server/db.mjs`、`server/platform-content.mjs`、`server/index.mjs`：注册迁移与项目领域 API，兼容原字段/路由。
- `server/materials.mjs`、`server/workspace-routes.mjs`：项目投放鉴权、私人记录关联与冲突校验。
- 原支付处理代码、`server/config.mjs`、`.env.example`：统一商品目标、权益与渠道配置，绝不放入真实密钥。
- `package.json`、锁文件、相关测试脚本：新增必要依赖/检查，保持 Sites 构建契约。

### 拟新增模块

- `src/projects/`：目录子组件、详情、工作台、阶段验收、Prompt 面板及数据 hooks。
- `src/admin-projects/`：分类、阶段、课时、清单、Prompt 版本和发布预览。
- 与课程共用的 `src/learning/` 或课程组件目录：媒体/PPT/笔记组件，只选择一个实现位置。
- `server/practice/`：项目目录、编排、执行记录、验收、访问与上下文服务。
- `server/prompts/`：Prompt 定义/版本/引用，复用资料库正文。
- `server/migrations/`：与课程共用的迁移文件和校验。
- `server/payments/`、共用 AI 服务：按后续确认的接入范围实现，不创建同名不同逻辑的平行服务。
- `tests/practice-*.test.mjs`、`tests/prompt-versions.test.mjs`：新增功能及权限回归。
- `tests/fixtures/practice-projects.*`、显式本地演示导入脚本：仅用于隔离开发环境。
- `docs/practical-projects-admin-guide.md`、`docs/practical-projects-qa.md`：后台使用和分阶段测试记录。

原 `server/project-routes.mjs` 的课程兼容 API 不直接换语义。`.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs`、`tests/sites-worker.test.mjs` 保持不变。保留所有现有未提交修改，不重置工作区。

## 18. 风险与实施边界

1. **课程名与项目名历史混淆**：现有接口/表名含 project，但部分实际属于课程。显式区分实体、保持兼容，不全局替换名字。
2. **课程方案尚未批准**：媒体、课时、AI 是共同基础。两份方案需先确认共同 Schema，不能假设上轮已开发或同时创建重复基础模块。
3. **发布条件变化**：旧项目必须关联课程，新独立项目可有自己的教程。增加 `content_mode` 与发布校验；旧项目继续按旧方式访问，不强制迁移成空课时。
4. **上线/收入真实性**：自主勾选只代表自检。没有外部验证就不能宣称真实上线、支付成功、获得用户或官方认证；成果默认私人。
5. **共享源更新**：变更 Prompt、清单和课程资料可能影响在学用户。使用发布版本、稳定 ID、变更提示和可恢复历史，保留验收依据。
6. **项目付费越权**：需要扩展当前只认识课程的附件鉴权，而不是给已购项目用户全部课程通行证。
7. **旧成果/收藏**：整体 JSON 状态保存可能覆盖关联字段，必须更新校验与合并策略；不同资源类型 ID 不可混淆。
8. **示例内容污染**：本次允许开发示例，但只进入隔离演示库，生产构建/启动不导入、不宣传虚假人数。
9. **媒体与模型成本**：大视频、PPT 转换、AI 请求需要实际服务配置与容量验证。现有附件上限为 50 MB，不适合直接承诺长视频商用承载。
10. **支付/模型依赖**：商户渠道、会员规则、模型服务和预算尚需确定；不影响先完成数据/API/布局，但会影响真实商业支付和 AI 验收。
11. **安全**：源码 ZIP 和 Prompt 不在服务器执行；URL 不自动抓取内网地址；私人截图/证据需本人权限。项目教程中的命令是展示内容，不是平台运维授权。
12. **部署范围**：本轮没有授权发布；未来上线必须单独进行备份、迁移、回归和回退准备，不触碰无关产品。

## 19. 测试方案

### 数据与 API

- 空库、旧数据副本、重复迁移、外键/唯一约束、商品表重建后订单/权益 ID 和关系完整。
- 分类新增、重排、停用、多分类、旧枚举映射；搜索中文/技术标签/特殊字符；稳定分页和排序。
- 草稿/归档项目、阶段、课时、Prompt、资料不能从列表、直接 URL、附件、AI 上下文等绕过访问。
- 不同用户、普通学员、编辑者、管理员的操作范围；过期/撤销/未生效权益；共享课程与项目互不误授权。
- 开始项目幂等；不存在或跨项目的 stage/lesson/prompt/task ID 拒绝；客户端伪造百分比不生效。
- 必学任务缺失不能验收；重复提交不重复创建成果；版本更新、并发保存、归档恢复不丢私人记录。
- Prompt 草稿/已发布版本、引用同源更新、固定历史版本、已撤下版本访问、剪贴板成功/失败。
- 支付重复/伪造回调、金额/币种不符、商品下架、退款、多来源权益；内容编辑者不能确认收款。
- AI 未配置、超时、限流、跨账号/课程内容请求、敏感输入提示及来源引用。

### 前端与全流程

1. 管理员建立分类 → 创建项目 → 阶段/课时 → 引用素材/Prompt → 配置清单 → 预览 → 发布。
2. 学员搜索/筛选 → 打开详情 → 试看或获得有效权益 → 开始项目。
3. 学习内容 → 复制 Prompt → 保存任务 → 阶段验收 → 刷新恢复。
4. 完成项目 → 整理私人成果 → 在“我的成果”编辑/归档/恢复。
5. 退出再登录、浏览器后退/前进、链接刷新、断网/重试、多标签页冲突。
6. 390、768、1024、1440、1920、2560px，侧栏 228/360/图标/隐藏模式，中文长标题、空图、慢图与 200% 缩放。先折叠辅助栏，不把正文缩成参考图截图里的小字。
7. 键盘访问、筛选状态、读屏标签、抽屉焦点、对比度、44px 控件和清晰保存状态。
8. 公共首页、工作台、学习课程、资源中心、导师、社区、笔记/收藏/成果、管理平台的回归。

### 本轮基线记录

2026-09-29 本轮重新运行 `npm test`：**83 项通过、0 失败**（平台/模型 37、API 42、Sites 4）。测试使用隔离临时数据库；日志中的 seed 不代表生产示例导入。已在本地浏览器验证当前 `/projects` 的真实空态和现有辅助栏。

`npm run build` 已通过，生成 `dist/client/index.html`、`dist/server/index.js` 和 `dist/.openai/hosting.json`；构建后再次运行 `test:sites`，4 项通过。当前 JS 主包约 721.94 kB（gzip 203.24 kB），存在大于 500 kB 的体积警告，新增工作台/媒体/编辑器模块应按需加载。现有项目未配置 TypeScript/Lint，不将其计为通过。以上只是旧系统基线，不代表本文中的新功能已完成。

---

**请确认本方案，尤其是：课程与项目共享内容内核、项目验收独立、沿用同一支付/权益体系、六个示例仅限隔离开发环境。确认后从 Phase 2 的增量模型与迁移开始，不直接修改生产。**
