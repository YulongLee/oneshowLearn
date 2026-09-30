export const SIDEBAR_KEY='oneshowlearn.sidebar.v1';
export const SIDEBAR_DEFAULT=228;
export const SIDEBAR_MAX=360;
export function sidebarWidth(value){return typeof value==='number'&&Number.isFinite(value)?Math.round(Math.min(SIDEBAR_MAX,Math.max(SIDEBAR_DEFAULT,value))):SIDEBAR_DEFAULT;}
export function sidebarPreferences(value){return {mode:['expanded','icons','hidden'].includes(value?.mode)?value.mode:'expanded',width:sidebarWidth(value?.width)};}
export function readSidebarPreferences(){try{return sidebarPreferences(JSON.parse(localStorage.getItem(SIDEBAR_KEY)));}catch{return sidebarPreferences();}}
export function saveSidebarPreferences(value){try{localStorage.setItem(SIDEBAR_KEY,JSON.stringify(sidebarPreferences(value)));}catch{/* Navigation must remain usable when storage is blocked. */}}
