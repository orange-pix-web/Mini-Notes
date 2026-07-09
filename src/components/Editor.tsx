import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";
import { getNoteContent, updateNote, deleteNote, toggleFavorite, togglePinned, importImage, importFile } from "@/api";
import type { Note } from "@/types";

interface EditorProps {
  note: Note | null;
  onNoteUpdated: () => void;
  onNoteCreated: () => void;
  onNoteDeleted: () => void;
}

function Editor({ note, onNoteUpdated, onNoteDeleted }: EditorProps) {
  const [content, setContent] = useState("");
  const [isEditing, setIsEditing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showProperties, setShowProperties] = useState(false);

  useEffect(() => {
    if (note) {
      loadNoteContent(note.relative_path);
    } else {
      setContent("");
    }
  }, [note]);

  const loadNoteContent = async (filePath: string) => {
    try {
      const fileContent = await getNoteContent(filePath);
      setContent(fileContent || "");
    } catch (error) {
      console.error("Failed to load note content:", error);
      setContent("");
    }
  };

  const handleSave = useCallback(async () => {
    if (!note) return;
    
    setIsSaving(true);
    try {
      const response = await updateNote({
        id: note.id,
        content,
      });
      
      if (response.success) {
        onNoteUpdated();
      }
    } catch (error) {
      console.error("Failed to save note:", error);
    } finally {
      setIsSaving(false);
    }
  }, [note, content, onNoteUpdated]);

  useEffect(() => {
    if (!note || !content) return;
    
    const debounce = setTimeout(() => {
      handleSave();
    }, 1000);
    
    return () => clearTimeout(debounce);
  }, [content, note, handleSave]);

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        
        const file = item.getAsFile();
        if (!file || !note) continue;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64Data = event.target?.result as string;
          const base64Content = base64Data.split(",")[1];
          
          try {
            const response = await importImage(note.id, base64Content);
            if (response.success && response.data) {
              const imageLink = `![图片](${response.data})`;
              setContent((prev) => prev + "\n\n" + imageLink);
            }
          } catch (error) {
            console.error("Failed to import image:", error);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    
    const files = e.dataTransfer.files;
    if (!files || !note) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = (file as unknown as { path?: string }).path;
      
      if (!filePath) continue;

      try {
        const response = await importFile(note.id, filePath);
        if (response.success && response.data) {
          const link = `[${file.name}](${response.data})`;
          setContent((prev) => prev + "\n\n" + link);
        }
      } catch (error) {
        console.error("Failed to import file:", error);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleToggleFavorite = async () => {
    if (!note) return;
    
    try {
      const response = await toggleFavorite(note.id);
      if (response.success) {
        onNoteUpdated();
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  };

  const handleTogglePinned = async () => {
    if (!note) return;
    
    try {
      const response = await togglePinned(note.id);
      if (response.success) {
        onNoteUpdated();
      }
    } catch (error) {
      console.error("Failed to toggle pinned:", error);
    }
  };

  const handleDelete = async () => {
    if (!note) return;
    
    if (window.confirm("确定要将此笔记移至回收站吗？")) {
      try {
        const response = await deleteNote(note.id);
        if (response.success) {
          onNoteDeleted();
        }
      } catch (error) {
        console.error("Failed to delete note:", error);
      }
    }
  };

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-400">
          <span className="text-6xl mb-4 block">📝</span>
          <p className="text-lg">选择或新建笔记</p>
          <p className="text-sm mt-2">在左侧列表中点击笔记进行编辑</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800 truncate max-w-md">
            {note.title}
          </h2>
          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded">
            {note.folder}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleFavorite}
            className={clsx(
              "p-2 rounded-lg transition-colors",
              note.is_favorite ? "text-yellow-500 bg-yellow-50" : "text-slate-400 hover:bg-slate-100"
            )}
            title="收藏"
          >
            ⭐
          </button>
          <button
            onClick={handleTogglePinned}
            className={clsx(
              "p-2 rounded-lg transition-colors",
              note.is_pinned ? "text-blue-500 bg-blue-50" : "text-slate-400 hover:bg-slate-100"
            )}
            title="置顶"
          >
            📌
          </button>
          <button
            onClick={() => setShowProperties(!showProperties)}
            className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
            title="属性"
          >
            ⚙️
          </button>
          <button
            onClick={handleDelete}
            className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
            title="删除"
          >
            🗑️
          </button>
          <div className="w-px h-6 bg-slate-200 mx-2" />
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={clsx(
              "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
              isEditing ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-600"
            )}
          >
            {isEditing ? "预览" : "编辑"}
          </button>
          {isSaving && (
            <span className="text-xs text-slate-400">保存中...</span>
          )}
        </div>
      </div>

      {showProperties && (
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div className="grid grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500">创建时间</span>
              <div className="text-slate-700">{new Date(note.created_at).toLocaleString("zh-CN")}</div>
            </div>
            <div>
              <span className="text-slate-500">更新时间</span>
              <div className="text-slate-700">{new Date(note.updated_at).toLocaleString("zh-CN")}</div>
            </div>
            <div>
              <span className="text-slate-500">状态</span>
              <div className="text-slate-700">{note.status}</div>
            </div>
            <div>
              <span className="text-slate-500">文件路径</span>
              <div className="text-slate-700 truncate">{note.relative_path}</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {isEditing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="w-full h-full p-4 resize-none bg-white editor-content text-slate-800"
            placeholder="开始编写你的笔记...

支持 Markdown 语法
粘贴图片自动上传
拖拽文件添加附件
使用 [[笔记名]] 创建双链"
          />
        ) : (
          <div className="w-full h-full p-4 overflow-y-auto markdown-preview bg-slate-50">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || "*暂无内容*"}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export default Editor;