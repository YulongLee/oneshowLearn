import {api} from './api.js';
import { useEffect, useState } from "react";
import { ArrowRight, Books, CheckCircle, Infinity as InfinityIcon, Lightning, List, MagnifyingGlass, Play, Sparkle, UserCircle, X } from "@phosphor-icons/react";
import { LearningPathFeature } from "./LearningPathFeature.jsx";
import "./homepage.css";
import {useSitePage} from "./useSitePage.js";
import {homepageCards} from '../server/homepage-cards.mjs';

function BrandMark() {
  return <img className="brand-mark" src="/assets/oneshowlearn-brandmark.png" alt="" aria-hidden="true" />;
}

export function PublicHomepage({ navigate,configuration }) {
  const {data:site,error:siteError,loading:siteLoading}=useSitePage('public',configuration);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search,setSearch]=useState(''),[searchOpen,setSearchOpen]=useState(false);
  const [catalog,setCatalog]=useState([]),[searchStatus,setSearchStatus]=useState('idle');
  useEffect(()=>{if(!searchOpen||searchStatus==='ready')return;let active=true;setSearchStatus('loading');api('/catalog/workspace').then(data=>{if(active){setCatalog(data.items||[]);setSearchStatus('ready');}}).catch(()=>{if(active)setSearchStatus('error');});return()=>{active=false;};},[searchOpen]);
  const results=catalog.filter(course=>`${course.title} ${course.subtitle||''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0,8);
  const scrollTo = (id) => { setMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const scrollHome = () => { setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const hotCourses=homepageCards(site);
  return (
    <main className="sales-page">
      <header className="sales-nav">
        <button className="sales-brand" onClick={scrollHome}><BrandMark /><span>OneShowLearn</span></button>
        <nav id="homepage-navigation" className={menuOpen ? "sales-links open" : "sales-links"} aria-label="主要导航">
          <button className="active" onClick={scrollHome}>首页</button>
          <button onClick={() => scrollTo("hot-courses")}>课程体系</button>
          <button onClick={() => navigate("/projects")}>真实案例</button>
          <button onClick={() => navigate("/community")}>学习社区</button>
          <button onClick={() => scrollTo("about")}>关于我们</button>
        </nav>
        <div className="sales-actions"><div className="sales-search-wrap"><form className="sales-search" role="search" onSubmit={event=>{event.preventDefault();setSearchOpen(true);}}><MagnifyingGlass size={16}/><input aria-label="搜索课程" placeholder="搜索课程…" value={search} onFocus={()=>setSearchOpen(true)} onChange={event=>{setSearch(event.target.value);setSearchOpen(true);}} onKeyDown={event=>{if(event.key==='Escape')setSearchOpen(false);}}/></form>{searchOpen&&<section className="sales-search-results" aria-label="课程搜索结果"><header><strong>已发布课程</strong><button aria-label="关闭课程搜索" onClick={()=>setSearchOpen(false)}><X size={18}/></button></header>{searchStatus==='loading'?<p role="status">正在读取课程…</p>:searchStatus==='error'?<p role="alert">搜索暂不可用，请关闭后重试。</p>:results.length?results.map(course=><button key={course.id} onClick={()=>navigate('/packs/'+course.slug)}>{course.title}<ArrowRight size={15}/></button>):<p>没有匹配的课程，试试其他关键词。</p>}</section>}</div><button className="sales-login" onClick={() => navigate("/login")}>登录</button><button className="sales-start" onClick={() => navigate("/login")}>开始学习 <ArrowRight size={15} /></button><button className="sales-menu" aria-controls="homepage-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? "关闭导航" : "打开导航"} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X size={21} /> : <List size={21} />}</button></div>
      </header>
      <section className="sales-hero">
        <img className="sales-hero-image" src={site.image||"/assets/oneshowlearn-hero.png"} alt="学习者正在使用电脑实践 AI 项目" />
        <div className="sales-hero-wash" aria-hidden="true" />
        <div className="sales-hero-inner"><div className="sales-hero-copy"><span className="sales-pill"><Sparkle size={14} weight="fill" /> {site.eyebrow}</span><h1>{site.title.split("\n").map((line,i)=><span key={i} className={line.length>13?"sales-title-wrap":undefined}>{line.includes("AI 产品")?<>{line.split("AI 产品")[0]}<em>AI 产品</em>{line.split("AI 产品").slice(1).join("AI 产品")}</>:line}</span>)}</h1><p style={{whiteSpace:"pre-line"}}>{site.description}</p><div className="sales-hero-buttons"><button className="sales-button primary" onClick={() => navigate(site.ctaPath)}>{site.ctaLabel} <ArrowRight size={17} /></button><button className="sales-button ghost" onClick={() => navigate(site.secondaryPath)}><Play size={16} weight="fill" /> {site.secondaryLabel}</button></div><div className="sales-stats"><span><strong>60%</strong><small>实战文档</small></span><span><strong>20%</strong><small>Prompt / 代码 / 模板</small></span><span><strong>10%</strong><small>任务与清单</small></span><span><strong>10%</strong><small>短视频演示</small></span></div></div></div>
        <div className="sales-hero-note"><span><CheckCircle size={17} weight="fill" /> 更少的时间</span><span><CheckCircle size={17} weight="fill" /> 更低的成本</span><span><CheckCircle size={17} weight="fill" /> 更强的创造力</span><span><CheckCircle size={17} weight="fill" /> 实现你的想法</span></div><div className="sales-hero-tag">让 AI 成为你的<br /><b>产品合伙人</b> ✨</div>
      </section>
      <section className="sales-benefits"><article><Lightning size={28} weight="fill" color="#7351e8" /><div><b>系统化课程</b><small>从入门到实战，带你做出真实产品</small></div></article><article><Books size={28} weight="fill" color="#3d7bea" /><div><b>真实项目案例</b><small>拆解全过程，学习可复制的方法</small></div></article><article><UserCircle size={28} weight="fill" color="#6d65e8" /><div><b>学习社区</b><small>与一群同行者一起成长</small></div></article><article><InfinityIcon size={28} weight="bold" color="#f09b17" /><div><b>长期更新</b><small>紧跟最新的 AI 技术和机会</small></div></article></section>
      <section className="sales-section hot-courses" id="hot-courses"><div className="sales-section-head"><div><h2>热门课程</h2><p>从零开始，掌握 AI 产品开发的完整能力</p></div><button onClick={() => navigate("/paths")}>查看全部课程 <ArrowRight size={15} /></button></div>{siteError&&<p role="alert">{siteError}</p>}<div className="course-grid" aria-busy={siteLoading}>{hotCourses.map(({ tag, title, description, tone, image, lessons, detail, path },index) => <button className={`course-card ${tone}`} key={index} onClick={() => navigate(path)}><div className="course-card-art"><span>{tag}</span><img className="course-card-image" src={image} alt="" /><div className="course-card-copy"><strong>{title.split("\n").map((line,i) => <span key={i}>{line}</span>)}</strong><p>{description}</p></div></div><div className="course-card-meta"><span><Books size={13} /> {lessons}</span><span>{detail}</span><i><ArrowRight size={15} /></i></div></button>)}</div></section>
      <LearningPathFeature navigate={navigate} />
      <section className="sales-bottom"><div><span>OneShowLearn</span><h2>{site.footerTitle}</h2><p>{site.footerDescription}</p></div><button className="sales-button light" onClick={() => navigate(site.ctaPath)}>{site.ctaLabel} <ArrowRight size={16} /></button></section>
      <footer className="sales-footer" id="about" aria-label="关于 OneShowLearn"><div className="sales-footer-info"><span>© 2026 OneShowLearn · OneShowLab</span><span>AI 产品实战学习平台</span></div><a className="sales-icp-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" aria-label="浙ICP备2026052190号-4（在新窗口打开工信部备案查询）">浙ICP备2026052190号-4</a></footer>
    </main>
  );
}
