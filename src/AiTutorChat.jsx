import {useEffect, useRef, useState} from 'react';
import {ArrowUp, ArrowUpRight, BookOpenText, CaretDown, CaretRight, Check, ClockCounterClockwise, Code, Copy, Globe, Lightbulb, NotePencil, Plus, Question, SlidersHorizontal, Sparkle, Square, X} from '@phosphor-icons/react';
import {Markdown} from './PersonalShared.jsx';
import {TutorAnswer,TutorSources,answerLabel} from './TutorAnswer.js';
import {questionNote, TUTOR_FAQ} from './tutor-model.js';
import {useTutorConversations} from './useTutorConversations.js';

const suggestions = [
  {Icon:BookOpenText,title:'读懂课程',description:'从课件和文字资料中找到答案',question:'课程资料中，如何明确产品需求和目标用户？',mode:'knowledge'},
  {Icon:Code,title:'推进项目',description:'查找项目里的开发方法与 Prompt',question:'项目资料中，如何用 Codex 开发 MVP？',mode:'knowledge'},
  {Icon:Lightbulb,title:'梳理想法',description:'把一个想法拆成可执行的下一步',question:'我想做一个 AI 产品，请先问我三个关键问题，帮我明确产品方向。',mode:'general'},
  {Icon:NotePencil,title:'制定计划',description:'根据你的时间和目标安排学习',question:'我每周有 5 小时学习时间，请帮我制定一个 AI 产品开发入门计划。',mode:'general'},
];

