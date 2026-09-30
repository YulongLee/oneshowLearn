// Shared, dependency-free course structure; not seeded course content.
export const OPC_PHASES = [
  {
    id: 1,
    title: "产品与机会",
    subtitle: "找准需求，验证想法",
    description: "从真实问题出发，找到值得解决的需求，形成清晰的产品方向。",
    tone: "green",
    goals: ["产品定位", "目标用户", "竞品分析", "需求文档"],
  },
  {
    id: 2,
    title: "AI 产品开发",
    subtitle: "用 AI 做出产品",
    description: "用 AI 工具构建你的产品 MVP，从想法到可以使用的真实产品。",
    tone: "violet",
    goals: ["可运行的 MVP", "GitHub 代码仓库", "产品演示 Demo", "项目总结文档"],
  },
  {
    id: 3,
    title: "上线与合规",
    subtitle: "域名 / 服务器 / 备案",
    description: "准备部署环境与发布检查，让你的产品能够被真实用户访问。",
    tone: "blue",
    goals: ["可访问的域名", "部署记录", "合规检查清单", "上线验收报告"],
  },
  {
    id: 4,
    title: "收款与商业化",
    subtitle: "支付 / 订阅 / 定价",
    description: "明确产品定价与交付方式，设计可靠的交易和用户权益流程。",
    tone: "amber",
    goals: ["定价方案", "支付流程", "用户权益方案", "交易测试记录"],
  },
  {
    id: 5,
    title: "运营与增长",
    subtitle: "SEO / 内容 / 社媒",
    description: "通过内容、用户反馈和持续迭代，让你的产品获得第一批用户。",
    tone: "pink",
    goals: ["增长计划", "内容与 SEO", "用户反馈记录", "迭代复盘"],
  },
];

export const PRODUCT_MILESTONES = [
  "产品定位",
  "竞品分析",
  "PRD 文档",
  "原型设计",
  "MVP 开发",
  "域名与服务器",
  "支付功能",
  "上线发布",
  "SEO 与增长",
  "首个用户",
  "首笔收入",
];
export const CONTENT_TYPES = {
  lesson: "多媒体课时",
  document: "实战文档",
  prompt: "Prompt 模板",
  code: "代码示例",
  template: "项目模板",
  task: "实践任务",
  checklist: "检查清单",
  video: "短视频",
  download: "配套资料",
};
export const emptyProduct = () => ({
  name: "",
  type: "",
  description: "",
  phase: 1,
  milestones: PRODUCT_MILESTONES.map(() => "todo"),
  outcomes: [],
});
export function phaseProgress(items = []) {
  const completed = items.filter(
    (item) => item.progress === "completed",
  ).length;
  return {
    completed,
    total: items.length,
    percent: items.length ? Math.round((completed / items.length) * 100) : 0,
  };
}
export function safeResourceUrl(value = "") {
  if (/^\/api\/materials\/\d+(?:\?ticket=[A-Za-z0-9_.-]+)?$/.test(value)) return value;
  if (/^\/uploads\/[a-zA-Z0-9_.%/-]+$/.test(value) && !value.includes(".."))
    return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
