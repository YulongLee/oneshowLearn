import {lazy} from 'react';
const NotesWorkspace=lazy(()=>import('./NotesWorkspace.jsx').then(m=>({default:m.NotesWorkspace})));
const FavoritesWorkspace=lazy(()=>import('./FavoritesWorkspace.jsx').then(m=>({default:m.FavoritesWorkspace})));
const AchievementsWorkspace=lazy(()=>import('./AchievementsWorkspace.jsx').then(m=>({default:m.AchievementsWorkspace})));
const CommunityWorkspace=lazy(()=>import('./CommunityWorkspace.jsx').then(m=>({default:m.CommunityWorkspace})));
import './personal-workspace.css';
const pages={'/notes':[NotesWorkspace,'搜索笔记、标签、课程内容…'], '/favorites':[FavoritesWorkspace,'搜索收藏的课程、文档、资源、笔记…'], '/achievements':[AchievementsWorkspace,'搜索成果、项目、文档、标签…'], '/community':[CommunityWorkspace,'搜索讨论示例、草稿、话题…']};
export function PersonalWorkspace({route,...props}){
 const [Page]=pages[route];
 return <Page key={`${route}-${props.model.user?.id||'guest'}`} {...props}/>;
}
