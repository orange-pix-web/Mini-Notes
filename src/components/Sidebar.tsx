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
  currentFolderPath?: string;
  version?: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onOpenSearch?: () => void;
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
  currentFolderPath,
  version,
  collapsed = false,
  onToggleCollapsed,
  onOpenSearch,
}: SidebarProps) {
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
    <div className={`${collapsed ? "w-[68px]" : "w-[200px]"} bg-white border-r border-slate-200 flex flex-col transition-[width] duration-200`}>
      <div className={`${collapsed ? "px-2 py-3" : "p-3"} border-b border-slate-200`}>
        <div className={`flex items-start ${collapsed ? "justify-center" : "justify-between"} gap-2`}>
          <div className={collapsed ? "hidden" : "min-w-0"}>
            <h1 className="text-lg font-bold text-slate-800">Mini Notes</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              个人工作笔记
              {version ? <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">v{version}</span> : null}
            </p>
          </div>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="text-sm font-bold text-slate-700" title={`Mini Notes${version ? ` v${version}` : ""}`}>MN</div>
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                title="展开侧边栏"
                aria-label="展开侧边栏"
              >
                ▶
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              title="折叠侧边栏"
              aria-label="折叠侧边栏"
            >
              ◀
            </button>
          )}
        </div>
        {collapsed && version ? (
          <div className="mt-2 text-center text-[10px] text-slate-400">v{version}</div>
        ) : null}
      </div>

      <div className={`${collapsed ? "p-2" : "p-2"} flex flex-col gap-2`}>
        <button
          onClick={handleNewNoteClick}
          title="新建笔记"
          disabled={!onNewNote || isCreating}
          className={`relative flex items-center ${collapsed ? "justify-center px-0 py-2.5" : "justify-center gap-2 px-3 py-2"} text-sm font-medium rounded-lg transition-colors ${
            isCreating
              ? "bg-blue-400 text-white cursor-wait"
              : "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          <span className={`relative inline-flex items-center justify-center ${collapsed ? "text-lg" : ""}`}>
            <span aria-hidden="true">📝</span>
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-blue-600">+</span>
          </span>
          {!collapsed && <span>{isCreating ? "创建中..." : "新建笔记"}</span>}
        </button>

        <button
          onClick={handleNewFolderClick}
          title="新建文件夹"
          disabled={!onNewFolder || isCreating}
          className={`relative flex items-center ${collapsed ? "justify-center px-0 py-2.5" : "justify-center gap-2 px-3 py-2"} text-sm font-medium rounded-lg transition-colors ${
            isCreating
              ? "bg-green-400 text-white cursor-wait"
              : "bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          <span className={`relative inline-flex items-center justify-center ${collapsed ? "text-lg" : ""}`}>
            <span aria-hidden="true">📁</span>
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-green-600">+</span>
          </span>
          {!collapsed && <span>{isCreating ? "创建中..." : "新建文件夹"}</span>}
        </button>

        {collapsed && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex items-center justify-center rounded-lg px-0 py-2.5 text-slate-500 hover:bg-slate-50 hover:text-blue-500 transition-colors"
            title="全局搜索"
            aria-label="全局搜索"
          >
            <span aria-hidden="true" className="text-lg">🔎</span>
          </button>
        )}

        {!collapsed && (
          <div className="mt-1 text-center text-xs">
            {isCreating && <span className="text-blue-500">创建中...</span>}
            {isSuccess && <span className="text-green-500">{createStatus.message}</span>}
            {isFailed && <span className="text-red-500">{createStatus.message}</span>}
            {!isCreating && !isSuccess && !isFailed && <span className="text-slate-400">空闲</span>}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className="w-full flex items-center justify-between px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            title="全局搜索"
            aria-label="全局搜索"
          >
            <span>搜索...</span>
            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-400 border border-slate-200">⌘K</span>
          </button>
        </div>
      )}

      <nav className="py-2 border-b border-slate-100">
        {!collapsed && (
          <div className="px-3 text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
            快捷入口
          </div>
        )}
        {quickNavOptions.map((option) => (
          <button
            key={option.id}
            title={option.label}
            onClick={() => onNavChange(option.id)}
            className={`w-full flex items-center ${collapsed ? "justify-center px-0 py-2.5 mx-0" : "px-3 py-1.5 mx-1"} text-sm transition-colors rounded-lg ${
              activeNav === option.id && activeFolder === null
                ? "bg-blue-50 text-blue-600 font-medium"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className={`${collapsed ? "text-lg" : "mr-2 text-base"}`}>{option.icon}</span>
            {!collapsed && <span>{option.label}</span>}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto"></div>

      <div className={`${collapsed ? "p-2" : "p-2"} border-t border-slate-200`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onDirChange}
              className="w-full flex justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-50 hover:text-blue-500 transition-colors"
              title={currentDir || "~/MiniNotes"}
              aria-label="更换文件夹"
            >
              <span aria-hidden="true">📂</span>
            </button>
          </div>
        ) : (
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
        )}
      </div>

      {showNewFolderModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 w-[320px]">
            <h3 className="text-sm font-medium text-slate-800 mb-2">新建文件夹</h3>
            <div className="text-xs text-slate-500 mb-3 bg-slate-50 px-2 py-1.5 rounded">
              <span className="text-slate-400">创建路径：</span>
              <span className="text-blue-500 truncate ml-1">
                {currentFolderPath || '根目录'}
              </span>
            </div>
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
