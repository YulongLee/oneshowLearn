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
    refresh();const timer=setInterval(refresh,30000);
    window.addEventListener('focus',refresh);window.addEventListener('oneshowlearn:ai-config',refresh);
    return () => {controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('oneshowlearn:ai-config',refresh);};
  }, [accountId]);
  return cap;
}

// A navigation-only draft: no persistence, never sent until the learner presses Send.
let pendingDraft = '';
export function prepareTutorQuestion(question) { pendingDraft = question.slice(0, 4000); }
export function takeTutorQuestion() { const question = pendingDraft; pendingDraft = ''; return question; }
