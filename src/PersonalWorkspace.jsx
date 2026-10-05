import {NotesWorkspace} from './NotesWorkspace.jsx';
import {FavoritesWorkspace} from './FavoritesWorkspace.jsx';
import {AchievementsWorkspace} from './AchievementsWorkspace.jsx';
import {CommunityWorkspace} from './CommunityWorkspace.jsx';
import './personal-workspace.css';
const pages={'/notes':[NotesWorkspace,'搜索笔记、标签、课程内容…'], '/favorites':[FavoritesWorkspace,'搜索收藏的课程、文档、资源、笔记…'], '/achievements':[AchievementsWorkspace,'搜索成果、项目、文档、标签…'], '/community':[CommunityWorkspace,'搜索讨论示例、草稿、话题…']};
export function PersonalWorkspace({route,...props}){
 const [Page]=pages[route];
 return <Page key={`${route}-${props.model.user?.id||'guest'}`} {...props}/>;
}
