import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { FileTreeNode, FileTreeVisibleItem, NavItem, NavOption, Note } from "@/types";
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

interface TreeClickModifiers {
  isPrimaryPressed: boolean;
  isShiftPressed: boolean;
}

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
  onMoveFile: (sourcePath: string, targetFolder: string) => Promise<void>;
  onMoveFiles: (sourcePaths: string[], targetFolder: string) => Promise<void>;
  onDeleteFolder: (folderPath: string) => void;
  onRenameFolder: (oldPath: string, newName: string) => void;
  onOpenFolder: (relativePath: string) => void;
  onDeleteNote: (relativePath: string) => void;
  onNewNote: () => void;
  onNewFolder: () => void;
}

const ROOT_PATH = "";

function buildVisibleItems(
  tree: FileTreeNode[],
  expandedFolders: Set<string>,
  depth = 0,
  parentPath: string | null = null,
): FileTreeVisibleItem[] {
  const items: FileTreeVisibleItem[] = [];

  for (const node of tree) {
    const item: FileTreeVisibleItem = {
      path: node.relative_path,
      name: node.name,
      type: node.node_type === "folder" ? "folder" : "note",
      depth,
      parentPath,
      isExpanded: node.node_type === "folder" ? expandedFolders.has(node.relative_path) : undefined,
    };
    items.push(item);

    if (node.node_type === "folder" && expandedFolders.has(node.relative_path) && node.children.length > 0) {
      items.push(...buildVisibleItems(node.children, expandedFolders, depth + 1, node.relative_path));
    }
  }

  return items;
}

function hasSelectedAncestor(path: string, selectedPaths: string[]) {
  return selectedPaths.some((candidate) => candidate !== path && path.startsWith(`${candidate}/`));
}

function normalizeDraggedPaths(paths: string[]) {
  const uniquePaths = Array.from(new Set(paths)).filter((path) => path !== ROOT_PATH);
  return uniquePaths.filter((path) => !hasSelectedAncestor(path, uniquePaths));
}

