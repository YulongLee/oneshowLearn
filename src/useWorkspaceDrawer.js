import {useLayoutEffect} from 'react';

// The existing shell stays mounted; opening navigation never resets an editor.
export function useWorkspaceDrawer(open, drawer, trigger, desktopTrigger) {
  useLayoutEffect(()=>{
    if(!open||!drawer.current)return;
    const panel=drawer.current,previous=document.activeElement;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const targets=()=>Array.from(panel.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]')).filter(element=>!element.disabled&&element.tabIndex>=0&&element.getClientRects().length&&!element.closest('[hidden]'));
    const first=()=>targets()[0]||panel;
    first().focus({preventScroll:true});
    const trap=event=>{
      if(event.key!=='Tab')return;
      const items=targets(),last=items.at(-1);
      if(!items.length){event.preventDefault();panel.focus();return;}
      if(!panel.contains(document.activeElement)||(event.shiftKey&&document.activeElement===items[0])){event.preventDefault();(event.shiftKey?last:items[0]).focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();items[0].focus();}
    };
    document.addEventListener('keydown',trap);
    return()=>{
      document.removeEventListener('keydown',trap);
      document.body.style.overflow=overflow;
      const destination=[trigger.current,desktopTrigger.current,previous].find(element=>element?.isConnected&&element.getClientRects().length&&!element.closest('[inert]'));
      destination?.focus({preventScroll:true});
    };
  },[open,drawer,trigger,desktopTrigger]);
}
