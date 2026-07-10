import { useState } from "react";
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
  onRenameFolder: (oldPath: string, newName: string) => void;
}

function NoteList({ notes, selectedRelativePath, isLoading, activeNav, folderName, fileTree, activeFolder, onFolderChange, onOpenFile, expandedFolders, onToggleFolder, onMoveFile, onDeleteFolder, onRenameFolder }: NoteListProps) {
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  console.log('[NOTELIST] fileTree length:', fileTree.length);
  const currentNav = navOptions.find((n) => n.id === activeNav);
  const navTitle = activeNav === "folder" ? folderName || "文件夹" : currentNav?.label || "笔记";

  const getTargetDisplayName = () => {
    if (dropTarget === '') {
      return '根目录';
    } else if (dropTarget) {
      return dropTarget;
    }
    return '';
  };

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
                  onRenameFolder={onRenameFolder}
                  draggedPath={draggedPath}
                  setDraggedPath={setDraggedPath}
                  dropTarget={dropTarget}
                  setDropTarget={setDropTarget}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {draggedPath && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          <span className="text-slate-300">移动到：</span>
          <span className="text-blue-300 font-medium ml-1">
            {getTargetDisplayName() || '选择目标位置'}
          </span>
        </div>
      )}
    </div>
  );
}

export default NoteList;
