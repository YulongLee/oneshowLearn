export const STUDY_COLUMNS_KEY='oneshowlearn:study-columns:v1';
export function studyPreferences(value) {
  const valid=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)?Math.round(Math.max(min,Math.min(max,n))):null;
  return {directory:valid(value?.directory,200,440),notes:valid(value?.notes,280,720)};
}
export function studyColumns(width,preferences={}) {
  const w=Number.isFinite(width)?Math.max(0,width):0,p=studyPreferences(preferences);
  const mode=w>960?'full':w>760?'notes':'stacked',gap=16;
  let directory=p.directory??Math.round(Math.max(200,Math.min(280,w*.17)));
  let notes=p.notes??Math.round(Math.max(280,Math.min(400,w*.24)));
  if(mode==='full'){
    notes=Math.min(notes,Math.max(280,w-directory-400-gap*2));
    directory=Math.min(directory,w-notes-400-gap*2);
  }else if(mode==='notes')notes=Math.min(notes,w-400-gap);
  return {mode,gap,directory,notes,
    directoryMax:Math.max(200,Math.min(440,w-notes-400-gap*2)),
    notesMax:Math.max(280,Math.min(720,w-(mode==='full'?directory+gap:0)-400-gap)),
  };
}
export function resizedStudyColumn(layout,side,value) {
  return Math.round(Math.max(side==='directory'?200:280,Math.min(layout[side+'Max'],value)));
}