export function AiTutorChat({model, cap, navigate, notify}) {
  const available=Boolean(cap?.available && cap.features?.tutor!==false && model.user);
  const webAvailable=available&&Boolean(cap?.features?.web);
  const session=useTutorConversations(model.user?.id);
  const {draft,setDraft,pending}=session;
  const busy=session.sending||Boolean(pending)||session.loading;
  const messages=(session.data?.turns||[]).flatMap(t=>t.status==='pending'?[]:[
    {id:t.id,role:'user',content:t.question,mode:t.mode,courseId:t.courseId,error:t.status==='failed'?(t.error==='联网回答的引用未能通过核对，请重新提问；不会用普通回答冒充搜索结果。'?'这次搜索结果暂时无法核实，请重试或换个更具体的问题。':t.error):null,turn:t},
    ...(t.result?[{id:t.id+'-answer',role:'assistant',content:t.result.answer,question:t.question,mode:t.mode,courseId:t.courseId,sources:t.result.sources||[],grounded:t.result.grounded,retrieval:t.result.retrieval,searchedAt:t.result.searchedAt,answerKind:t.result.answerKind,answeredAt:t.result.answeredAt,unavailable:t.result.unavailable}]:[])]);
  const [mode,setMode]=useState('knowledge');
  const [courseId,setCourseId]=useState(''), [includeProduct,setIncludeProduct]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [saved,setSaved]=useState([]), [saveBusy,setSaveBusy]=useState(false);
  const [faqOpen,setFaqOpen]=useState(false), [faqGroup,setFaqGroup]=useState('course');
  const composer=useRef(null), saving=useRef(false), bottom=useRef(null), scroll=useRef(null),scopeId=useRef(null);
  useEffect(()=>{if(messages.length||pending)bottom.current?.scrollIntoView({block:'nearest',behavior:'smooth'});else scroll.current?.scrollTo({top:0});},[session.id,messages.length,pending?.id]);
  useEffect(()=>{const last=session.data?.turns.at(-1);if(last&&scopeId.current!==session.id){scopeId.current=session.id;setMode(last.mode);setCourseId(String(last.courseId||''));setIncludeProduct(false);}},[session.data,session.id]);
  const selectQuestion = item => {setDraft(item.question);setMode(item.mode);composer.current?.focus();};
  const send=async (event,quick=null)=>{
    event?.preventDefault();
    if(!available||busy||!(quick?.question||draft).trim())return;
    setFaqOpen(false);
    const selectedMode=quick?.mode||mode;
    if(selectedMode==='web'&&!webAvailable)return notify(cap?.webReason||'联网回答暂不可用');
    if(await session.send({question:(quick?.question||draft).trim(),mode:selectedMode,courseId:selectedMode==='web'?null:courseId,includeProduct:selectedMode==='web'?false:includeProduct}))if(!quick)setDraft('');
  };
  const cancel=(event)=>{event?.preventDefault();session.stop();};
  const saveNote=async(message)=>{
    if(saving.current||model.busy||!model.user||saved.includes(message?.id))return;
    if(model.state.notes.length>=100)return notify('笔记已达上限，请先整理学习笔记。');
    const refs=(message?.sources||[]).map(s=>`[${s.id}] ${s.label}\n${s.href}\n摘录：${s.excerpt}`).join('\n\n');
    const note=message?{id:crypto.randomUUID(),title:`[AI 导师回答] ${message.question.slice(0,90)}`,
      body:`${answerLabel(message)}${message.answeredAt?'\n回答时间：'+message.answeredAt:''}${message.searchedAt?'\n检索时间：'+message.searchedAt:''}\n\n问题：${message.question}\n\n${message.content}${refs?'\n\n—— 参考资料 ——\n'+refs:''}`,updatedAt:new Date().toISOString()}
      :questionNote(draft,model.library.find(p=>String(p.id)===courseId),null,crypto.randomUUID(),new Date().toISOString());
    if(note.body.length>20000)return notify('回答和来源较长，请复制后分段保存到学习笔记。');
    saving.current=true;setSaveBusy(true);
    try {if(await model.saveState({...model.state,notes:[note,...model.state.notes]})){
      if(message)setSaved(ids=>[...ids,message.id]);notify('已保存到私人学习笔记');
    }}finally{saving.current=false;setSaveBusy(false);}
  };
  const copy=async(text)=>{try{await navigator.clipboard.writeText(text);notify('已复制回答');}catch{notify('复制失败，请手动选择文本。');}};
  const reset=()=>{session.startNew();setSaved([]);scopeId.current=null;setMode('knowledge');setCourseId('');setIncludeProduct(false);composer.current?.focus({preventScroll:true});};
  const course=model.library.find(p=>String(p.id)===courseId);

  return <div className="tc-layout"><div className={`tc-page ${messages.length||pending?'has-conversation':''}`}>
    <header className="tc-header"><div className="tc-heading"><span className="tc-brand-icon"><Sparkle size={20} weight="fill"/></span><div><h1>AI 导师</h1><span className="tc-status"><i className={available?'is-ready':''}/>{cap?available?'准备好，与你一起解决问题':'服务暂不可用':'正在连接服务'}</span></div></div>
      <div className="tc-header-actions"><button aria-label="历史对话" aria-expanded={session.historyOpen} onClick={()=>session.setHistoryOpen(!session.historyOpen)}><ClockCounterClockwise size={18}/><span>历史对话</span></button><button aria-label="问答设置" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(!settingsOpen)}><SlidersHorizontal size={18}/><span>问答设置</span></button><button aria-label="新对话" disabled={session.sending||session.loading} onClick={reset}><Plus size={18}/><span>新对话</span></button></div></header>
    {session.historyOpen&&<section className="tc-history" aria-label="我的历史对话"><header><div><strong>历史对话</strong><p>仅当前账号可见，新对话不会删除旧记录。</p></div><button onClick={()=>session.setHistoryOpen(false)} aria-label="关闭历史对话"><X size={18}/></button></header><div className="tc-history-list">{session.items.map(item=><button key={item.id} aria-current={item.id===session.id?'true':undefined} disabled={session.sending||session.loading} onClick={()=>session.open(item.id)}><ClockCounterClockwise size={16}/><span>{item.title}</span><time>{new Date(item.updated_at).toLocaleDateString('zh-CN')}</time></button>)}{!session.items.length&&<p>{session.loading?'正在加载…':'还没有已发送的对话。'}</p>}{session.nextOffset!==null&&<button onClick={session.loadMore}>加载更多</button>}</div></section>}
    {settingsOpen&&<section className="tc-settings" aria-label="问答设置"><div><strong>回答从哪里来？</strong><p>资料问答检索你有权限的已发布课件文字、文稿与配套资料；通用建议可开启联网搜索，回答附网页来源。不解析视频或图片。</p></div><label><input type="checkbox" checked={mode==='web'?false:includeProduct} disabled={busy||mode==='web'} onChange={e=>setIncludeProduct(e.target.checked)}/>同时附带我的产品简介</label><p>模型：{cap?.model||'尚未连接'} · 由后台统一配置{cap?.dailyLimit?` · 每账号 24 小时最多 ${cap.dailyLimit} 次`:''}。联网回答只发送问题和当前联网对话，不附带私人笔记、课程或产品简介；搜索可能产生额外服务费用。暂未启用向量检索或附件上传。</p></section>}
    <div className="tc-save-status" role="status">{session.loading?'正在恢复历史对话…':session.sending?'正在保存问题…':session.error?'对话同步异常，请重试':pending?'问题已保存 · 回答中，可切换页面':session.data?.turns.length?'对话已自动保存到当前账号':'发送后自动保存 · 仅自己可见'}</div>
    <div ref={scroll} className="tc-scroll" aria-label="对话内容" tabIndex={0}>
      <div className="tc-reading">
        {!session.loading&&!messages.length&&!pending&&<section className="tc-welcome"><div className="tc-welcome-icon"><Sparkle size={34} weight="duotone"/></div><span className="tc-eyebrow">YOUR LEARNING PARTNER</span><h2>今天，一起解决什么问题？</h2><p>读懂一个知识点，推进一个项目。<br/>让每一个问题，都成为向前的一步。</p><div className="tc-suggestions">{suggestions.map(item=><button key={item.title} onClick={()=>selectQuestion(item)}><item.Icon size={22}/><strong>{item.title}<ArrowUpRight size={16}/></strong><span>{item.description}</span></button>)}</div></section>}
        {messages.map(message=><article className={`tc-message is-${message.role}`} key={message.id}>
          {message.role==='assistant'&&<div className="tc-answer-heading"><Sparkle size={18}/><strong>OneShowLearn</strong><span>{answerLabel(message)}</span></div>}
          <TutorAnswer body={message.content} sources={message.sources}/>
          {message.error&&<div className="tc-turn-error"><p>{message.error}</p><button disabled={busy||!available} onClick={()=>session.send({question:message.turn.question,mode:message.turn.mode,courseId:message.turn.courseId,includeProduct:message.turn.includeProduct,retryTurn:message.turn})}>重试此问题</button></div>}
          {message.role==='assistant'&&<>
            <TutorSources key={message.id} sources={message.sources} mode={message.mode} searchedAt={message.searchedAt}/>
            {message.unavailable&&<button className="tc-retry-question" disabled={busy} onClick={()=>selectQuestion({question:message.question,mode:message.mode})}>重新提问</button>}
            {message.retrieval?.partial&&<p className="tc-coverage">本次只检索了部分文字，请缩小课程范围或补充关键词。</p>}
            <div className="tc-answer-actions"><button onClick={()=>copy(message.content)} aria-label="复制回答"><Copy size={16}/>复制</button><button disabled={saveBusy||model.busy||saved.includes(message.id)} onClick={()=>saveNote(message)}>{saved.includes(message.id)?<Check size={16}/>:<NotePencil size={16}/>} {saved.includes(message.id)?'已保存':'保存笔记'}</button></div>
          </>}
        </article>)}
        {pending&&<><article className="tc-message is-user"><Markdown body={pending.question}/></article><div className="tc-pending" role="status"><Sparkle size={19}/><span>正在处理问题并整理回答…</span></div></>}
        {session.error&&<div className="tc-error" role="alert">{session.error}<button className="tc-retry-question" disabled={session.sending} onClick={session.reload}>刷新对话</button>{session.unconfirmed&&<button className="tc-retry-question" disabled={busy||!available} onClick={session.retryUnconfirmed}>重试原问题</button>}</div>}<div ref={bottom}/>
      </div>
    </div>
    <div className="tc-composer-wrap"><form className="tc-composer" onSubmit={send}>
      <div className="tc-scope"><div className="tc-mode" role="group" aria-label="回答模式"><button type="button" disabled={busy} aria-pressed={mode==='knowledge'} onClick={()=>setMode('knowledge')}><BookOpenText size={16}/>资料问答</button><button type="button" disabled={busy} aria-pressed={mode!=='knowledge'} onClick={()=>setMode('general')}><Sparkle size={16}/>通用建议</button></div>{mode!=='web'&&<select aria-label="检索课程范围" value={courseId} disabled={busy||model.loading} onChange={e=>setCourseId(e.target.value)}><option value="">全部可访问课程与项目</option>{model.library.map(p=><option value={p.id} key={p.id}>{p.title}</option>)}</select>}</div>
      <textarea ref={composer} value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy} maxLength={4000} rows={3} aria-label="向 AI 导师提问" placeholder={mode==='web'?'搜索公开网络信息，回答将附网页来源…':mode==='knowledge'?'提问课程或项目中的问题，回答将附参考来源…':'描述你的目标、问题和已经尝试的方法…'} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
      <div className="tc-compose-bottom">{mode!=='knowledge'&&<button type="button" className="tc-web-toggle" aria-label="联网回答" aria-pressed={mode==='web'} disabled={busy||(!webAvailable&&mode!=='web')} onClick={()=>{setMode(mode==='web'?'general':'web');setIncludeProduct(false);}}><Globe size={18} aria-hidden="true"/><span>联网回答</span><span className="tc-web-indicator" aria-hidden="true"><Check size={12} weight="bold"/></span></button>}<div>{!available&&draft.trim()&&model.user&&<button type="button" disabled={saveBusy||model.busy} onClick={()=>saveNote(null)}>保存问题</button>}{pending?<button type="button" className="tc-send" aria-label="停止回答" onClick={cancel}><Square size={17} weight="fill"/></button>:<button type="submit" className="tc-send" aria-label="发送给 AI 导师" disabled={busy||!available||(mode==='web'&&!webAvailable)||!draft.trim()}><ArrowUp size={22} weight="bold"/></button>}</div></div>
      {mode!=='knowledge'&&!webAvailable&&<p className="tc-unavailable">{cap?.webReason||'联网回答暂不可用'}</p>}
      {mode==='web'&&webAvailable&&<p className="tc-web-privacy">仅发送问题与联网对话，不附带私人学习资料。</p>}
      {cap&&!available&&<p className="tc-unavailable" role="status">{!model.user?'请先登录后使用 AI 导师。':cap.reason||'管理员已暂停 AI 导师，请稍后重试。'}</p>}
    </form><p className="tc-footnote">对话自动保存到当前账号，草稿仅保留在本浏览器标签页。AI 回答请核对来源，发送内容由阿里云百炼处理。</p></div>
  </div><aside className={`tc-faq ${faqOpen?'is-open':''}`} aria-label="常见问题快捷提问" onKeyDown={e=>{if(e.key==='Escape'&&faqOpen){e.preventDefault();setFaqOpen(false);e.currentTarget.querySelector('.tc-faq-toggle')?.focus();}}}>
    <div className="tc-faq-desktop-title"><Question size={20}/><h2>常见问题</h2><span>快捷提问</span></div>
    <button className="tc-faq-toggle" aria-expanded={faqOpen} aria-controls="tutor-faq-content" onClick={()=>setFaqOpen(!faqOpen)}><Question size={19}/><strong>常见问题</strong><span>{faqOpen?'收起快捷提问':'点击展开快捷提问'}</span><CaretDown size={16}/></button>
    <div className="tc-faq-content" id="tutor-faq-content"><p className="tc-faq-intro">不确定怎么问？选一个问题开始。</p>
      <div className="tc-faq-tabs" role="group" aria-label="常见问题分类">{TUTOR_FAQ.map(group=><button key={group.id} aria-pressed={faqGroup===group.id} onClick={()=>setFaqGroup(group.id)}>{group.title}</button>)}</div>
      {TUTOR_FAQ.filter(group=>group.id===faqGroup).map(group=><section key={group.id} className="tc-faq-list"><p className="tc-faq-mode">{group.mode==='knowledge'?<BookOpenText size={14}/>:<Sparkle size={14}/>} {group.mode==='knowledge'?'检索课程资料 · 回答附来源':'通用建议 · 非课程结论'}</p>{group.questions.map(item=><button key={item.id} disabled={busy||!available} onClick={()=>send(null,{...item,mode:group.mode})} aria-label={`直接提问：${item.title}`}><span>{item.title}</span><CaretRight size={16}/></button>)}</section>)}
      <p className="tc-faq-hint">点击即发送给 AI，会计入调用额度；输入框中的草稿会保留。资料问答沿用当前课程范围。</p>
      {!available&&<p role="status" className="tc-faq-unavailable">{cap?'AI 暂不可用，恢复后可快捷提问。':'正在检查 AI 服务…'}</p>}
      <div className="tc-faq-tip"><Lightbulb size={18}/><div><strong>问得具体，回答更有用</strong><p>补充课程名称、当前目标或完整报错。资料不足时，AI 会明确告诉你。</p></div></div>
    </div>
  </aside></div>;
}
