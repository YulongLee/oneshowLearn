export const PROJECT_FLOW_PX_PER_SECOND=24;

export function advanceProjectFlow(offset,elapsed,cycle) {
  if(!Number.isFinite(cycle)||cycle<=0)return 0;
  const current=Number.isFinite(offset)?Math.max(0,offset):0;
  const delta=Number.isFinite(elapsed)?Math.max(0,Math.min(64,elapsed)):0;
  return (current+PROJECT_FLOW_PX_PER_SECOND*delta/1000)%cycle;
}

export function orderedWorkbenchProjects(items=[],preferred=[]) {
  const unique=new Map(items.filter(item=>item?.slug&&(item.status==null||item.status==='published')).map(item=>[item.id,item]));
  const promoted=preferred.map(item=>unique.get(item.id)).filter(Boolean);
  return [...new Map([...promoted,...unique.values()].map(item=>[item.id,item])).values()].slice(0,12);
}
