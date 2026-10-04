import { FileText, DownloadSimple, Eye, ArrowRight } from '@phosphor-icons/react';
import { safeResourceUrl } from './opc-model.js';

// Only descriptors returned for the current, authorized lesson are displayed.
export function CourseLessonResources({ lesson, config, onPreview, onMaterial }) {
  const firstPage = config.slides.find(page => safeResourceUrl(page.asset?.url));
  const download = safeResourceUrl(config.ppt?.url);
  const canPreview = config.slides.length > 0;
  return <div className="cr-resources">
    <h2>本节课件</h2>
    {(config.ppt || canPreview) ? <div className="cr-courseware">
      <button className="cr-thumbnail" disabled={!canPreview} onClick={onPreview} aria-label="预览本节课件">
        {firstPage ? <img src={firstPage.asset.url} alt="本节课件第一页"/> : <FileText size={32}/>}
      </button>
      <div className="cr-file-copy"><strong>{config.isDemoMedia ? '通用课件 · 演示预览' : lesson.title}</strong>
        <p>{[config.isDemoMedia ? '演示课件' : '课程课件', canPreview ? `${config.slides.length} 页` : null, config.ppt ? `${Math.ceil(config.ppt.size_bytes / 1024)} KB` : null].filter(Boolean).join(' · ')}</p>
        {config.isDemoMedia && <small>演示素材，正式课件后续更新。</small>}
      </div>
      <div className="cr-file-actions"><button disabled={!canPreview} onClick={onPreview}><Eye size={17}/>预览</button>
        {download && <a href={download} target="_blank" rel="noreferrer" title={config.ppt.original_name}><DownloadSimple size={17}/>下载</a>}
      </div>
    </div> : <p className="ls-muted">本节课件待补充，可先阅读配套资料。</p>}
    <div className="cr-materials"><h2>配套资料</h2><div className="cs-resource-list">
      {lesson.materials.map(material => <button key={material.library_id} onClick={()=>onMaterial(material.library_id)}>
        <span className="cs-resource-icon is-material"><FileText size={23}/></span><span><strong>{material.title}</strong><small>{material.role==='prompt' ? 'Codex 提示词' : material.asset ? `${Math.ceil(material.asset.size_bytes/1024)} KB` : '课程配套资料'}</small></span><b>查看<ArrowRight size={15}/></b>
      </button>)}
      {!lesson.materials.length && <p className="ls-muted">本节配套资料待补充。</p>}
    </div></div>
  </div>;
}
