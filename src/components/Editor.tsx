import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";
import { getNoteContent, updateNote, deleteNote, toggleFavorite, togglePinned } from "@/api";
import type { Note } from "@/types";

interface EditorProps {
  note: Note | null;
  onNoteUpdated: () => void;
  onNoteDeleted: () => void;
  onNoteRenamed: (id: string, newTitle: string) => Promise<boolean>;
}

type SaveStatus = "saved" | "editing" | "saving" | "failed";

function Editor({ note, onNoteUpdated, onNoteDeleted, onNoteRenamed }: EditorProps) {
  const [draftContent, setDraftContent] = useState("");
  const [lastSavedContent, setLastSavedContent] = useState("");
  const [isEditing, setIsEditing] = useState(true);
  const [contentSaveStatus, setContentSaveStatus] = useState<SaveStatus>("saved");
  const [titleSaveStatus, setTitleSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState("");
  const [showProperties, setShowProperties] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [lastSavedTitle, setLastSavedTitle] = useState("");
  const noteIdRef = useRef<string | null>(null);

  const loadNoteContent = useCallback(async (relativePath: string) => {
    try {
      const fileContent = await getNoteContent(relativePath);
      if (noteIdRef.current === note?.id) {
        setDraftContent(fileContent || "");
        setLastSavedContent(fileContent || "");
      }
    } catch (error) {
      console.error("Failed to load note content:", error);
    }
  }, [note?.id]);

  useEffect(() => {
    if (note && note.id !== noteIdRef.current) {
      noteIdRef.current = note.id;
      setDraftTitle(note.title);
      setLastSavedTitle(note.title);
      loadNoteContent(note.relative_path);
    } else if (!note) {
      noteIdRef.current = null;
      setDraftContent("");
      setLastSavedContent("");
      setDraftTitle("");
      setLastSavedTitle("");
    }
  }, [note, loadNoteContent]);

  const handleTitleBlur = async () => {
    if (!note) {
      setIsEditingTitle(false);
      return;
    }
    
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      setDraftTitle(lastSavedTitle);
      setIsEditingTitle(false);
      return;
    }
    
    if (trimmed === lastSavedTitle) {
      setIsEditingTitle(false);
      return;
    }
    
    setTitleSaveStatus("saving");
    setSaveError("");
    
    try {
      const success = await onNoteRenamed(note.id, trimmed);
      if (success) {
        setLastSavedTitle(trimmed);
        setTitleSaveStatus("saved");
      } else {
        setTitleSaveStatus("failed");
        setSaveError("重命名失败");
        setDraftTitle(lastSavedTitle);
      }
    } catch (error) {
      setTitleSaveStatus("failed");
      setSaveError("重命名失败: 网络错误");
      setDraftTitle(lastSavedTitle);
    }
    
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTitleBlur();
    } else if (e.key === "Escape") {
      setDraftTitle(note?.title || "");
      setIsEditingTitle(false);
    }
  };

  const isContentDirty = draftContent !== lastSavedContent;

  const handleSave = useCallback(async () => {
    if (!note || !isContentDirty || contentSaveStatus === "saving") return;

    setContentSaveStatus("saving");
    try {
      const response = await updateNote({
        id: note.id,
        content: draftContent,
      });

      if (response.success) {
        setLastSavedContent(draftContent);
        setContentSaveStatus("saved");
        onNoteUpdated();
      } else {
        setContentSaveStatus("failed");
        setSaveError(response.message || "保存失败");
        console.error("Save failed:", response.message);
      }
    } catch (error) {
      console.error("Failed to save note:", error);
      setContentSaveStatus("failed");
      setSaveError("保存失败: 网络错误");
    }
  }, [note, draftContent, isContentDirty, contentSaveStatus, onNoteUpdated]);

  useEffect(() => {
    if (!note || !isContentDirty) return;

    const debounce = setTimeout(() => {
      handleSave();
    }, 1000);

    return () => clearTimeout(debounce);
  }, [draftContent, note, isContentDirty, handleSave]);

  const handleContentChange = (value: string) => {
    setDraftContent(value);
    if (contentSaveStatus === "saved") {
      setContentSaveStatus("editing");
    }
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

  const getCombinedSaveStatus = (): SaveStatus => {
    if (contentSaveStatus === "failed" || titleSaveStatus === "failed") return "failed";
    if (contentSaveStatus === "saving" || titleSaveStatus === "saving") return "saving";
    if (contentSaveStatus === "editing" || titleSaveStatus === "editing") return "editing";
    return "saved";
  };

  const getStatusText = () => {
    const status = getCombinedSaveStatus();
    switch (status) {
      case "saved":
        return "已保存";
      case "editing":
        return "编辑中";
      case "saving":
        return "保存中...";
      case "failed":
        return saveError || "保存失败";
    }
  };

  const getStatusColor = () => {
    const status = getCombinedSaveStatus();
    switch (status) {
      case "saved":
        return "text-green-500";
      case "editing":
        return "text-yellow-500";
      case "saving":
        return "text-blue-500";
      case "failed":
        return "text-red-500";
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
          {isEditingTitle ? (
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              className="text-lg font-semibold text-slate-800 border-b-2 border-blue-500 bg-transparent outline-none max-w-md"
              autoFocus
            />
          ) : (
            <h2 
              className="text-lg font-semibold text-slate-800 truncate max-w-md cursor-text hover:text-blue-600"
              onClick={() => setIsEditingTitle(true)}
            >
              {note.title}
            </h2>
          )}
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
          <span className={`text-xs ${getStatusColor()}`}>
            {getStatusText()}
          </span>
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
            value={draftContent}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full h-full p-4 resize-none bg-white text-slate-800 font-mono text-sm leading-relaxed focus:outline-none"
            placeholder="开始编写你的笔记...

支持 Markdown 语法"
            autoFocus
          />
        ) : (
          <div className="w-full h-full p-4 overflow-y-auto bg-slate-50">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
              {draftContent || "*暂无内容*"}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export default Editor;