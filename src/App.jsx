import {createRouteNavigation} from './navigation-save.js';
import {recordRoute} from './telemetry.js';
import { courseLearningPath, learningSlug } from "./course-reader-model.js";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Article,
  Bell,
  BookOpenText,
  Books,
  BracketsCurly,
  CaretDown,
  CaretRight,
  ChartLineUp,
  ChatCircleDots,
  Check,
  CheckCircle,
  Circle,
  Clock,
  Code,
  Compass,
  CopySimple,
  Cube,
  DownloadSimple,
  FileText,
  Folder,
  Gauge,
  Globe,
  House,
  Infinity as InfinityIcon,
  Lightning,
  LinkSimple,
  List,
  MagnifyingGlass,
  MapTrifold,
  NotePencil,
  PaperPlaneTilt,
  Package,
  Path,
  Play,
  Plus,
  Robot,
  Rocket,
  SlidersHorizontal,
  Sparkle,
  Target,
  TerminalWindow,
  Trophy,
  UserCircle,
  VideoCamera,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { api, getToken, money, subscribeToSession } from "./api.js";
import { canManage } from "./platforms.js";
import { PublicHomepage } from "./PublicHomepage.jsx";
import {FavoriteButton} from './FavoriteButton.jsx';
import {
  normalizeWorkspaceRoute,
  workspaceSearchPrompts,
} from "./workspace-navigation.js";
import {RouteLoadBoundary} from './RouteLoadBoundary.jsx';
import {NotFound} from './NotFound.jsx';

// Stable module-scope lazy components preserve the mounted workspace and drafts.
const CourseReader=lazy(()=>import('./CourseReader.jsx').then(m=>({default:m.CourseReader})));
const AccountSettings=lazy(()=>import('./AccountSettings.jsx').then(m=>({default:m.AccountSettings})));
const ProjectsHub=lazy(()=>import('./ProjectsHub.jsx').then(m=>({default:m.ProjectsHub})));
const CourseOfferPage=lazy(()=>import('./CourseOffer.jsx').then(m=>({default:m.CourseOfferPage})));
const Workbench=lazy(()=>import('./Workbench.jsx').then(m=>({default:m.Workbench})));
const WorkspaceShell=lazy(()=>import('./Workspace.jsx').then(m=>({default:m.WorkspaceShell})));
const WorkspaceHome=lazy(()=>import('./Workspace.jsx').then(m=>({default:m.WorkspaceHome})));
const CourseLearningSpace=lazy(()=>import('./CourseLearningSpace.jsx').then(m=>({default:m.CourseLearningSpace})));
const ProjectsCatalog=lazy(()=>import('./ProjectsCatalog.jsx').then(m=>({default:m.ProjectsCatalog})));
const AiTutor=lazy(()=>import('./AiTutor.jsx').then(m=>({default:m.AiTutor})));
const ResourceCenter=lazy(()=>import('./ResourceCenter.jsx').then(m=>({default:m.ResourceCenter})));
const PersonalWorkspace=lazy(()=>import('./PersonalWorkspace.jsx').then(m=>({default:m.PersonalWorkspace})));
const WorkspacePages=lazy(()=>import('./WorkspacePages.jsx').then(m=>({default:m.WorkspacePages})));
const AuthPage=lazy(()=>import('./Auth.jsx').then(m=>({default:m.AuthPage})));
const UserAuthCard=lazy(()=>import('./Auth.jsx').then(m=>({default:m.UserAuthCard})));
const AccountPage=lazy(()=>import('./Auth.jsx').then(m=>({default:m.AccountPage})));
const LegalPage=lazy(()=>import('./ServiceCenter.jsx').then(m=>({default:m.LegalPage})));
const SupportCenter=lazy(()=>import('./ServiceCenter.jsx').then(m=>({default:m.SupportCenter})));
const AdminService=lazy(()=>import('./ServiceCenter.jsx').then(m=>({default:m.AdminService})));
const AdminSupport=lazy(()=>import('./ServiceCenter.jsx').then(m=>({default:m.AdminSupport})));
const AdminLogin=lazy(()=>import('./Admin.jsx').then(m=>({default:m.AdminLogin})));
const AdminShell=lazy(()=>import('./Admin.jsx').then(m=>({default:m.AdminShell})));
const AdminOrders=lazy(()=>import('./Admin.jsx').then(m=>({default:m.AdminOrders})));
const AdminReadiness=lazy(()=>import('./AdminReadiness.jsx').then(m=>({default:m.AdminReadiness})));
const AdminAnalytics=lazy(()=>import('./AdminCommercial.jsx').then(m=>({default:m.AdminAnalytics})));
const AdminParsing=lazy(()=>import('./AdminCommercial.jsx').then(m=>({default:m.AdminParsing})));
const AdminCertificates=lazy(()=>import('./AdminCommercial.jsx').then(m=>({default:m.AdminCertificates})));
const AdminUsers=lazy(()=>import('./Admin.jsx').then(m=>({default:m.AdminUsers})));
const AdminEmail=lazy(()=>import('./Admin.jsx').then(m=>({default:m.AdminEmail})));
const AdminAccountAudit=lazy(()=>import('./Admin.jsx').then(m=>({default:m.AdminAccountAudit})));

