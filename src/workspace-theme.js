export const WORKSPACE_THEME_KEY='oneshowlearn.workspace-theme.v1';
export const workspaceTheme=value=>value==='dark'?'dark':'light';

// A shared store keeps mounted settings and workspace consumers in sync without
// writing account records or changing the appearance of public/admin pages.
export function createWorkspaceThemeStore(browser){
  const listeners=new Set();
  let theme='light',memoryOnly=false;
  const read=()=>{try{return {theme:workspaceTheme(browser.localStorage.getItem(WORKSPACE_THEME_KEY)),saved:true};}catch{return {theme,saved:false};}};
  if(browser)theme=read().theme;
  const update=next=>{if(theme===next)return;theme=next;for(const listener of [...listeners])listener();};
  const storage=event=>{
    if(event.key!==WORKSPACE_THEME_KEY&&event.key!==null)return;
    if(event.storageArea!=null){try{if(event.storageArea!==browser.localStorage)return;}catch{return;}}
    memoryOnly=false;
    update(workspaceTheme(event.key===null?null:event.newValue));
  };
  const subscribe=listener=>{
    listeners.add(listener);
    if(listeners.size===1&&browser){
      browser.addEventListener('storage',storage);
      // Reconcile a cross-tab update received while this route was unmounted.
      // A failed local write must not undo this tab's immediate manual choice.
      if(!memoryOnly)update(read().theme);
    }
    return()=>{listeners.delete(listener);if(!listeners.size&&browser)browser.removeEventListener('storage',storage);};
  };
  const setTheme=value=>{
    const next=workspaceTheme(value);
    let saved=false;
    try{browser.localStorage.setItem(WORKSPACE_THEME_KEY,next);saved=true;}catch{/* Private/blocked storage still permits an immediate in-memory choice. */}
    memoryOnly=!saved;
    update(next);
    return {theme:next,saved};
  };
  const getSnapshot=()=>{
    // Public routes have no subscribers. Re-read before their next workspace
    // render, without notifying during render or undoing a storage-blocked choice.
    if(browser&&!listeners.size&&!memoryOnly)theme=read().theme;
    return theme;
  };
  return {getSnapshot,subscribe,setTheme};
}

export const workspaceThemeStore=createWorkspaceThemeStore(typeof window==='undefined'?null:window);
