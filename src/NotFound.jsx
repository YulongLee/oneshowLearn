import {ArrowRight,Compass} from '@phosphor-icons/react';
export function NotFound({navigate,admin=false}){
  return <section className="empty-state" aria-label="页面不存在"><Compass size={36}/><h1>这个页面不存在</h1><p>链接可能已调整。你的账号和学习记录不会因此改变。</p><button className="black-button" onClick={()=>navigate(admin?'/admin':'/app')}>{admin?'返回管理平台':'返回工作台'}<ArrowRight size={16}/></button></section>;
}
