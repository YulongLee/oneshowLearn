import bcrypt from "bcryptjs";
import { config } from "./config.mjs";
import { db, row, run } from "./db.mjs";

const paths = [
  ["ai-tools", "AI 工具入门", "掌握主流 AI 工具，建立高效工作方式", "入门", "sparkle", "violet", 1],
  ["ai-coding", "AI 编程实战", "用 Cursor 与 Claude Code 完成真实项目", "进阶", "code", "blue", 2],
  ["ai-agent", "AI 智能体开发", "从零构建能思考、调用工具的智能体", "进阶", "robot", "orange", 3],
  ["ai-workflow", "AI 工作流自动化", "连接工具与数据，自动化重复工作", "实战", "path", "green", 4],
  ["ai-product", "AI 产品从 0 到 1", "从想法、原型到发布你的 AI 产品", "实战", "cube", "coral", 5],
  ["ai-growth", "AI 产品增长", "用 AI、内容与数据获得持续增长", "商业化", "chart", "purple", 6],
];

const packs = [
  ["ai-tools-starter", "AI 工具效率启动包", "建立个人 AI 工作系统", "一套可复用的 AI 工作方式", 4900, 240],
  ["cursor-first-site", "用 Cursor 发布第一个网站", "从空文件夹到真实上线", "一个可公开访问的响应式网站", 9900, 360],
  ["personal-ai-agent", "做出个人 AI 助手", "完成对话、工具调用与记忆", "一个可调用工具的 AI 助手", 19900, 480],
  ["n8n-content-workflow", "搭建内容自动化工作流", "用 n8n 连接选题、创作与发布", "一条可运行的内容工作流", 12900, 300],
  ["ai-product-mvp", "发布第一个 AI 产品", "从需求、原型到用户可访问", "一个上线的 AI MVP", 29900, 600],
  ["ai-product-growth", "AI 产品增长实战", "建立内容、SEO 与数据增长循环", "一套可执行的产品增长方案", 19900, 420],
];

const cursorSteps = [
  ["准备项目与目标", "明确用户、页面目标和最终成果", 1],
  ["生成网站首屏", "完成导航、价值主张、行动按钮和成果预览", 2],
  ["完成响应式优化", "让页面适配桌面、平板和手机", 3],
  ["发布到线上", "构建项目并发布到可公开访问的地址", 4],
  ["成果验收", "用检查清单确认页面质量并保存作品", 5],
];

function insertContent(stepId, type, title, body, order, options = {}) {
  run(`INSERT INTO content_items
    (step_id,type,title,body,resource_url,duration_seconds,is_preview,status,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?)`, [stepId, type, title, body, options.resourceUrl || "", options.durationSeconds || 0, options.preview ? 1 : 0, "published", order]);
}

