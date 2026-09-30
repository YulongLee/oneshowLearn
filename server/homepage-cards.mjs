// Approved marketing presentation, not seeded courses or learner statistics.
export const HOME_CARDS = [
  {tag:'入门必学',title:'AI OPC\n一个人的产品公司',description:'从 0 到 1，打造你的第一个 AI 产品',image:'/assets/course-opc-v2.webp',courseId:null},
  {tag:'开发实战',title:'用 Codex\n快速开发你的产品',description:'从想法到上线，一站式实战',image:'/assets/course-codex-v2.webp',courseId:null},
  {tag:'增长运营',title:'AI 产品增长与变现',description:'让好产品被更多人看到',image:'/assets/course-growth-v2.webp',courseId:null},
  {tag:'案例拆解',title:'真实产品案例拆解',description:'从 0 到 1 的完整流程',image:'/assets/course-case-v2.webp',courseId:null},
];

export function homepageCards(page={}) {
  return (page.hotCourseCards ?? HOME_CARDS).map((card,index)=>({
    ...card,
    tone:['violet','blue','green','orange'][index],
    // Only the API's explicitly resolved published association supplies a link/count.
    path:card.course?.slug?'/packs/'+card.course.slug:index===0?'/opc':'/paths',
    lessons:card.course?`${card.course.contentCount} 项资料`:'学习方向',
    detail:card.course?'查看课程':'查看学习路线',
  }));
}
