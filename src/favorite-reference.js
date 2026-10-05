export const favoriteReferenceKey=ref=>`${ref.kind}:${ref.id}:${ref.placementId||''}`;
export function hasFavorite(state,ref){
  if(ref.kind==='course')return (state.favorites||[]).includes(ref.id);
  if(ref.kind==='resource')return (state.resourceFavorites||[]).some(r=>r.id===ref.id);
  if(ref.kind==='personal-note')return Boolean((state.notes||[]).find(n=>n.id===ref.id&&!n.deletedAt)?.starred);
  return (state.contentFavorites||[]).some(r=>favoriteReferenceKey(r)===favoriteReferenceKey(ref));
}
export function toggleFavorite(state,ref,now=new Date().toISOString()){
  const saved=hasFavorite(state,ref);
  if(ref.kind==='course')return {...state,favorites:saved?(state.favorites||[]).filter(id=>id!==ref.id):[...(state.favorites||[]),ref.id]};
  if(ref.kind==='resource')return {...state,resourceFavorites:saved?(state.resourceFavorites||[]).filter(r=>r.id!==ref.id):[...(state.resourceFavorites||[]),{id:ref.id,savedAt:now}]};
  if(ref.kind==='personal-note')return {...state,notes:(state.notes||[]).map(n=>n.id===ref.id?{...n,starred:!saved}:n)};
  return {...state,contentFavorites:saved?(state.contentFavorites||[]).filter(r=>favoriteReferenceKey(r)!==favoriteReferenceKey(ref)):[...(state.contentFavorites||[]),{...ref,savedAt:now}]};
}
