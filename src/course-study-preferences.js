export const COURSE_PANELS_KEY = 'oneshowlearn.coursePanels.v1';

// Browser presentation only; never stored with account progress or course data.
export function coursePanelPreferences(value) {
  return {
    directory: typeof value?.directory === 'boolean' ? value.directory : true,
    assistant: typeof value?.assistant === 'boolean' ? value.assistant : true,
  };
}
export function toggleCoursePanel(value, panel) {
  const next = coursePanelPreferences(value);
  if (panel === 'directory' || panel === 'assistant') next[panel] = !next[panel];
  return next;
}
