import { lazy, Suspense } from "react";
const Editor = lazy(() =>
  import("./RichLessonNoteEditor.jsx").then((m) => ({
    default: m.RichLessonNote,
  })),
);
const Reader = lazy(() =>
  import("./RichLessonNoteEditor.jsx").then((m) => ({
    default: m.RichNoteRead,
  })),
);
const fallback = (
  <p className="ls-muted" role="status">
    正在加载笔记…
  </p>
);
export function RichLessonNote(props) {
  return (
    <Suspense fallback={fallback}>
      <Editor {...props} />
    </Suspense>
  );
}
export function RichNoteRead(props) {
  return (
    <Suspense fallback={fallback}>
      <Reader {...props} />
    </Suspense>
  );
}
