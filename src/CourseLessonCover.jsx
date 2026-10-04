import { BrandIdentity } from './BrandIdentity.jsx';
import courseArtwork from './assets/workbench-course-preview-v1.webp';

// A labeled demo cover, never a replacement for a real lesson video frame.
export function CourseLessonCover({ lesson, chapterNumber }) {
  const official = lesson.owner_slug === 'ai-opc-product-company';
  return <div className="cr-video-cover" aria-hidden="true">
    <img src={courseArtwork} alt=""/>
    <div className="cr-cover-brand"><BrandIdentity/></div>
    <span className="cr-cover-label">封面示意</span>
    <div className="cr-cover-copy"><span>{String(chapterNumber).padStart(2,'0')} · {lesson.chapter}</span>
      <strong>{official ? 'AI OPC' : lesson.owner_title}</strong>
      <h2>{official ? '一个人的 AI 产品公司' : lesson.title}</h2>
      <p>{lesson.title}</p>
    </div>
  </div>;
}
