// Real links remain usable without JavaScript and with native new-tab gestures.
export function SeoLink({href,navigate,onClick,children,...props}) {
  const follow=event=>{
    onClick?.(event);
    const link=event.currentTarget;
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.hasAttribute('download')||(link.target&&link.target!=='_self')||typeof navigate!=='function')return;
    if(new URL(link.href).origin!==window.location.origin)return;
    event.preventDefault();
    navigate(href);
  };
  return <a {...props} href={href} onClick={follow}>{children}</a>;
}
