import { BookOpenText, Cube, Robot, UsersThree, House, FileText, Star, ArrowRight, MagnifyingGlass } from '@phosphor-icons/react';
import { BrandIdentity, BrandSymbol } from './BrandIdentity.jsx';
import './auth-commercial.css';

const benefits = [[BookOpenText,'系统课程','从 0 到 1'],[Cube,'实战项目','边学边做'],[Robot,'AI 导师','解答学习疑问'],[UsersThree,'学习社区','和同行一起成长']];

// Decorative product anatomy, never a claim about an account or actual progress.
function WorkspaceIllustration() {
  return <div className="auth-workspace-illustration" role="img" aria-label="学习工作台界面示意">
    <div className="auth-demo-window" aria-hidden="true">
      <div className="auth-demo-top"><div className="auth-demo-brand"><BrandIdentity/></div><span><MagnifyingGlass size={12}/>搜索课程、项目、学习笔记…</span><i/></div>
      <div className="auth-demo-body"><div className="auth-demo-nav">{[[House,'工作台'],[BookOpenText,'学习课程'],[Cube,'实战项目'],[Robot,'AI 导师'],[UsersThree,'学习社区'],[Star,'我的收藏']].map(([Icon,title],i)=><div key={title} className={i===0?'selected':''}><Icon size={16}/>{title}</div>)}</div>
        <div className="auth-demo-content"><h3>继续你的 AI 产品之旅</h3><p>从学习到实践，让每一个想法更近一步。</p><div className="auth-demo-stages">{['产品与机会','AI 产品开发','上线与合规','收款与商业化','运营与增长'].map((title,i)=><div key={title}><b>{String(i+1).padStart(2,'0')}</b><strong>{title}</strong></div>)}</div>
          <div className="auth-demo-panels"><div><h4>把知识变成行动</h4>{['学习课程与课件','拆解需求与开发任务','记录每一次实践'].map(title=><div className="auth-demo-lesson" key={title}><BookOpenText size={17}/><span>{title}</span><ArrowRight size={12}/></div>)}</div><div><h4>你的下一个产品</h4><div className="auth-demo-project"><span><Cube size={26} weight="duotone"/></span><div><strong>从一个想法开始</strong><p>让 AI 成为你的创造力</p></div></div><div className="auth-demo-pills"><span>Idea</span><span>Build</span><span>Launch</span></div><small><FileText size={13}/>把思考与成果留在这里</small></div></div>
        </div>
      </div>
    </div><span className="auth-demo-caption">产品界面示意</span>
  </div>;
}

export function AuthShowcase() {
  return <aside className="auth-showcase" aria-label="OneShowLearn 学习平台介绍">
    <div className="auth-showcase-copy"><span className="auth-eyebrow">PRACTICE FIRST</span><h2>学会 AI，<br/>用好 AI，<br/>做出你的 <em>AI 产品。</em></h2><p>从一个想法开始，用 AI + Codex 完成产品设计、开发、上线、运营和增长。把想法变成一个可以持续运行的产品。</p>
      <div className="auth-benefits">{benefits.map(([Icon,title,description])=><div key={title}><Icon size={30} weight="regular"/><strong>{title}</strong><small>{description}</small></div>)}</div>
    </div>
    <div className="auth-handwriting" aria-hidden="true">Learn<br/>Build<br/>Grow<span/></div>
    <div className="auth-brand-orbit" aria-hidden="true"><BrandSymbol/></div>
    <WorkspaceIllustration/>
    <div className="auth-showcase-footer"><div><strong>系统学习</strong><small>把知识连成路径</small></div><div><strong>真实实践</strong><small>把想法做成产品</small></div><div><strong>持续成长</strong><small>记录你的每一步</small></div><p>更好的你，<br/>从今天开始。</p></div>
  </aside>;
}
