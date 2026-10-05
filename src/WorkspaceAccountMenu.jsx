import {useEffect,useRef} from 'react';
import {BookOpenText,CalendarBlank,CaretDown,Gauge,GearSix,House,Lifebuoy,Receipt,SignIn,SignOut} from '@phosphor-icons/react';
import {canManage} from './platforms.js';
import './workspace-account-menu.css';

// Account actions reuse the mounted settings editors and existing logout dialog.
// Other-page navigation still passes through the shell's draft/save guards.
export function WorkspaceAccountMenu({model,route,navigate,open,setOpen}) {
  const root=useRef(null),trigger=useRef(null),keyboardOpen=useRef(false);
  const user=!model.loading&&!model.error?model.user:null;
  const name=user?.name?.trim()||'学习者';
  useEffect(()=>{
    if(open&&keyboardOpen.current){root.current?.querySelector('.ws-user-menu button')?.focus();keyboardOpen.current=false;}
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const outside=e=>{if(!root.current?.contains(e.target))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open,setOpen]);
  const dismiss=()=>{setOpen(false);trigger.current?.focus();};
  const accountAction=section=>{
    if(route==='/account'){
      setOpen(false);
      window.dispatchEvent(new CustomEvent('oneshowlearn:account-section',{detail:{userId:user.id,section}}));
    }else navigate(`/account?section=${section}`);
  };
  const logout=()=>{
    if(route==='/account'){
      setOpen(false);
      window.dispatchEvent(new CustomEvent('oneshowlearn:account-section',{detail:{userId:user.id,section:'security',logout:'current'}}));
    }else navigate('/account?section=security&confirmLogout=current');
  };
  const row=(label,Icon,action)=> <button key={label} type="button" onClick={action}><Icon size={20}/><span>{label}</span></button>;
  const keys=e=>{
    if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();dismiss();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    const buttons=Array.from(root.current?.querySelectorAll('.ws-user-menu button')||[]);
    if(e.target===trigger.current){
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!open){keyboardOpen.current=true;setOpen(true);}else buttons[e.key==='ArrowUp'?buttons.length-1:0]?.focus();}
      return;
    }
    if(!buttons.includes(e.target))return;
    e.preventDefault();const index=buttons.indexOf(e.target);
    const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[next]?.focus();
  };
  const avatar=<span className="ws-avatar">{user?.avatar?<img src={user.avatar} alt=""/>:model.loading?'…':user?name.slice(0,1):'访'}</span>;
  return <div className="ws-account-control" ref={root} onKeyDown={keys} onBlur={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
    <button ref={trigger} type="button" className="ws-profile" aria-label={user?`账号菜单：${name}`:'登录与账号菜单'} aria-expanded={open} aria-controls="workspace-account-menu" onClick={()=>setOpen(!open)}>{avatar}<span><strong>{model.loading?'正在加载…':user?`你好，${name}`:'欢迎，学习者'}</strong><small>{user?'个人学习空间':'登录后保存学习记录'}</small></span><CaretDown size={14}/></button>
    {open&&<section id="workspace-account-menu" className="ws-user-menu" aria-label="账号菜单">
      <div className="ws-user-menu-identity">{avatar}<div><strong>{model.loading?'正在读取账号…':user?name:'欢迎，学习者'}</strong><small>{model.loading?'请稍候':model.error?'账号暂不可用，请重新登录或重试':user?'个人学习账号':'登录后同步你的学习记录'}</small></div></div>
      <nav aria-label="账号快捷入口">
        {user?<><div className="ws-user-menu-group">{row('我的课程',BookOpenText,()=>navigate('/courses'))}{row('学习计划',CalendarBlank,()=>navigate('/plan'))}</div><div className="ws-user-menu-group">{row('账号设置',GearSix,()=>accountAction('profile'))}{row('我的订单',Receipt,()=>accountAction('orders'))}{row('帮助与售后',Lifebuoy,()=>navigate('/support'))}</div></>:<div className="ws-user-menu-group">{!model.loading&&row('登录 / 注册',SignIn,()=>navigate('/login'))}{row('帮助与售后',Lifebuoy,()=>navigate('/support'))}</div>}
        <div className="ws-user-menu-group">{user&&canManage(user)&&row('进入管理平台',Gauge,()=>navigate('/admin'))}{row('返回官网',House,()=>navigate('/'))}</div>
        {user&&<div className="ws-user-menu-exit">{row('退出登录',SignOut,logout)}<small>退出仅影响当前浏览器</small></div>}
      </nav>
    </section>}
  </div>;
}
