export function projectStudyEntry(project, signedIn) {
  const base = `/projects/${encodeURIComponent(project.slug)}`;
  const lessons = (project.stages || []).flatMap(stage => stage.lessons || []);
  if (project.entitled && lessons.length && signedIn)
    return {path: `${base}/workspace`, start: !project.run};
  const preview = lessons.find(lesson => lesson.is_preview);
  return {path: preview ? `${base}/preview/${preview.id}` : base, start: false};
}

export function studyMaterials(materials, tab, project, filter = 'all') {
  return materials.filter(material => {
    if (project && tab === 'file') {
      if (['prompt', 'article', 'code'].includes(filter)) return material.role === filter;
      if (filter === 'files') return Boolean(material.resource_url);
      return true;
    }
    return tab === 'file' ? Boolean(material.resource_url) : material.role === tab;
  });
}
