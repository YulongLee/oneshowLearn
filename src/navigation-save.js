// Existing synchronous admin guards remain authoritative. Learning writers may
// register deferred work; no route is committed until every writer is clean.
export async function prepareNavigation(target = window, onSaving = () => {}) {
  const writers = [];
  const event = new CustomEvent('oneshowlearn:before-navigate', {cancelable: true,
    detail: {waitUntil: (save, dirty = () => false) => writers.push({save, dirty})}});
  if (!target.dispatchEvent(event)) return {ok: false, reason: 'cancelled'};
  if (!writers.length) return {ok: true};
  onSaving();
  try {
    // A note can change while the progress request is pending. Recheck all
    // writers together, not only the one whose request finished last.
    for (let round = 0; round < 3; round++) {
      const saved = await Promise.all(writers.map(w => w.save()));
      if (saved.some(ok => !ok)) return {ok: false, reason: 'save-failed'};
      if (writers.every(w => !w.dirty())) return {ok: true};
    }
    return {ok: false, reason: 'still-editing'};
  } catch { return {ok: false, reason: 'save-failed'}; }
}

export function createRouteNavigation(target, onRoute, onStatus) {
  const key = 'oneshowlearnRouteIndex';
  let index = Number.isInteger(target.history.state?.[key]) ? target.history.state[key] : 0;
  let currentUrl = target.location.pathname + target.location.search + target.location.hash;
  let busy = false, restoring = false, destination = null, disposed = false;
  target.history.replaceState({...target.history.state, [key]: index}, '', currentUrl);
  const run = async next => {
    if (busy || restoring || disposed) return false;
    busy = true; destination = next; onStatus('');
    const result = await prepareNavigation(target, () => onStatus('正在保存学习进度和笔记…'));
    if (disposed) return false;
    const chosen = destination;
    if (result.ok) {
      if (chosen.pop) {
        index = Number.isInteger(target.history.state?.[key]) ? target.history.state[key] : index;
        currentUrl = target.location.pathname + target.location.search + target.location.hash;
      } else {
        if (chosen.url !== currentUrl) {
          index++;
          target.history.pushState({[key]: index}, '', chosen.url);
        }
        currentUrl = chosen.url;
      }
      onRoute(target.location.pathname || '/');
      if (!chosen.pop) target.scrollTo({top: 0, behavior: 'smooth'});
      onStatus('');
    } else {
      if (chosen.pop) {
        const delta = index - target.history.state?.[key];
        if (Number.isInteger(delta) && delta !== 0) { restoring = true; target.history.go(delta); }
        else target.history.replaceState({...target.history.state, [key]: index}, '', currentUrl);
      }
      if (result.reason !== 'cancelled') onStatus(result.reason === 'still-editing'
        ? '仍有新的修改，已留在当前页面。请停止编辑后再次切换。'
        : '自动保存未完成，已留在当前页面，修改仍保留。请检查网络或页面中的冲突提示后重试。');
    }
    busy = false; destination = null;
    return result.ok;
  };
  const pop = () => {
    if (restoring) { restoring = false; return; }
    // Repeated back/forward uses the actual final browser destination but shares
    // the pending save, rather than issuing competing writes or duplicate entries.
    if (busy) { destination = {pop: true}; return; }
    void run({pop: true});
  };
  target.addEventListener('popstate', pop);
  return {navigate: url => run({url}), dispose: () => {disposed = true; target.removeEventListener('popstate', pop);}};
}