// Management editors are not needed by visitors or learners. Keep the shell
// mounted while loading the selected editor, instead of loading every CMS first.
const AdminLearning=lazy(()=>import('./AdminLearning.jsx').then(m=>({default:m.AdminLearning})));
const AdminAi=lazy(()=>import('./AdminAi.jsx').then(m=>({default:m.AdminAi})));
const AdminPayments=lazy(()=>import('./AdminPayments.jsx').then(m=>({default:m.AdminPayments})));
const AdminRedemptionCodes=lazy(()=>import('./AdminRedemptionCodes.jsx').then(m=>({default:m.AdminRedemptionCodes})));
const AdminLoginSettings=lazy(()=>import('./AdminLoginSettings.jsx').then(m=>({default:m.AdminLoginSettings})));
const AdminCms=lazy(()=>import('./AdminCms.jsx').then(m=>({default:m.AdminCms})));
const AdminPlatform=lazy(()=>import('./AdminPlatform.jsx').then(m=>({default:m.AdminPlatform})));
const AdminPages=lazy(()=>import('./AdminPlatform.jsx').then(m=>({default:m.AdminPages})));
const AdminCommunity=lazy(()=>import('./AdminCommunity.jsx').then(m=>({default:m.AdminCommunity})));
const AdminOpc=lazy(()=>import('./AdminOpc.jsx').then(m=>({default:m.AdminOpc})));

const learningPaths = [
  {
    icon: Sparkle,
    title: "AI 工具入门",
    desc: "掌握主流 AI 工具，建立高效工作方式",
    level: "入门",
    lessons: 12,
    progress: 80,
    color: "violet",
  },
  {
    icon: BracketsCurly,
    title: "AI 编程实战",
    desc: "用 Cursor 与 Claude Code 完成真实项目",
    level: "进阶",
    lessons: 18,
    progress: 35,
    color: "blue",
  },
  {
    icon: Robot,
    title: "AI 智能体开发",
    desc: "从零构建能思考、调用工具的智能体",
    level: "进阶",
    lessons: 16,
    progress: 65,
    color: "orange",
  },
  {
    icon: Path,
    title: "AI 工作流自动化",
    desc: "连接工具与数据，自动化重复工作",
    level: "实战",
    lessons: 10,
    progress: 10,
    color: "green",
  },
  {
    icon: Cube,
    title: "AI 产品从 0 到 1",
    desc: "从想法、原型到发布你的 AI 产品",
    level: "实战",
    lessons: 24,
    progress: 0,
    color: "coral",
  },
  {
    icon: ChartLineUp,
    title: "AI 产品增长",
    desc: "用 AI、内容与数据获得持续增长",
    level: "商业化",
    lessons: 14,
    progress: 0,
    color: "purple",
  },
];

