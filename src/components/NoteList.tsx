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
  selectedRelativePath: string | null;
  isLoading: boolean;
  activeNav: NavItem;
  folderName?: string;
  fileTree: FileTreeNode[];
  activeFolder: string | null;
  onFolderChange: (folder: string) => void;
  onOpenFile: (relativePath: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (relativePath: string) => void;
  onMoveFile: (sourcePath: string, targetFolder: string) => void;
  onDeleteFolder: (folderPath: string) => void;
}

function NoteList({ notes, selectedRelativePath, isLoading, activeNav, folderName, fileTree, activeFolder, onFolderChange, onOpenFile, expandedFolders, onToggleFolder, onMoveFile, onDeleteFolder }: NoteListProps) {
  console.log('[NOTELIST] fileTree length:', fileTree.length);
  const currentNav = navOptions.find((n) => n.id === activeNav);
  const navTitle = activeNav === "folder" ? folderName || "文件夹" : currentNav?.label || "笔记";

  return (
    <div className="w-[200px] bg-white border-r border-slate-200 flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <span className="text-sm font-medium text-slate-700">{navTitle}</span>
        <span className="text-xs text-slate-400">{notes.length} 条</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {fileTree.length === 0 && isLoading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            加载中...
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider bg-slate-50">
              文件树 ({fileTree.length}个根节点)
            </div>
            <div className="flex-1 overflow-y-auto">
              {fileTree.length === 0 ? (
                <div className="text-center text-slate-400 py-4">文件树为空</div>
              ) : (
                <FileTree 
                  tree={fileTree} 
                  activeFolder={activeFolder}
                  onFolderClick={onFolderChange}
                  onOpenFile={onOpenFile}
                  selectedRelativePath={selectedRelativePath}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onMoveFile={onMoveFile}
                  onDeleteFolder={onDeleteFolder}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default NoteList;