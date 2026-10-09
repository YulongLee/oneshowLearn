// Only whole-course overview wording qualifies. A topic-specific question must
// still match evidence, and the caller must supply an authorized selected course.
export function isCourseOverview(question){
 const text=String(question).trim().replace(/[\s，,。？?！!]/g,'').replace(/^(请问|请|能不能|能否)/,'').replace(/^(帮我|给我)/,'');
 if(!text||text.length>80)return false;
 return /^(总结|概括|介绍)(一下)?(这门|这个|当前|所选)?课程(的)?(整体|主要)?(内容|大纲|学习内容|学习目标)?(吧|吗)?$/.test(text)
  || /^(这门|这个|当前|所选)?课程(主要|到底)?(讲什么|讲些什么|学什么|学些什么|学啥|有什么内容|有哪些内容|包含哪些内容|适合谁|适合哪些人)(呢|啊|吗)?$/.test(text)
  || /^(我能|可以|能)(从)?(这门|这个|当前|所选)?课程(里|中)?学到什么(呢|吗)?$/.test(text)
  || /^(学完|完成)(这门|这个|当前|所选)?课程(能|可以)(学到什么|做什么|获得什么)(呢|吗)?$/.test(text);
}
