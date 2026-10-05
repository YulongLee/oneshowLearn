import { useEffect, useState } from 'react';
import { api } from './api.js';

export function useAiCapabilities(accountId) {
  const [cap, setCap] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setCap(null);
    let pending=false;
    const refresh=()=>{if(pending||controller.signal.aborted)return;pending=true;
      api('/learning/ai/capabilities', { signal: controller.signal }).then(value=>{if(!controller.signal.aborted)setCap(value);}).catch(error => {
        if (!controller.signal.aborted) setCap(current=>current||{ available: false, reason: error.message });
      }).finally(()=>{pending=false;});
    };
    const visibleRefresh=()=>{if(!document.hidden)refresh();};
    refresh();const timer=setInterval(visibleRefresh,30000);
    window.addEventListener('focus',refresh);window.addEventListener('oneshowlearn:ai-config',refresh);
    document.addEventListener('visibilitychange',visibleRefresh);
    return () => {controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('oneshowlearn:ai-config',refresh);document.removeEventListener('visibilitychange',visibleRefresh);};
  }, [accountId]);
  return cap;
}

export {prepareTutorQuestion} from './tutor-navigation.js';
