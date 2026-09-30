import { useEffect, useRef, useState } from "react";
// Loaded on demand so the public homepage does not download the note editor.
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Dialog } from "./AdminDialog.jsx";

const extensions = [
  StarterKit.configure({
    link: {
      openOnClick: false,
      protocols: ["https", "http"],
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    },
  }),
  Image.configure({ allowBase64: true }),
];
const content = (value) => {
  try {
    const doc = JSON.parse(value);
    if (doc?.type === "doc") return doc;
  } catch {}
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: value ? [{ type: "text", text: value }] : [],
      },
    ],
  };
};
export function RichNoteRead({ body }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: content(body),
    editable: false,
  });
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.commands.setContent(content(body), { emitUpdate: false });
  }, [editor, body]);
  return <EditorContent className="ls-rich-read" editor={editor} />;
}
function Annotation({ source, onSave, close }) {
  const canvas = useRef(null),
    drawing = useRef(false),
    [error, setError] = useState("");
  const reset = () => {
    const c = canvas.current,
      ctx = c.getContext("2d"),
      img = new window.Image();
    img.onload = () => {
      c.width = img.width;
      c.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = source;
  };
  useEffect(reset, [source]);
  const point = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * canvas.current.width) / r.width,
      ((e.clientY - r.top) * canvas.current.height) / r.height,
    ];
  };
  return (
    <Dialog title="截图标注" close={close}>
      <p>在图片上拖动绘制重点，保存后插入私人笔记。</p>
      <canvas
        className="ls-annotate"
        ref={canvas}
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = canvas.current.getContext("2d");
          ctx.beginPath();
          ctx.moveTo(...point(e));
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvas.current.getContext("2d");
          ctx.strokeStyle = "#7544ff";
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.lineTo(...point(e));
          ctx.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <div className="ls-actions">
        <button onClick={reset}>清除标注</button>
        <button
          onClick={() => {
            const data = canvas.current.toDataURL("image/jpeg", 0.65);
            if (data.length > 180000) {
              setError("截图过大，请使用较简单的画面或压缩后上传");
              return;
            }
            onSave(data);
          }}
        >
          插入笔记
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </Dialog>
  );
}
export function RichLessonNote({ value, onChange, video, slide, onAnchor }) {
  const [shot, setShot] = useState(""),
    [error, setError] = useState(""),
    file = useRef(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: content(value),
    editorProps: {
      attributes: {
        "aria-label": "笔记内容",
        "data-placeholder": "记录这一节的重点、你的思考，或任何想法…",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON());
      if (json.length > 240000) {
        setError("笔记超过容量，请另建一条笔记");
        editor.commands.setContent(content(value), { emitUpdate: false });
        return;
      }
      setError("");
      onChange(editor.isEmpty ? "" : json);
    },
  });
  useEffect(() => {
    if (
      editor &&
      !editor.isDestroyed &&
      JSON.stringify(editor.getJSON()) !== value
    )
      editor.commands.setContent(content(value), { emitUpdate: false });
  }, [editor, value]);
  const capture = async (source) => {
    setError("");
    try {
      let element = source;
      if (!element) {
        if (video?.current?.readyState >= 2) element = video.current;
        else if (slide?.asset?.url) {
          element = new window.Image();
          element.src = slide.asset.url;
          await element.decode();
        } else throw Error("先播放视频或打开课件，再进行截图。");
      }
      const width = element.videoWidth || element.naturalWidth,
        height = element.videoHeight || element.naturalHeight;
      if (!width || !height) throw Error("画面尚未加载");
      const c = document.createElement("canvas");
      c.width = Math.min(960, width);
      c.height = Math.round((height * c.width) / width);
      c.getContext("2d").drawImage(element, 0, 0, c.width, c.height);
      setShot(c.toDataURL("image/jpeg", 0.65));
    } catch (e) {
      setError(
        e.name === "SecurityError"
          ? "外部资源不允许截图，可下载后上传截图。"
          : e.message,
      );
    }
  };
  const upload = async (e) => {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(selected.type) ||
      selected.size > 5 * 1024 * 1024
    ) {
      setError("请选择小于 5 MB 的 PNG / JPEG / WebP 图片");
      return;
    }
    const url = URL.createObjectURL(selected);
    try {
      const img = new window.Image();
      img.src = url;
      await img.decode();
      await capture(img);
    } catch {
      setError("无法读取这张图片");
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  if (!editor) return null;
  const tools = [
    ["加粗", "B", "toggleBold"],
    ["斜体", "I", "toggleItalic"],
    ["下划线", "U", "toggleUnderline"],
    ["项目列表", "≡", "toggleBulletList"],
  ];
  return (
    <>
      <div className="ls-note-toolbar">
        {tools.map(([label, text, command]) => (
          <button
            key={label}
            title={label}
            aria-label={label}
            onClick={() => editor.chain().focus()[command]().run()}
          >
            {text}
          </button>
        ))}
        <button
          onClick={() => {
            const href = window.prompt("输入 https:// 或 http:// 链接");
            if (href && /^https?:\/\//i.test(href))
              editor.chain().focus().setLink({ href }).run();
          }}
        >
          链接
        </button>
        <button onClick={() => file.current.click()}>图片</button>
      </div>
      <EditorContent className="ls-rich-editor" editor={editor} />
      <input
        hidden
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={upload}
      />
      <div className="ls-actions">
        <button onClick={() => capture()}>截图并标注</button>
      </div>
      {error && (
        <p role="alert" className="ls-error">
          {error}
        </p>
      )}
      {shot && (
        <Annotation
          source={shot}
          close={() => setShot("")}
          onSave={(src) => {
            onAnchor?.();
            editor.chain().focus().setImage({ src, alt: "私人学习截图" }).run();
            setShot("");
          }}
        />
      )}
    </>
  );
}
