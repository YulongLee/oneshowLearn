import { BookOpenText, Cube, Robot, ArrowRight, MagnifyingGlass } from '@phosphor-icons/react';
import { BrandIdentity } from './BrandIdentity.jsx';
import './auth-commercial.css';

const benefits = [[BookOpenText,'系统课程','把知识连成路径'],[Cube,'实战项目','把想法带入实践'],[Robot,'AI 学习支持','带着问题继续前进']];

// Decorative product anatomy: no real accounts, progress, claims or interactive controls.
function WorkspaceIllustration() {
  return <div className="auth-workspace-illustration" role="img" aria-label="学习工作台界面示意">
    <div className="auth-demo-window" aria-hidden="true">
      <div className="auth-demo-top"><div className="auth-demo-brand"><BrandIdentity/></div><span><MagnifyingGlass size={13}/>搜索你的学习内容</span><i/></div>
      <div className="auth-demo-content"><div className="auth-demo-intro"><span>你的产品学习空间</span><h3>学有所用，做有所成。</h3></div>
        <div className="auth-demo-stages">{['产品与机会','AI 产品开发','上线与合规','收款与商业化','运营与增长'].map((title,i)=><div key={title}><b>{String(i+1).padStart(2,'0')}</b><strong>{title}</strong></div>)}</div>
        <div className="auth-demo-panels"><div><span className="auth-demo-panel-icon"><BookOpenText size={23}/></span><h4>把知识变成行动</h4><p>学习课程与课件<br/>梳理从想法到上线的步骤</p><span className="auth-demo-direction">课程与资料<ArrowRight size={14}/></span></div>
          <div><span className="auth-demo-panel-icon"><Cube size={23}/></span><h4>留下自己的实践</h4><p>记录思考与学习笔记<br/>沉淀你的项目与产品成果</p><span className="auth-demo-direction">项目与记录<ArrowRight size={14}/></span></div></div>
      </div>
    </div><span className="auth-demo-caption">学习工作台 · 产品界面示意</span>
  </div>;
}

export function AuthShowcase() {
  return <aside className="auth-showcase" aria-label="OneShowLearn 学习平台介绍">
    <div className="auth-showcase-copy"><span className="auth-eyebrow">LEARN · BUILD · GROW</span><h2>让每一次学习，<br/><em>都离产品更近一步。</em></h2><p>课程、项目与 AI 学习支持，<br/>在同一个空间里，连接你的学习与实践。</p></div>
    <WorkspaceIllustration/>
    <div className="auth-benefits">{benefits.map(([Icon,title,description])=><div key={title}><Icon size={24}/><span><strong>{title}</strong><small>{description}</small></span></div>)}</div>
  </aside>;
}
