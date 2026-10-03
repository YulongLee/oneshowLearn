// Presentation only: prefer real CMS art, and never turn a demonstration into
// a delivered course or fabricate technology/learning metadata.
export function workbenchProjectVisual(project={}) {
  const demo=/[【\[]演示[】\]]/.test(project.title||'');
  const generic=/\/project-(?:web|mobile|agent)-cover-v1(?:-[\w-]+)?\.(?:webp|png)(?:\?.*)?$/.test(project.cover_url||'');
  const title=project.title||'';
  const key=/面试|Interview/i.test(title)?'interview':/移动|小程序|App/i.test(title)?'mobile':/Agent|自动化/i.test(title)?'agent':'directory';
  return {demo,key,useIllustration:!project.cover_url||(demo&&generic),title:title.replace(/^[【\[]演示[】\]]\s*/,''),
    tags:[...new Set([...(project.settings?.tech_stack||[]),...(project.tags||[])])].slice(0,4)};
}

export function workbenchProjectSummary(project={}) {
  const text=project.description||'跟随教程，从想法走向真实作品。';
  // Keep the value sentence; the badge and project detail retain demo status.
  return text.split(/演示内容[，,]|当前共用/)[0].trim()||text;
}