const projects = [
  {
    title: "个人 AI 助手",
    desc: "可对话、可调用工具的智能助手",
    progress: 70,
    status: "进行中",
    icon: Robot,
    color: "violet",
  },
  {
    title: "智能文档助手",
    desc: "上传文档，自动分析和总结",
    progress: 45,
    status: "进行中",
    icon: FileText,
    color: "blue",
  },
  {
    title: "AI 写作助手",
    desc: "一键生成高质量文章和内容",
    progress: 100,
    status: "已完成",
    icon: NotePencil,
    color: "green",
  },
];

const resources = [
  {
    type: "模板",
    title: "AI 产品需求文档模板",
    desc: "从用户问题到 MVP 范围的完整模板",
    icon: FileText,
    color: "violet",
  },
  {
    type: "代码",
    title: "RAG 项目起步仓库",
    desc: "包含向量检索、引用和评估的基础代码",
    icon: Code,
    color: "blue",
  },
  {
    type: "工作流",
    title: "内容自动化工作流",
    desc: "从选题、创作到分发的一站式流程",
    icon: Path,
    color: "green",
  },
  {
    type: "Prompt",
    title: "AI 编程提示词手册",
    desc: "需求分析、调试与重构的常用提示词",
    icon: Sparkle,
    color: "orange",
  },
  {
    type: "指南",
    title: "AI 产品发布检查清单",
    desc: "上线前必须确认的产品、数据和增长事项",
    icon: Rocket,
    color: "coral",
  },
  {
    type: "案例",
    title: "独立开发者 AI SaaS 案例",
    desc: "从想法验证到首批付费用户的真实拆解",
    icon: ChartLineUp,
    color: "purple",
  },
];

function ProgressBar({ value, dark = false }) {
  return (
    <span className={dark ? "ui-progress dark" : "ui-progress"}>
      <i style={{ width: `${value}%` }} />
    </span>
  );
}

function IconBadge({ icon: Icon, color = "violet", size = 22 }) {
  return (
    <span className={`feature-icon ${color}`}>
      <Icon size={size} weight="duotone" />
    </span>
  );
}

function useRoute() {
  const [route, setRoute] = useState(window.location.pathname || "/");
  useEffect(()=>{recordRoute();},[route]);
  const [navigationStatus, setNavigationStatus] = useState('');
  const navigation = useRef(null);
  useEffect(() => {
    navigation.current = createRouteNavigation(window, setRoute, setNavigationStatus);
    return () => navigation.current?.dispose();
  }, []);
  return [route, next => navigation.current?.navigate(next), navigationStatus];
}

function Toast({ text }) {
  if (!text) return null;
  return (
    <div className="toast">
      <Check size={16} weight="bold" /> {text}
    </div>
  );
}

const pathIconMap = {
  "ai-tools": Sparkle,
  "ai-coding": BracketsCurly,
  "ai-agent": Robot,
  "ai-workflow": Path,
  "ai-product": Cube,
  "ai-growth": ChartLineUp,
};
const pathColorMap = {
  "ai-tools": "violet",
  "ai-coding": "blue",
  "ai-agent": "orange",
  "ai-workflow": "green",
  "ai-product": "coral",
  "ai-growth": "purple",
};

