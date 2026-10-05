// One navigation identity for every learner route, including deep links.
export const normalizeWorkspaceRoute = route => route.replace(/\/+$/, '') || '/';
export function activeWorkspaceNav(value) {
  const route = normalizeWorkspaceRoute(value);
  if (route === '/opc' || route.startsWith('/opc/')) return '/opc';
  if (route === '/paths' || route.startsWith('/paths/') || route === '/courses' || route.startsWith('/packs/') || route.startsWith('/learn/')) return '/opc';
  if (route === '/projects' || route.startsWith('/projects/')) return '/projects';
  if (route === '/tools') return '/tutor';
  if (route === '/certificates') return '/achievements';
  return ['/app','/tutor','/resources','/community','/notes','/favorites','/achievements','/account'].includes(route) ? route : null;
}
export const workspaceSearchPrompts = {
  '/resources': '搜索资源（例如：PRD 模板、Codex 指令、支付接入…）',
  '/notes': '搜索笔记、标签、课程内容…',
  '/favorites': '搜索收藏的课程、文档、资源、笔记…',
  '/achievements': '搜索成果、项目、文档、标签…',
  '/community': '搜索官方文章、专题、资源…',
};
