export const lessonLink=p=>p.kind==='project'
  ? `/projects/${encodeURIComponent(p.owner_slug)}/workspace/${p.id}`
  : `/learn/${encodeURIComponent(p.owner_slug)}/lessons/${p.id}`;
