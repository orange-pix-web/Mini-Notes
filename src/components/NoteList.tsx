import type { Note, NavItem, NavOption, FileTreeNode } from "@/types";
import FileTree from "./FileTree";

const navOptions: NavOption[] = [
  { id: "all", label: "全部笔记", icon: "📝" },
  { id: "inbox", label: "Inbox 待整理", icon: "📥" },
  { id: "favorite", label: "收藏", icon: "⭐" },
  { id: "tags", label: "标签", icon: "🏷️" },
  { id: "categories", label: "分类", icon: "📁" },
  { id: "projects", label: "项目", icon: "📋" },
  { id: "tasks", label: "任务", icon: "✅" },
  { id: "attachments", label: "附件", icon: "📎" },
  { id: "trash", label: "回收站", icon: "🗑️" },
];

interface NoteListProps {
  notes: Note[];
  selectedNote: Note | null;
  onSelect: (note: Note) => void;
  isLoading: boolean;
  activeNav: NavItem;
  folderName?: string;
  fileTree: FileTreeNode[];
  activeFolder: string | null;
  onFolderChange: (folder: string) => void;
  onNoteSelectByPath: (relativePath: string) => void;
}

function NoteList({ notes, selectedNote, onSelect, isLoading, activeNav, folderName, fileTree, activeFolder, onFolderChange, onNoteSelectByPath }: NoteListProps) {
  const currentNav = navOptions.find((n) => n.id === activeNav);
  const navTitle = activeNav === "folder" ? folderName || "文件夹" : currentNav?.label || "笔记";

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "今天";
    if (days === 1) return "昨天";
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  const getEmptyStateContent = () => {
    switch (activeNav) {
      case "folder":
        return { icon: "📁", title: "当前文件夹暂无笔记", desc: "点击新建笔记开始" };
      case "inbox":
        return { icon: "📥", title: "Inbox 为空", desc: "点击新建笔记开始" };
      case "favorite":
        return { icon: "⭐", title: "暂无收藏", desc: "点击笔记旁的星星收藏" };
      case "trash":
        return { icon: "🗑️", title: "回收站为空", desc: "已删除的笔记会显示在这里" };
      case "tags":
        return { icon: "🏷️", title: "暂无标签", desc: "标签功能开发中" };
      case "categories":
        return { icon: "📁", title: "暂无分类", desc: "分类功能开发中" };
      case "projects":
        return { icon: "📋", title: "暂无项目", desc: "项目功能开发中" };
      case "tasks":
        return { icon: "✅", title: "暂无任务", desc: "任务功能开发中" };
      case "attachments":
        return { icon: "📎", title: "暂无附件", desc: "附件功能开发中" };
      default:
        return { icon: "📝", title: "暂无笔记", desc: "点击左侧新建笔记开始" };
    }
  };

  const emptyState = getEmptyStateContent();

  return (
    <div className="w-96 bg-white border-r border-slate-200 flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <span className="text-sm font-medium text-slate-700">{navTitle}</span>
        <span className="text-xs text-slate-400">{notes.length} 条</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            加载中...
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="border-b border-slate-100">
              <div className="px-3 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
                文件树
              </div>
              <FileTree 
                tree={fileTree} 
                activeFolder={activeFolder}
                onFolderClick={onFolderChange}
                onNoteClick={onNoteSelectByPath}
                selectedNote={selectedNote}
              />
            </div>
            
            {activeNav === "folder" && (
              <div className="border-t border-slate-100">
                <div className="px-3 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  当前文件夹笔记
                </div>
                {notes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                    <span className="text-4xl mb-2">{emptyState.icon}</span>
                    <p className="text-sm font-medium text-slate-500">{emptyState.title}</p>
                    <p className="text-xs text-slate-400 mt-1">{emptyState.desc}</p>
                  </div>
                ) : (
                  <div className="py-2">
                    {notes.map((note) => (
                      <button
                        key={note.id}
                        onClick={() => onSelect(note)}
                        className={`w-full text-left px-3 py-2.5 border-b border-slate-50 transition-colors ${
                          selectedNote?.id === note.id
                            ? "bg-blue-50 border-l-2 border-l-blue-500"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              {note.is_pinned && <span className="text-xs">📌</span>}
                              {note.is_favorite && <span className="text-xs">⭐</span>}
                              <h3 className="text-sm font-medium text-slate-800 truncate">
                                {note.title}
                              </h3>
                            </div>
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {note.summary || "无摘要"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-slate-400">{note.folder}</span>
                          <span className="text-xs text-slate-400">
                            {formatDate(note.updated_at)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {activeNav !== "folder" && notes.length > 0 && (
              <div className="py-2">
                {notes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => onSelect(note)}
                    className={`w-full text-left px-3 py-2.5 border-b border-slate-50 transition-colors ${
                      selectedNote?.id === note.id
                        ? "bg-blue-50 border-l-2 border-l-blue-500"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          {note.is_pinned && <span className="text-xs">📌</span>}
                          {note.is_favorite && <span className="text-xs">⭐</span>}
                          <h3 className="text-sm font-medium text-slate-800 truncate">
                            {note.title}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {note.summary || "无摘要"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-slate-400">{note.folder}</span>
                      <span className="text-xs text-slate-400">
                        {formatDate(note.updated_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {activeNav !== "folder" && notes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <span className="text-4xl mb-2">{emptyState.icon}</span>
                <p className="text-sm font-medium text-slate-500">{emptyState.title}</p>
                <p className="text-xs text-slate-400 mt-1">{emptyState.desc}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default NoteList;