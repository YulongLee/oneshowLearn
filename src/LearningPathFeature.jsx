import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import workspaceImage from "./assets/learning-path-workspace.webp";
import "./learning-path.css";

const steps = [
  ["基础入门", "认识 AI 与 OPC"],
  ["产品开发", "从想法到上线"],
  ["运营增长", "获取用户与收入"],
  ["持续迭代", "打造个人产品公司"],
];

export function LearningPathFeature({ navigate }) {
  return (
    <section className="learn-journey" id="roadmap" aria-labelledby="learning-path-heading">
      <div className="learn-journey__copy">
        <span className="learn-journey__eyebrow"><Sparkle size={12} aria-hidden="true" />学习路径</span>
        <h2 id="learning-path-heading">从基础到实战，循序渐进。</h2>
        <p>按照清晰的学习路径，逐步掌握 AI 产品开发的核心能力。<br />无论你是零基础，还是有一定经验，都能找到适合你的内容。</p>
        <button className="learn-journey__cta" onClick={() => navigate("/paths")}>查看学习路径<ArrowRight size={16} aria-hidden="true" /></button>
      </div>

      <ol className="learn-journey__steps" aria-label="四个学习阶段">
        {steps.map(([title, description], index) => (
          <li key={title}>
            <span className="learn-journey__number" aria-hidden="true">{index + 1}</span>
            <div><strong>{title}</strong><p>{description}</p></div>
          </li>
        ))}
      </ol>

      <div className="learn-journey__visual" aria-hidden="true">
        <div className="learn-journey__art">
          <img src={workspaceImage} alt="" width="1672" height="941" loading="lazy" decoding="async" />
        </div>
        <div className="learn-journey__annotation">
          <span>Learn<br />Build<br />Launch<br />Grow</span>
          <svg viewBox="0 0 54 54" fill="none"><path d="M42 5C42 24 29 36 10 39M10 39L19 31M10 39L21 44" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>
    </section>
  );
}