function PathsPage({ navigate }) {
  const [filter, setFilter] = useState("全部");
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  useEffect(() => {
    api("/catalog/paths")
      .then(({ items }) => setCatalog(items))
      .catch(() => setCatalogError("暂时无法加载学习路径，请稍后重试。"));
  }, []);
  const source = (catalog || []).map((item) => ({
    ...item,
    icon: pathIconMap[item.slug] || Sparkle,
    desc: item.description,
    color: pathColorMap[item.slug] || "violet",
  }));
  const visible =
    filter === "全部" ? source : source.filter((item) => item.level === filter);
  if (catalogError)
    return (
      <div className="empty-state" role="alert">
        <p>{catalogError}</p>
      </div>
    );
  if (!catalog)
    return (
      <div className="empty-state" role="status">
        <p>正在加载学习路径…</p>
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="page-kicker">从目标出发完成真实作品</span>
          <h2>实战路径</h2>
          <p>每条路径由多个项目包组成，文档、工具和任务共同帮助你交付成果。</p>
        </div>
        <button className="black-button" onClick={() => navigate("/courses")}>
          我的课程 <ArrowRight size={16} />
        </button>
      </div>
      <div className="filter-row">
        <SlidersHorizontal size={18} />
        {["全部", "入门", "进阶", "实战", "商业化"].map((item) => (
          <button
            className={filter === item ? "active" : ""}
            key={item}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="catalog-grid">
        {visible.map(
          (
            {
              icon,
              title,
              desc,
              level,
              progress,
              color,
              slug,
              pack_count,
              starting_price_cents,
            },
            index,
          ) => (
            <button
              className="catalog-card"
              key={title}
              onClick={() =>
                navigate(
                  slug
                    ? `/paths/${slug}`
                    : title === "AI 编程实战"
                      ? "/paths/ai-coding"
                      : "/paths",
                )
              }
            >
              <div className="catalog-top">
                <IconBadge icon={icon} color={color} />
                <span>{level}</span>
              </div>
              <h3>{title}</h3>
              <p>{desc}</p>
              <small>
                {pack_count ?? 0} 个项目包 ·{" "}
                {starting_price_cents
                  ? `${money(starting_price_cents)} 起`
                  : "可免费预览"}
              </small>
              <span className="catalog-cta">
                查看项目包 <ArrowRight size={16} />
              </span>
            </button>
          ),
        )}
      </div>
    </>
  );
}

function ProductPackPage({ slug, navigate }) {
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;api("/project-packs/"+encodeURIComponent(slug)).then(pack=>{if(active)navigate(pack.entitled?courseLearningPath(pack.slug):"/course-offer?course="+encodeURIComponent(pack.slug));}).catch(e=>active&&setError(e.message));return()=>{active=false;};},[slug]);
  return <section className="empty-state">{error?<><h2>{error}</h2><button onClick={()=>navigate("/courses")}>返回课程列表</button></>:<p role="status">正在打开课程…</p>}</section>;
}

function PathDetail({ navigate }) {
  const milestones = [
    {
      title: "用 Cursor 发布第一个网站",
      desc: "从空文件夹开始，用 AI 完成页面、响应式优化与上线。",
      deliverable: "可公开访问的响应式网站",
      skills: "Cursor · Prompt · 前端基础",
      status: "4 / 12 步完成",
      icon: BracketsCurly,
    },
    {
      title: "做出个人 AI 助手",
      desc: "完成对话界面、模型接入和基础工具调用。",
      deliverable: "可对话的 AI 助手（Web）",
      skills: "接口调用 · 对话 UI · Function Calling",
      status: "未开始",
      icon: ChatCircleDots,
    },
    {
      title: "发布一个 AI 产品",
      desc: "补齐部署、产品说明和发布检查，让真实用户可以使用。",
      deliverable: "已发布的 AI 应用",
      skills: "部署上线 · 产品打磨 · 数据反馈",
      status: "未开始",
      icon: Rocket,
    },
  ];
  return (
    <>
      <button className="back-link" onClick={() => navigate("/paths")}>
        <ArrowLeft size={16} /> 返回实战路径
      </button>
      <div className="path-detail-header">
        <div className="path-title">
          <IconBadge icon={BracketsCurly} color="violet" size={28} />
          <div>
            <span className="page-kicker">项目驱动实战路径</span>
            <h2>AI 编程实战</h2>
            <p>不从知识点开始，从要做出的作品开始。</p>
          </div>
        </div>
        <div className="path-promise">
          <p>通过 3 个递进项目包，完成从 AI 编程入门到产品发布的完整实践。</p>
          <span>
            <Target size={18} /> 完成后获得 3 个可展示成果
          </span>
        </div>
      </div>
      <div className="path-detail-grid">
        <section className="surface milestone-list">
          {milestones.map(
            (
              { title, desc, deliverable, skills, status, icon: Icon },
              index,
            ) => (
              <button
                className="milestone"
                key={title}
                onClick={() => index === 0 && navigate("/learn/cursor")}
              >
                <span className="milestone-number">{index + 1}</span>
                <IconBadge
                  icon={Icon}
                  color={
                    index === 0 ? "violet" : index === 1 ? "blue" : "coral"
                  }
                />
                <div className="milestone-copy">
                  <h3>{title}</h3>
                  <p>{desc}</p>
                  <div>
                    <span>
                      <Cube size={15} /> <small>交付成果</small>
                      <b>{deliverable}</b>
                    </span>
                    <span>
                      <Code size={15} /> <small>包含内容</small>
                      <b>文档 · Prompt · 代码 · 视频</b>
                    </span>
                    <span>
                      <CheckCircle size={15} /> <small>项目状态</small>
                      <b>{status}</b>
                    </span>
                  </div>
                </div>
                <CaretRight size={20} />
              </button>
            ),
          )}
        </section>
        <aside className="path-current">
          <section className="surface current-project">
            <div className="section-row">
              <span className="page-kicker">当前项目包</span>
              <em>已解锁</em>
            </div>
            <h3>用 Cursor 发布第一个网站</h3>
            <img
              src="/assets/cursor-practice-preview.png"
              alt="Cursor 网站项目成果预览"
            />
            <div className="project-content-mix">
              <span>60% 文档</span>
              <span>20% 工具</span>
              <span>10% 任务</span>
              <span>10% 视频</span>
            </div>
            <div className="project-progress-label">
              <span>项目进度</span>
              <b>35%</b>
            </div>
            <ProgressBar value={35} />
            <h4>下一步：生成网站首屏</h4>
            <p>阅读操作步骤，复制 Prompt，并在检查清单中确认结果。</p>
            <button
              className="black-button wide"
              onClick={() => navigate("/learn/cursor")}
            >
              继续实践 <ArrowRight size={16} />
            </button>
          </section>
          <section className="surface tutor-promo">
            <IconBadge icon={Robot} size={18} />
            <div>
              <strong>AI 项目导师</strong>
              <p>根据当前步骤、代码和问题提供帮助。</p>
            </div>
            <button onClick={() => navigate("/tutor")}>
              带着问题去提问 <CaretRight size={16} />
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}

function GenericPathDetail({ slug, navigate }) {
  const [path, setPath] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/catalog/paths/${slug}`)
      .then(setPath)
      .catch((e) => setError(e.message));
  }, [slug]);
  if (error)
    return (
      <div className="empty-state">
        <h3>{error}</h3>
        <button className="black-button" onClick={() => navigate("/paths")}>
          返回实战路径
        </button>
      </div>
    );
  if (!path)
    return (
      <div className="empty-state">
        <p>正在加载学习路径…</p>
      </div>
    );
  const Icon = pathIconMap[path.slug] || Sparkle;
  return (
    <>
      <button className="back-link" onClick={() => navigate("/paths")}>
        <ArrowLeft size={16} /> 返回实战路径
      </button>
      <div className="path-detail-header">
        <div className="path-title">
          <IconBadge icon={Icon} color={pathColorMap[path.slug]} size={28} />
          <div>
            <span className="page-kicker">项目驱动实战路径</span>
            <h2>{path.title}</h2>
            <p>{path.description}</p>
          </div>
        </div>
        <div className="path-promise">
          <p>选择一个可交付成果明确的项目包，从实践开始掌握能力。</p>
          <span>
            <Target size={18} /> 文档为主，配套工具、任务与短视频
          </span>
        </div>
      </div>
      <section className="surface path-pack-catalog">
        <div className="section-row">
          <h3>项目包</h3>
          <small>{path.packs.length} 个可选项目</small>
        </div>
        {path.packs.map((pack, index) => (
          <button
            className="milestone"
            key={pack.id}
            onClick={() => navigate(`/packs/${pack.slug}`)}
          >
            <span className="milestone-number">{index + 1}</span>
            <IconBadge icon={Cube} color={pathColorMap[path.slug]} />
            <div className="milestone-copy">
              <h3>{pack.title}</h3>
              <p>{pack.description}</p>
              <div>
                <span>
                  <Target size={15} />
                  <small>交付成果</small>
                  <b>{pack.deliverable}</b>
                </span>
                <span>
                  <Clock size={15} />
                  <small>预计投入</small>
                  <b>{Math.ceil(pack.estimated_minutes / 60)} 小时</b>
                </span>
                <span>
                  <Package size={15} />
                  <small>项目包价格</small>
                  <b>{money(pack.product_price_cents || pack.price_cents)}</b>
                </span>
              </div>
            </div>
            <CaretRight size={20} />
          </button>
        ))}
      </section>
    </>
  );
}

function ProjectsPage({ navigate, notify }) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="page-kicker">用作品证明能力</span>
          <h2>我的项目</h2>
          <p>管理正在构建和已经发布的 AI 产品。</p>
        </div>
        <button className="black-button" onClick={() => setCreating(true)}>
          <Plus size={17} /> 创建新项目
        </button>
      </div>
      <div className="projects-board">
        {projects.map(
          ({ title, desc, progress, status, icon, color }, index) => (
            <article className="big-project-card" key={title}>
              <div className="project-card-top">
                <IconBadge icon={icon} color={color} />
                <em className={status === "已完成" ? "done" : ""}>{status}</em>
              </div>
              <h3>{title}</h3>
              <p>{desc}</p>
              <div className="project-tags">
                <span>{["对话 UI", "文档解析", "内容生成"][index]}</span>
                <span>{["API 调用", "RAG", "Prompt 工程"][index]}</span>
              </div>
              <div className="project-progress-label">
                <span>项目进度</span>
                <b>{progress}%</b>
              </div>
              <ProgressBar value={progress} />
              <button
                onClick={() =>
                  index === 0
                    ? navigate("/learn/cursor")
                    : notify(`已打开「${title}」`)
                }
              >
                {progress === 100 ? "查看成果" : "继续开发"}
                <ArrowRight size={16} />
              </button>
            </article>
          ),
        )}
        <button className="new-project-card" onClick={() => setCreating(true)}>
          <Plus size={26} />
          <strong>创建新项目</strong>
          <span>从一个真实问题开始</span>
        </button>
      </div>
      {creating && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setCreating(false)}
        >
          <section
            className="create-modal"
            role="dialog"
            aria-modal="true"
            aria-label="创建新项目"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="关闭"
              onClick={() => setCreating(false)}
            >
              <X size={20} />
            </button>
            <IconBadge icon={Rocket} color="violet" />
            <h3>创建新项目</h3>
            <p>用一句话描述你想解决的问题。</p>
            <label>
              项目名称
              <input placeholder="例如：我的 AI 面试教练" />
            </label>
            <label>
              项目目标
              <textarea placeholder="我希望帮助……" />
            </label>
            <button
              className="black-button wide"
              onClick={() => {
                setCreating(false);
                notify("项目已创建，可以开始规划了");
              }}
            >
              创建并开始规划
            </button>
          </section>
        </div>
      )}
    </>
  );
}

function ResourcesPage({ notify }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("全部");
  const visible = useMemo(
    () =>
      resources.filter(
        (item) =>
          (type === "全部" || item.type === type) &&
          `${item.title}${item.desc}`.includes(query),
      ),
    [query, type],
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="page-kicker">拿来就用的实践资料</span>
          <h2>资源中心</h2>
          <p>Prompt、模板、代码与工作流，帮助你更快完成项目。</p>
        </div>
      </div>
      <div className="resource-tools">
        <label>
          <MagnifyingGlass size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索资源…"
          />
        </label>
        <div>
          {["全部", "模板", "代码", "工作流", "Prompt", "指南", "案例"].map(
            (item) => (
              <button
                key={item}
                className={type === item ? "active" : ""}
                onClick={() => setType(item)}
              >
                {item}
              </button>
            ),
          )}
        </div>
      </div>
      <div className="resource-grid">
        {visible.map(({ type: resourceType, title, desc, icon, color }) => (
          <article className="resource-card" key={title}>
            <IconBadge icon={icon} color={color} />
            <span className="resource-type">{resourceType}</span>
            <h3>{title}</h3>
            <p>{desc}</p>
            <div>
              <button onClick={() => notify(`正在预览「${title}」`)}>
                预览
              </button>
              <button
                aria-label={`下载${title}`}
                onClick={() => notify(`「${title}」已加入下载队列`)}
              >
                <DownloadSimple size={18} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {visible.length === 0 && (
        <div className="empty-state">
          <MagnifyingGlass size={30} />
          <h3>没有找到相关资源</h3>
          <p>试试更短的关键词或切换资源类型。</p>
        </div>
      )}
    </>
  );
}

// The shell stays mounted while only the learner content changes. This preserves
// account state, sidebar scroll, shared controls and guarded note navigation.
function LearnerWorkspace({ route: rawRoute, navigate, notify }) {
  const route = normalizeWorkspaceRoute(rawRoute);
  const guard = useRef(null);
  const [search, setSearch] = useState({ route, query: "" });
  const [searchRevision, setSearchRevision] = useState(0);
  const query = search.route === route ? search.query : "";
  const setQuery = (query) => setSearch({ route, query });
  const go = (path) => {
    if (!guard.current || guard.current(() => navigate(path))) navigate(path);
  };
  const placeholder = workspaceSearchPrompts[route];
  const resourceSearch = placeholder
    ? {
        value: query,
        onChange: setQuery,
        onSubmit: () => setSearchRevision((v) => v + 1),
        placeholder,
        label: placeholder.replace("…", ""),
      }
    : undefined;
  return (
    <WorkspaceShell
      route={route}
      navigate={go}
      notify={notify}
      resourceSearch={resourceSearch}
    >
      {(model) => {
        const props = { model, navigate: go, notify };
        const renderPage=()=>{
        if (route === '/account') return <AccountSettings {...props}/>;
        if (route === '/support') return <SupportCenter {...props}/>;
        if (route === "/app") return <Workbench {...props} />;
        if (route === "/opc" || route === "/paths" || route.startsWith("/opc/"))
          return (
            <CourseLearningSpace
              route={route}
              {...props}
            />
          );
        if (route === "/projects" || route.startsWith("/projects/"))
          return <ProjectsHub route={route} {...props} />;
        if (route === "/tutor")
          return <AiTutor key={model.user?.id || "guest"} {...props} />;
        if (route === "/resources")
          return (
            <ResourceCenter
              key={model.user?.id || "guest"}
              {...props}
              query={query}
              setQuery={setQuery}
              searchRevision={searchRevision}
            />
          );
        if (
          ["/notes", "/favorites", "/achievements", "/community"].includes(
            route,
          )
        )
          return (
            <PersonalWorkspace
              route={route}
              {...props}
              query={query}
              setQuery={setQuery}
              guard={guard}
            />
          );
        if (route.startsWith("/paths/"))
          return (
            <GenericPathDetail
              key={route}
              slug={route.split("/")[2]}
              navigate={go}
            />
          );
        if (learningSlug(route))
          return (
            <CourseReader
              key={`${learningSlug(route)}-${model.user?.id || "guest"}`}
              slug={learningSlug(route)}
              placementId={Number(route.split("/")[4]) || null}
              {...props}
            />
          );
        if (route.startsWith("/packs/"))
          return (
            <ProductPackPage
              key={route}
              model={model}
              slug={route.split("/")[2]}
              navigate={go}
              notify={notify}
            />
          );
        if (
          [
            "/courses",
            "/plan",
            "/tools",
            "/certificates",
            "/membership",
          ].includes(route)
        )
          return <WorkspacePages route={route} {...props} />;
        return <NotFound navigate={go}/>;
        };
        return <RouteLoadBoundary resetKey={route}><Suspense fallback={<p role="status">正在加载页面…</p>}>{renderPage()}</Suspense></RouteLoadBoundary>;
      }}
    </WorkspaceShell>
  );
}

export function App() {
  const [route, navigate, navigationStatus] = useRoute();
  const [toast, setToast] = useState("");
  const notify = (text) => setToast(text);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  let content;
  if (route === "/") content = <PublicHomepage navigate={navigate} />;
  else if (/^\/legal\/(terms|privacy|purchase)\/?$/.test(route)) content = <LegalPage kind={route.split('/')[2]} navigate={navigate}/>;
  else if (route === '/course-offer' || route === '/course-offer/') content = <CourseOfferPage navigate={navigate} notify={notify}/>;
  else if (
    route === "/login" ||
    route === "/register" ||
    route === "/forgot-password"
  )
    content = (
      <AuthPage
        navigate={navigate}
        initialMode={
          route === "/register"
            ? "register"
            : route === "/forgot-password"
              ? "forgot"
              : "login"
        }
      />
    );
  else if (route === "/admin/login")
    content = <AdminLogin navigate={navigate} />;
  else if (route === "/admin/forgot-password")
    content = (
      <AuthPage navigate={navigate} platform="admin" initialMode="forgot" />
    );
  else if (route === "/admin/account")
    content = (
      <AccountPage
        key={route}
        navigate={navigate}
        platform={route === "/admin/account" ? "admin" : "user"}
      />
    );
  else if (route.startsWith("/admin")) {
    if (!getToken()) content = <AdminLogin navigate={navigate} />;
    else {
      const adminPage =
        route === '/admin/service' ? <AdminService/> : route === '/admin/support' ? <AdminSupport/> : route === "/admin/community" ? (
          <AdminCommunity />
        ) : route === "/admin/pages" ? (
          <AdminPages />
        ) : ["/admin/library", "/admin/projects"].includes(route) ? (
          <AdminPlatform
            key={route}
            mode={route.endsWith("library") ? "library" : "projects"}
            navigate={navigate}
          />
        ) : [
            "/admin",
            "/admin/catalog",
            "/admin/content",
            "/admin/assets",
            "/admin/content-audit",
          ].includes(route) ? (
          <AdminCms
            mode={
              {
                "/admin/catalog": "catalog",
                "/admin/content": "content",
                "/admin/assets": "assets",
                "/admin/content-audit": "audit",
              }[route] || "overview"
            }
            navigate={navigate}
          />
        ) : route === "/admin/opc" ? (
          <AdminOpc navigate={navigate} />
        ) : route === '/admin/analytics' ? <AdminAnalytics/> : route === '/admin/parsing' ? <AdminParsing navigate={navigate}/> : route === '/admin/certificates' ? <AdminCertificates/> : route === '/admin/readiness' ? <AdminReadiness navigate={navigate}/> : route === "/admin/orders" ? (
          <AdminOrders />
        ) : route === "/admin/users" ? (
          <AdminUsers />
        ) : route === "/admin/ai" ? (
          <AdminAi />
        ) : route === "/admin/login-settings" ? (
          <AdminLoginSettings navigate={navigate} />
        ) : route === "/admin/payments" ? (
          <AdminPayments />
        ) : route === "/admin/redemption-codes" ? (
          <AdminRedemptionCodes />
        ) : route === "/admin/email" ? (
          <AdminEmail />
        ) : route === "/admin/account-audit" ? (
          <AdminAccountAudit />
        ) : (
          <NotFound navigate={navigate} admin/>
        );
      content = (
        <AdminShell route={route} navigate={navigate}>
          <Suspense fallback={<p role="status">正在加载管理页面…</p>}>{route === "/admin/learning" ? <AdminLearning /> : adminPage}</Suspense>
        </AdminShell>
      );
    }
  } else
    content = (
      <LearnerWorkspace route={route} navigate={navigate} notify={notify} />
    );
  return (
    <>
      <RouteLoadBoundary resetKey={route}><Suspense fallback={<p role="status">正在加载页面…</p>}>{content}</Suspense></RouteLoadBoundary>
      {navigationStatus && <div className="navigation-save-status" role="status">{navigationStatus}</div>}
      <Toast text={toast} />
    </>
  );
}