export function seed() {
  db.exec("BEGIN IMMEDIATE");
  try {
    const adminHash = bcrypt.hashSync(config.adminPassword, 12);
    run(`INSERT INTO users (email,password_hash,name,role,status)
      VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,status=excluded.status`,
      [config.adminEmail, adminHash, "OneShowLearn 管理员", "admin", "active"]);
    run("UPDATE users SET email_verified = 1 WHERE email = ?", [config.adminEmail]);
    if (config.adminEmail !== "admin@oneshowlearn.com") {
      run("UPDATE users SET status = 'disabled', role = 'learner' WHERE email = 'admin@oneshowlearn.com'");
    }

    const learnerHash = bcrypt.hashSync("OneShowLearn-Learner-2026", 12);
    run(`INSERT INTO users (email,password_hash,name,role,status)
      VALUES (?,?,?,?,?) ON CONFLICT(email) DO NOTHING`,
      ["learner@oneshowlearn.com", learnerHash, "Yulong", "learner", "active"]);
    run("UPDATE users SET email_verified = 1 WHERE email = 'learner@oneshowlearn.com'");

    for (const [slug, title, description, level, icon, color, sortOrder] of paths) {
      run(`INSERT INTO learning_paths (slug,title,description,level,icon,color,status,sort_order)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET
        title=excluded.title,description=excluded.description,level=excluded.level,icon=excluded.icon,color=excluded.color,sort_order=excluded.sort_order`,
        [slug, title, description, level, icon, color, "published", sortOrder]);
    }

    paths.forEach(([pathSlug], index) => {
      const pathRow = row("SELECT id FROM learning_paths WHERE slug = ?", [pathSlug]);
      const [slug, title, subtitle, deliverable, price, minutes] = packs[index];
      run(`INSERT INTO project_packs
        (path_id,slug,title,subtitle,description,deliverable,cover_url,price_cents,currency,estimated_minutes,status,is_featured,sort_order)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET
        path_id=excluded.path_id,title=excluded.title,subtitle=excluded.subtitle,deliverable=excluded.deliverable,
        price_cents=excluded.price_cents,estimated_minutes=excluded.estimated_minutes,status=excluded.status`,
        [pathRow.id, slug, title, subtitle, descriptionFor(slug), deliverable, coverFor(slug), price, "CNY", minutes, "published", index === 1 ? 1 : 0, 1]);
      const packRow = row("SELECT id FROM project_packs WHERE slug = ?", [slug]);
      run(`INSERT INTO products (pack_id,sku,title,price_cents,currency,status)
        VALUES (?,?,?,?,?,?) ON CONFLICT(pack_id) DO UPDATE SET title=excluded.title,price_cents=excluded.price_cents,status=excluded.status`,
        [packRow.id, `OSL-${String(index + 1).padStart(3, "0")}`, title, price, "CNY", "active"]);
    });

    const cursorPack = row("SELECT id FROM project_packs WHERE slug = 'cursor-first-site'");
    if (!row("SELECT id FROM project_steps WHERE pack_id = ? LIMIT 1", [cursorPack.id])) {
      for (const [title, summary, order] of cursorSteps) {
        run("INSERT INTO project_steps (pack_id,title,summary,status,sort_order) VALUES (?,?,?,?,?)", [cursorPack.id, title, summary, "published", order]);
      }
      const step = row("SELECT id FROM project_steps WHERE pack_id = ? AND sort_order = 2", [cursorPack.id]);
      insertContent(step.id, "document", "先让 AI 理解你要做的页面", "不要一上来就让 Cursor 随便生成网站。先写清楚页面目标、目标用户、核心动作和必须包含的模块。\n\n1. 建立项目文件夹\n2. 描述最终成果\n3. 生成第一版首屏", 1, { preview: true });
      insertContent(step.id, "prompt", "网站首屏项目 Prompt", "请创建一个现代、简洁的响应式首页首屏，包含品牌导航、清晰的价值主张、主要行动按钮和项目成果预览。桌面端左右布局，手机端上下排列。", 2);
      insertContent(step.id, "code", "起步代码", "index.html\nstyles.css", 3, { resourceUrl: "/uploads/examples/cursor-first-site.zip" });
      insertContent(step.id, "template", "页面结构模板", "目标用户：\n页面目标：\n核心动作：\n必须模块：", 4);
      insertContent(step.id, "checklist", "首屏成果检查清单", "浏览器中能正常打开页面\n首屏包含主标题与主要按钮\n手机宽度下没有横向滚动", 5);
      insertContent(step.id, "video", "首屏生成完整演示", "只演示容易卡住的关键操作。", 6, { durationSeconds: 272 });
    }

    const learner = row("SELECT id FROM users WHERE email = 'learner@oneshowlearn.com'");
    run(`INSERT INTO entitlements (user_id,pack_id,source,status)
      VALUES (?,?,?,?) ON CONFLICT(user_id,pack_id) DO NOTHING`, [learner.id, cursorPack.id, "seed", "active"]);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function descriptionFor(slug) {
  return {
    "ai-tools-starter": "围绕真实办公和创作任务，建立可复用的 AI 工具组合。",
    "cursor-first-site": "通过文档、Prompt、代码模板、成果清单和短视频，完成从生成页面到发布上线。",
    "personal-ai-agent": "学习对话界面、模型接口、工具调用和基础记忆。",
    "n8n-content-workflow": "连接常用工具，减少重复内容工作。",
    "ai-product-mvp": "从问题验证、需求定义到上线第一个可用版本。",
    "ai-product-growth": "建立内容、SEO、数据和转化的增长闭环。",
  }[slug];
}

function coverFor(slug) {
  return slug === "cursor-first-site" ? "/assets/cursor-practice-preview.png" : "/assets/ai-assistant-project.png";
}

seed();
console.log("OneShowLearn database seeded");
