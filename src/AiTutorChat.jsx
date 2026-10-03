import {useEffect, useRef, useState} from 'react';
import {ArrowUp, BookOpenText, CaretDown, CaretRight, Check, ClockCounterClockwise, Code, Copy, Globe, Lightbulb, NotePencil, Plus, Question, Cube, Sparkle, Square, X} from '@phosphor-icons/react';
import {Markdown} from './PersonalShared.jsx';
import {TutorAnswer,TutorSources,answerLabel} from './TutorAnswer.js';
import {questionNote, TUTOR_FAQ, handleTutorComposerKeyDown} from './tutor-model.js';
import {useTutorConversations} from './useTutorConversations.js';
import {peekTutorIntent,takeTutorIntent} from './tutor-navigation.js';

const suggestions = [
  {Icon:BookOpenText,title:'基于我的课程内容回答',description:'例如：解释一下 RAG 的原理',question:'请基于我可访问的课程资料，解释 RAG 的原理；如果资料没有涉及，请明确说明。',mode:'knowledge'},
  {Icon:Cube,title:'帮我做项目',description:'例如：帮我设计产品技术方案',question:'请根据项目资料，帮我梳理产品技术方案；先问我正在做哪个项目。',mode:'knowledge'},
  {Icon:Lightbulb,title:'分析一个产品想法',description:'例如：这个 AI 产品值得做吗？',question:'我想做一个 AI 产品，请先问我三个关键问题，帮我明确产品方向。',mode:'general'},
  {Icon:Code,title:'解决开发问题',description:'例如：部署报错该怎么排查？',question:'请帮我排查开发问题，先问我技术栈、完整报错和已经尝试的方法。',mode:'general'},
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
  const [incoming,setIncoming]=useState(()=>peekTutorIntent(model.user?.id));
  useEffect(()=>{takeTutorIntent(model.user?.id);},[]);
  const [incomingReady,setIncomingReady]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [saved,setSaved]=useState([]), [saveBusy,setSaveBusy]=useState(false);
  const [faqOpen,setFaqOpen]=useState(false), [faqGroup,setFaqGroup]=useState('course');
  const composer=useRef(null), saving=useRef(false), bottom=useRef(null), scroll=useRef(null),scopeId=useRef(null);
  const composing=useRef(false);
  useEffect(()=>{if(messages.length||pending)bottom.current?.scrollIntoView({block:'nearest',behavior:'smooth'});else scroll.current?.scrollTo({top:0});},[session.id,messages.length,pending?.id]);
  useEffect(()=>{const last=session.data?.turns.at(-1);if(last&&scopeId.current!==session.id){scopeId.current=session.id;setMode(last.mode);setCourseId(String(last.courseId||''));setIncludeProduct(false);}},[session.data,session.id]);
  const applyIncoming=()=>{
    if(!incoming || busy || model.loading)return;
    setDraft(incoming.question);setMode('knowledge');setIncludeProduct(false);
    setCourseId(model.library.some(c=>c.id===incoming.courseId)?String(incoming.courseId):'');
    setIncoming(null);composer.current?.focus({preventScroll:true});
  };
  useEffect(()=>{
    if(incoming && !incomingReady && !session.loading && !model.loading){
      setIncomingReady(true);
      // Keep an existing unsent draft; the learner explicitly chooses replacement.
      if(!session.draft.trim() && !busy)applyIncoming();
    }
  },[incoming, incomingReady, session.loading, model.loading, busy]);
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
  const reset=()=>{session.startNew();setSaved([]);scopeId.current=null;setMode('knowledge');setCourseId('');setIncludeProduct(false);setSettingsOpen(false);setFaqOpen(false);composer.current?.focus({preventScroll:true});};
  const course=model.library.find(p=>String(p.id)===courseId);
  const hasConversation=Boolean(messages.length||pending);
  const showWelcome=!session.loading&&!hasConversation;

  return <div className="tc-layout tc-studio"><div className={`tc-page ${hasConversation?'has-conversation':'is-welcome'}`}>
    <header className="tc-header"><div className="tc-heading"><span className="tc-brand-icon"><Sparkle size={24} weight="fill"/></span><div><h1>OneShow AI</h1><p className="tc-brand-description">围绕课程与项目，帮你从理解走向实践</p><span className="tc-status"><i className={available?'is-ready':''}/>{cap?available?'AI 导师已就绪':'服务暂不可用':'正在连接服务'}</span></div></div>
      <div className="tc-header-actions"><button aria-label="新对话" disabled={session.sending||session.loading} onClick={reset}><Plus size={18}/><span>新对话</span></button><button className="tc-icon-action" aria-label="历史对话" title="历史对话" aria-expanded={session.historyOpen} onClick={()=>{session.setHistoryOpen(!session.historyOpen);setFaqOpen(false);}}><ClockCounterClockwise size={21}/></button><button className="tc-icon-action" aria-label="常见问题" title="常见问题" aria-expanded={faqOpen} onClick={()=>{setFaqOpen(!faqOpen);session.setHistoryOpen(false);}}><Question size={21}/></button></div></header>
    {session.historyOpen&&<section className="tc-history" aria-label="我的历史对话"><header><div><strong>历史对话</strong><p>仅当前账号可见，新对话不会删除旧记录。</p></div><button onClick={()=>session.setHistoryOpen(false)} aria-label="关闭历史对话"><X size={18}/></button></header><div className="tc-history-list">{session.items.map(item=><button key={item.id} aria-current={item.id===session.id?'true':undefined} disabled={session.sending||session.loading} onClick={()=>session.open(item.id)}><ClockCounterClockwise size={16}/><span>{item.title}</span><time>{new Date(item.updated_at).toLocaleDateString('zh-CN')}</time></button>)}{!session.items.length&&<p>{session.loading?'正在加载…':'还没有已发送的对话。'}</p>}{session.nextOffset!==null&&<button onClick={session.loadMore}>加载更多</button>}</div></section>}
    <div className="tc-save-status" role="status">{session.loading?'正在恢复历史对话…':session.sending?'正在保存问题…':session.error?'对话同步异常，请重试':pending?'问题已保存 · 回答中，可切换页面':session.data?.turns.length?'对话已自动保存到当前账号':'发送后自动保存 · 仅自己可见'}</div>
    <div ref={scroll} className="tc-scroll" aria-label="对话内容" tabIndex={0}>
      <div className="tc-reading">
        {showWelcome&&<section className="tc-welcome"><h2>你好{model.user?.name ? `，${model.user.name}` : ''}。<br/>有什么可以<span>帮你</span>的吗？</h2><p>读懂课程、推进项目，让每一个想法都有下一步。</p></section>}
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
      {incoming&&incomingReady&&<div className="tc-workbench-intent" role="status"><p>工作台准备了一个课程问题。当前草稿已保留，是否替换？</p><blockquote>{incoming.question}</blockquote><button type="button" disabled={busy||model.loading} onClick={applyIncoming}>使用工作台问题</button><button type="button" onClick={()=>setIncoming(null)}>保留当前草稿</button></div>}
      {settingsOpen&&<section className="tc-settings" aria-label="问答设置"><div><strong>添加学习上下文</strong><p>资料问答检索可访问的已发布课件文字与配套资料；通用建议不作为课程结论。不解析视频或图片，也不会自动读取私人笔记。</p></div><label><input type="checkbox" checked={mode==='web'?false:includeProduct} disabled={busy||mode==='web'} onChange={e=>setIncludeProduct(e.target.checked)}/>同时附带我的产品简介</label><p>模型：{cap?.model||'尚未连接'} · 由后台统一配置{cap?.dailyLimit?` · 每账号 24 小时最多 ${cap.dailyLimit} 次`:''}。发送内容由阿里云百炼处理。联网回答不附带私人学习资料；搜索可能产生额外服务费用。</p></section>}
      <div className="tc-scope" hidden={!settingsOpen}><div className="tc-mode" role="group" aria-label="回答模式"><button type="button" disabled={busy} aria-pressed={mode==='knowledge'} onClick={()=>setMode('knowledge')}><BookOpenText size={16}/>资料问答</button><button type="button" disabled={busy} aria-pressed={mode!=='knowledge'} onClick={()=>setMode('general')}><Sparkle size={16}/>通用建议</button></div></div>
      <textarea ref={composer} value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy} maxLength={4000} rows={3} aria-label="向 AI 导师提问" aria-description="Enter 发送，Shift Enter 换行" placeholder={mode==='web'?'搜索公开网络信息，回答将附网页来源…':mode==='knowledge'?'提问课程或项目中的问题，回答将附参考来源…':'描述你的目标、问题和已经尝试的方法…'} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onBlur={()=>{composing.current=false;}} onKeyDown={e=>handleTutorComposerKeyDown(e,send,composing.current)}/>
      <div className="tc-compose-bottom"><div className="tc-tools"><button type="button" className="tc-context-toggle" aria-label="添加上下文与问答设置" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(!settingsOpen)}><Plus size={17}/><span>{includeProduct ? '已加产品简介' : '添加上下文'}</span></button><button type="button" className="tc-web-toggle" aria-label="联网回答" aria-pressed={mode==='web'} disabled={busy||(!webAvailable&&mode!=='web')} onClick={()=>{setMode(mode==='web'?'general':'web');setIncludeProduct(false);}}><Globe size={18} aria-hidden="true"/><span>联网搜索</span>{mode==='web'&&<Check size={14} weight="bold"/>}</button><label className={`tc-course-picker ${mode==='knowledge'&&courseId?'is-selected':''}`} title={mode==='knowledge'&&course?course.title:'选择课程，基于课程资料回答'}><BookOpenText size={17} aria-hidden="true"/><select aria-label="选择课程" value={mode==='knowledge'?courseId:''} disabled={busy||model.loading||!model.user} onChange={e=>{setCourseId(e.target.value);setMode('knowledge');}}><option value="">{model.loading?'正在加载课程…':!model.user?'登录后选择课程':'选择课程 · 全部资料'}</option>{courseId&&!course&&<option value={courseId} disabled>历史课程（当前不可选）</option>}{model.library.map(p=><option value={p.id} key={p.id}>{p.title}</option>)}{!model.loading&&!model.library.length&&<option disabled>暂无已加入的课程</option>}</select><CaretDown size={13} aria-hidden="true"/></label></div><div>{!available&&draft.trim()&&model.user&&<button type="button" disabled={saveBusy||model.busy} onClick={()=>saveNote(null)}>保存问题</button>}{pending?<button type="button" className="tc-send" aria-label="停止回答" onClick={cancel}><Square size={17} weight="fill"/></button>:<button type="submit" className="tc-send" aria-label="发送给 AI 导师" disabled={busy||!available||(mode==='web'&&!webAvailable)||!draft.trim()}><ArrowUp size={22} weight="bold"/></button>}</div></div>
      {mode!=='knowledge'&&!webAvailable&&<p className="tc-unavailable">{cap?.webReason||'联网回答暂不可用'}</p>}
      {mode==='web'&&webAvailable&&<p className="tc-web-privacy">仅发送问题与联网对话，不附带私人学习资料。</p>}
      {cap&&!available&&<p className="tc-unavailable" role="status">{!model.user?'请先登录后使用 AI 导师。':cap.reason||'管理员已暂停 AI 导师，请稍后重试。'}</p>}
    </form><p className="tc-footnote">{mode==='knowledge'?'资料问答':'通用建议'}{mode==='web'?' · 联网搜索已开启':''} · 对话自动保存 · AI 回答请核对来源</p></div>
    {showWelcome&&<><div className="tc-suggestions" aria-label="快捷开始">{suggestions.map(item=><button key={item.title} disabled={busy} onClick={()=>selectQuestion(item)}><item.Icon size={25}/><strong>{item.title}</strong><span>{item.description}</span></button>)}</div><footer className="tc-studio-signoff"><p>“ Learn with context. Build with AI. ”</p><span>— OneShowLearn</span></footer></>}
  </div><aside className={`tc-faq ${faqOpen?'is-open':''}`} aria-label="常见问题快捷提问" onKeyDown={e=>{if(e.key==='Escape'&&faqOpen){e.preventDefault();setFaqOpen(false);e.currentTarget.closest('.tc-layout')?.querySelector('.tc-header button[aria-label="常见问题"]')?.focus();}}}>
    <div className="tc-faq-desktop-title"><Question size={20}/><h2>常见问题</h2><button aria-label="关闭常见问题" onClick={()=>setFaqOpen(false)}><X size={18}/></button></div>
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
