import {useSyncExternalStore} from 'react';
import {workspaceThemeStore} from './workspace-theme.js';

export function useWorkspaceTheme(){
  const theme=useSyncExternalStore(workspaceThemeStore.subscribe,workspaceThemeStore.getSnapshot,()=> 'light');
  return {theme,setTheme:workspaceThemeStore.setTheme};
}
