import { useState } from "react";
import type { NavItem, NavOption } from "@/types";

const quickNavOptions: NavOption[] = [
  { id: "all", label: "全部笔记", icon: "📝" },
  { id: "favorite", label: "收藏", icon: "⭐" },
  { id: "trash", label: "回收站", icon: "🗑️" },
];

interface SidebarProps {
  activeNav: NavItem;
  activeFolder: string | null;
  onNavChange: (nav: NavItem) => void;
  onNewNote?: () => void;
  onNewFolder?: () => void;
  currentDir?: string;
  onDirChange?: () => void;
  createStatus?: {
    state: "idle" | "creating" | "success" | "failed";
    message: string;
  };
  showNewFolderModal?: boolean;
  newFolderName?: string;
  onNewFolderNameChange?: (name: string) => void;
  onNewFolderConfirm?: () => void;
  onNewFolderCancel?: () => void;
}

function Sidebar({ 
  activeNav, 
  activeFolder,
  onNavChange, 
  onNewNote, 
  onNewFolder,
  currentDir, 
  onDirChange, 
  createStatus,
  showNewFolderModal,
  newFolderName,
  onNewFolderNameChange,
  onNewFolderConfirm,
  onNewFolderCancel,
}: SidebarProps) {
  const [searchInput, setSearchInput] = useState("");

  const handleNewNoteClick = () => {
    console.log("[UI] new note button clicked");
    if (onNewNote) {
      onNewNote();
    }
  };

  const handleNewFolderClick = () => {
    console.log("[UI] new folder button clicked");
    if (onNewFolder) {
      onNewFolder();
    }
  };

  const isCreating = createStatus?.state === "creating";
  const isFailed = createStatus?.state === "failed";
  const isSuccess = createStatus?.state === "success";

  return (
    <div className="w-[200px] bg-white border-r border-slate-200 flex flex-col">
      <div className="p-3 border-b border-slate-200">
        <h1 className="text-lg font-bold text-slate-800">Mini Notes</h1>
        <p className="text-xs text-slate-500 mt-0.5">个人工作笔记</p>
      </div>

      <div className="p-2 flex flex-col gap-2">
        <button
          onClick={handleNewNoteClick}
          disabled={!onNewNote || isCreating}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            isCreating
              ? "bg-blue-400 text-white cursor-wait"
              : "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          <span>+</span>
          <span>{isCreating ? "创建中..." : "新建笔记"}</span>
        </button>
        
        <button
          onClick={handleNewFolderClick}
          disabled={!onNewFolder || isCreating}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            isCreating
              ? "bg-green-400 text-white cursor-wait"
              : "bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          <span>+</span>
          <span>{isCreating ? "创建中..." : "新建文件夹"}</span>
        </button>
        
        <div className="mt-1 text-center text-xs">
          {isCreating && <span className="text-blue-500">创建中...</span>}
          {isSuccess && <span className="text-green-500">{createStatus.message}</span>}
          {isFailed && <span className="text-red-500">{createStatus.message}</span>}
          {!isCreating && !isSuccess && !isFailed && <span className="text-slate-400">空闲</span>}
        </div>
      </div>

      <div className="px-2 pb-2">
        <input
          type="text"
          placeholder="搜索..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
      </div>

      <nav className="py-2 border-b border-slate-100">
        <div className="px-3 text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
          快捷入口
        </div>
        {quickNavOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => onNavChange(option.id)}
            className={`w-full flex items-center px-3 py-1.5 text-sm transition-colors rounded-lg mx-1 ${
              activeNav === option.id && activeFolder === null
                ? "bg-blue-50 text-blue-600 font-medium"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="mr-2 text-base">{option.icon}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto"></div>

      <div className="p-2 border-t border-slate-200">
        <div className="text-xs text-slate-400">
          <div>当前笔记文件夹</div>
          <div className="text-slate-500 truncate">{currentDir || "~/MiniNotes"}</div>
          <button 
            onClick={onDirChange}
            className="text-blue-500 text-xs mt-1 hover:underline"
          >
            [更换文件夹]
          </button>
        </div>
      </div>

      {showNewFolderModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 w-[280px]">
            <h3 className="text-sm font-medium text-slate-800 mb-3">新建文件夹</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => onNewFolderNameChange?.(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent mb-3"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onNewFolderConfirm?.();
                } else if (e.key === "Escape") {
                  onNewFolderCancel?.();
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={onNewFolderCancel}
                className="flex-1 px-3 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={onNewFolderConfirm}
                disabled={!newFolderName || newFolderName.trim() === ""}
                className="flex-1 px-3 py-1.5 text-sm text-white bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sidebar;