function NoteList({
  notes,
  selectedRelativePath,
  isLoading,
  activeNav,
  folderName,
  fileTree,
  activeFolder,
  onFolderChange,
  onOpenFile,
  expandedFolders,
  onToggleFolder,
  onMoveFile,
  onMoveFiles,
  onDeleteFolder,
  onRenameFolder,
  onOpenFolder,
  onDeleteNote,
  onNewNote,
  onNewFolder,
}: NoteListProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(null);
  const [draggedPaths, setDraggedPaths] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  const currentNav = navOptions.find((n) => n.id === activeNav);
  const navTitle = activeNav === "folder" ? folderName || "文件夹" : currentNav?.label || "笔记";
  const isMac = useMemo(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform), []);

  const visibleItems = useMemo<FileTreeVisibleItem[]>(() => {
    return [
      { path: ROOT_PATH, name: "根目录", type: "root", depth: 0, parentPath: null, isExpanded: true },
      ...buildVisibleItems(fileTree, expandedFolders),
    ];
  }, [fileTree, expandedFolders]);

  const visibleIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleItems.forEach((item, index) => {
      map.set(item.path, index);
    });
    return map;
  }, [visibleItems]);

  const syncSingleSelection = useCallback((path: string | null) => {
    if (path === null) {
      setSelectedPaths(new Set());
      setFocusedPath(null);
      setSelectionAnchorPath(null);
      return;
    }

    setSelectedPaths(new Set([path]));
    setFocusedPath(path);
    setSelectionAnchorPath(path);
  }, []);

  useEffect(() => {
    if (selectedRelativePath) {
      syncSingleSelection(selectedRelativePath);
      return;
    }

    if (activeNav === "folder" && activeFolder !== null) {
      syncSingleSelection(activeFolder);
    }
  }, [selectedRelativePath, activeNav, activeFolder, syncSingleSelection]);

  useEffect(() => {
    setSelectedPaths((prev) => {
      const next = new Set(Array.from(prev).filter((path) => visibleIndexMap.has(path)));
      const prevPaths = Array.from(prev).sort().join("|");
      const nextPaths = Array.from(next).sort().join("|");
      return prevPaths === nextPaths ? prev : next;
    });

    setFocusedPath((prev) => (prev && visibleIndexMap.has(prev) ? prev : visibleItems[0]?.path ?? null));
    setSelectionAnchorPath((prev) => (prev && visibleIndexMap.has(prev) ? prev : visibleItems[0]?.path ?? null));
  }, [visibleIndexMap, visibleItems]);

  const getTargetDisplayName = () => {
    if (dropTarget === ROOT_PATH) {
      return "根目录";
    }
    return dropTarget || "";
  };

  const isPrimaryModifier = (event: TreeClickModifiers) => event.isPrimaryPressed;

  const handleSingleSelection = useCallback((path: string) => {
    setSelectedPaths(new Set([path]));
    setFocusedPath(path);
    setSelectionAnchorPath(path);
  }, []);

  const handleRangeSelection = useCallback((path: string) => {
    const anchorPath = selectionAnchorPath ?? focusedPath ?? path;
    const anchorIndex = visibleIndexMap.get(anchorPath);
    const targetIndex = visibleIndexMap.get(path);

    if (anchorIndex === undefined || targetIndex === undefined) {
      handleSingleSelection(path);
      return;
    }

    const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    const rangePaths = visibleItems.slice(start, end + 1).map((item) => item.path);
    setSelectedPaths(new Set(rangePaths));
    setFocusedPath(path);
  }, [selectionAnchorPath, focusedPath, visibleIndexMap, visibleItems, handleSingleSelection]);

  const handleToggleSelection = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    setFocusedPath(path);
    setSelectionAnchorPath(path);
  }, []);

  const activateItem = useCallback((item: FileTreeVisibleItem) => {
    if (item.type === "root") {
      onFolderChange(ROOT_PATH);
      return;
    }

    if (item.type === "folder") {
      onToggleFolder(item.path);
      onFolderChange(item.path);
      return;
    }

    onOpenFile(item.path);
  }, [onFolderChange, onOpenFile, onToggleFolder]);

  const handleItemClick = useCallback((item: FileTreeVisibleItem, modifiers: TreeClickModifiers) => {
    if (modifiers.isShiftPressed) {
      handleRangeSelection(item.path);
      return;
    }

    if (isPrimaryModifier(modifiers)) {
      handleToggleSelection(item.path);
      return;
    }

    handleSingleSelection(item.path);
    activateItem(item);
  }, [activateItem, handleRangeSelection, handleSingleSelection, handleToggleSelection]);

  const moveFocusByOffset = useCallback((offset: number) => {
    if (visibleItems.length === 0) {
      return;
    }

    const currentIndex = focusedPath ? visibleIndexMap.get(focusedPath) ?? 0 : 0;
    const nextIndex = Math.min(Math.max(currentIndex + offset, 0), visibleItems.length - 1);
    const nextPath = visibleItems[nextIndex]?.path;

    if (nextPath === undefined) {
      return;
    }

    handleSingleSelection(nextPath);
  }, [focusedPath, visibleIndexMap, visibleItems, handleSingleSelection]);

  const focusParent = useCallback((path: string) => {
    const currentItem = visibleItems[visibleIndexMap.get(path) ?? -1];
    if (!currentItem?.parentPath) {
      handleSingleSelection(ROOT_PATH);
      onFolderChange(ROOT_PATH);
      return;
    }

    handleSingleSelection(currentItem.parentPath);
    onFolderChange(currentItem.parentPath);
  }, [visibleItems, visibleIndexMap, handleSingleSelection, onFolderChange]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    if (tagName === "input" || tagName === "textarea" || target.isContentEditable) {
      return;
    }

    const primaryPressed = isMac ? event.metaKey : event.ctrlKey;

    if (primaryPressed && event.key.toLowerCase() === "n") {
      event.preventDefault();
      if (event.shiftKey) {
        onNewFolder();
      } else {
        onNewNote();
      }
      return;
    }

    if (primaryPressed && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const paths = visibleItems.map((item) => item.path);
      setSelectedPaths(new Set(paths));
      const lastPath = paths[paths.length - 1] ?? null;
      setFocusedPath(lastPath);
      setSelectionAnchorPath(paths[0] ?? null);
      return;
    }

    const currentPath = focusedPath ?? visibleItems[0]?.path;
    if (!currentPath) {
      return;
    }

    const currentItem = visibleItems[visibleIndexMap.get(currentPath) ?? -1];
    if (!currentItem) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocusByOffset(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocusByOffset(-1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (currentItem.type === "folder") {
        if (!expandedFolders.has(currentItem.path)) {
          onToggleFolder(currentItem.path);
          onFolderChange(currentItem.path);
          return;
        }

        const childItem = visibleItems.find((item) => item.parentPath === currentItem.path);
        if (childItem) {
          handleSingleSelection(childItem.path);
        }
        return;
      }

      if (currentItem.type === "root") {
        const firstChild = visibleItems[1];
        if (firstChild) {
          handleSingleSelection(firstChild.path);
        }
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (currentItem.type === "folder" && expandedFolders.has(currentItem.path)) {
        onToggleFolder(currentItem.path);
        onFolderChange(currentItem.path);
        return;
      }

      if (currentItem.type !== "root") {
        focusParent(currentItem.path);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      activateItem(currentItem);
    }
  }, [
    activateItem,
    expandedFolders,
    focusParent,
    focusedPath,
    handleSingleSelection,
    isMac,
    moveFocusByOffset,
    onFolderChange,
    onNewFolder,
    onNewNote,
    onToggleFolder,
    visibleIndexMap,
    visibleItems,
  ]);

  const handleDragSelectionStart = useCallback((path: string) => {
    const currentSelection = selectedPaths.has(path) ? Array.from(selectedPaths) : [path];
    const normalizedPaths = normalizeDraggedPaths(currentSelection);
    if (!selectedPaths.has(path)) {
      handleSingleSelection(path);
    }
    setDraggedPaths(normalizedPaths);
    return normalizedPaths;
  }, [selectedPaths, handleSingleSelection]);

  const handleDragEnd = useCallback(() => {
    setDraggedPaths([]);
    setDropTarget(null);
  }, []);

  const canDropPaths = useCallback((paths: string[], targetFolder: string) => {
    return paths.every((path) => path !== targetFolder && !targetFolder.startsWith(`${path}/`));
  }, []);

  const handleDropPaths = useCallback(async (paths: string[], targetFolder: string) => {
    const normalizedPaths = normalizeDraggedPaths(paths);
    if (normalizedPaths.length === 0 || !canDropPaths(normalizedPaths, targetFolder)) {
      setDraggedPaths([]);
      setDropTarget(null);
      return;
    }

    if (normalizedPaths.length === 1) {
      await onMoveFile(normalizedPaths[0], targetFolder);
    } else {
      await onMoveFiles(normalizedPaths, targetFolder);
    }

    setDraggedPaths([]);
    setDropTarget(null);
  }, [canDropPaths, onMoveFile, onMoveFiles]);

  const primaryModifierLabel = isMac ? "Cmd" : "Ctrl";

  return (
    <div className="w-[240px] bg-white border-r border-slate-200 flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-200">
        <span className="text-sm font-medium text-slate-700">{navTitle}</span>
        <span className="text-xs text-slate-400">{notes.length} 条</span>
      </div>

      <div className="px-3 py-2 text-[11px] text-slate-400 border-b border-slate-100 bg-slate-50">
        {primaryModifierLabel}+点击多选，Shift+点击连选，方向键导航
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
            <div
              ref={treeContainerRef}
              className="flex-1 overflow-y-auto outline-none focus:ring-2 focus:ring-blue-300 focus:ring-inset"
              tabIndex={0}
              onKeyDown={handleKeyDown}
            >
              {fileTree.length === 0 ? (
                <div className="text-center text-slate-400 py-4">文件树为空</div>
              ) : (
                <FileTree
                  tree={fileTree}
                  activeFolder={activeFolder}
                  expandedFolders={expandedFolders}
                  onToggleFolder={onToggleFolder}
                  onDeleteFolder={onDeleteFolder}
                  onRenameFolder={onRenameFolder}
                  onOpenFolder={onOpenFolder}
                  onDeleteNote={onDeleteNote}
                  selectedPaths={selectedPaths}
                  focusedPath={focusedPath}
                  dropTarget={dropTarget}
                  draggedPaths={draggedPaths}
                  onItemClick={handleItemClick}
                  onDragSelectionStart={handleDragSelectionStart}
                  onDragEnd={handleDragEnd}
                  onDropPaths={handleDropPaths}
                  onSetDropTarget={setDropTarget}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {draggedPaths.length > 0 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          <span className="text-slate-300">移动{draggedPaths.length > 1 ? `${draggedPaths.length}个项目到` : "到"}：</span>
          <span className="text-blue-300 font-medium ml-1">
            {getTargetDisplayName() || "选择目标位置"}
          </span>
        </div>
      )}
    </div>
  );
}

export default NoteList;
