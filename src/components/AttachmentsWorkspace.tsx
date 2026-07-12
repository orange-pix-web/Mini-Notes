import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { readAttachmentThumbnail } from "@/api";
import type { AttachmentFolderNode, AttachmentItem } from "@/types";

interface AttachmentsWorkspaceProps {
  tree: AttachmentFolderNode[];
  items: AttachmentItem[];
  selectedFolder: string;
  attachmentsRootDir: string;
  onSelectFolder: (path: string) => void;
  onOpenItem: (path: string) => Promise<void>;
  onImportFiles: () => Promise<void>;
  onOpenFolder: (path: string) => Promise<void>;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameItem: (item: AttachmentItem, name: string) => Promise<void>;
  onDeleteItem: (item: AttachmentItem) => Promise<void>;
  onMoveItems: (sourcePaths: string[], targetFolder: string) => Promise<void>;
}

interface TreeClickModifiers {
  isPrimaryPressed: boolean;
  isShiftPressed: boolean;
}

function formatFileSize(size?: number | null) {
  if (size === undefined || size === null) {
    return "--";
  }
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getPrimaryPressed(event: MouseEvent<HTMLElement>) {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? event.metaKey : event.ctrlKey;
}

function buildVisibleFolderPaths(
  tree: AttachmentFolderNode[],
  expandedFolders: Set<string>,
): string[] {
  const result = [""];

  const visit = (nodes: AttachmentFolderNode[]) => {
    for (const node of nodes) {
      result.push(node.relative_path);
      if (expandedFolders.has(node.relative_path) && node.children.length > 0) {
        visit(node.children);
      }
    }
  };

  visit(tree);
  return result;
}

function AttachmentTreeNodeView({
  node,
  selectedFolder,
  selectedTreePaths,
  expandedFolders,
  dropTarget,
  onToggle,
  onSelectFolder,
  onOpenFolder,
  onDeleteItem,
  onDropItems,
  onSetDropTarget,
  onDragFolderStart,
  onDragEnd,
  onTreeItemClick,
  renamingPath,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  depth = 0,
}: {
  node: AttachmentFolderNode;
  selectedFolder: string;
  selectedTreePaths: Set<string>;
  expandedFolders: Set<string>;
  dropTarget: string | null;
  onToggle: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onDeleteItem: (node: AttachmentFolderNode) => void;
  onDropItems: (event: DragEvent<HTMLElement>, targetFolder: string) => Promise<void>;
  onSetDropTarget: (path: string | null) => void;
  onDragFolderStart: (path: string) => string[];
  onDragEnd: () => void;
  onTreeItemClick: (path: string, modifiers: TreeClickModifiers) => void;
  renamingPath: string | null;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRename: (node: AttachmentFolderNode) => void;
  onCommitRename: (node: AttachmentFolderNode) => void;
  onCancelRename: () => void;
  depth?: number;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedFolders.has(node.relative_path);
  const isSelected = selectedFolder === node.relative_path;
  const isTreeSelected = selectedTreePaths.has(node.relative_path);
  const isDropTarget = dropTarget === node.relative_path;
  const isRenaming = renamingPath === node.relative_path;

  return (
    <div>
      <div
        draggable
        className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
          isDropTarget
            ? "bg-blue-100 text-blue-600"
            : isTreeSelected || isSelected
              ? "bg-blue-50 text-blue-600"
              : "text-slate-700 hover:bg-slate-50"
        }`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={(event) => {
          onTreeItemClick(node.relative_path, {
            isPrimaryPressed: getPrimaryPressed(event),
            isShiftPressed: event.shiftKey,
          });
          onSelectFolder(node.relative_path);
        }}
        onDragStart={(event) => {
          const dragPaths = onDragFolderStart(node.relative_path);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.relative_path);
          event.dataTransfer.setData("application/json", JSON.stringify({ paths: dragPaths }));
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onSetDropTarget(node.relative_path);
        }}
        onDragLeave={() => onSetDropTarget(null)}
        onDrop={(event) => void onDropItems(event, node.relative_path)}
      >
        <button
          type="button"
          className="w-4 text-xs text-slate-400"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) {
              onToggle(node.relative_path);
            }
          }}
        >
          {hasChildren ? (isExpanded ? "▼" : "▶") : ""}
        </button>
        <span>📁</span>
        {isRenaming ? (
          <input
            type="text"
            value={renameDraft}
            onChange={(event) => onRenameDraftChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onBlur={() => onCommitRename(node)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCommitRename(node);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancelRename();
              }
            }}
            className="min-w-0 flex-1 rounded border border-blue-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none"
            autoFocus
          />
        ) : (
          <span className="truncate">{node.name}</span>
        )}
        <button
          type="button"
          className="p-1 text-slate-400 opacity-60 transition-all hover:bg-slate-100 hover:text-blue-500 hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onStartRename(node);
          }}
          title="重命名"
          aria-label="重命名"
        >
          <span aria-hidden="true">✎</span>
        </button>
        <button
          type="button"
          className="p-1 text-slate-400 opacity-60 transition-all hover:bg-slate-100 hover:text-red-500 hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onDeleteItem(node);
          }}
          title="删除"
          aria-label="删除"
        >
          <span aria-hidden="true">🗑</span>
        </button>
        <button
          type="button"
          className="ml-auto p-1 text-slate-400 opacity-60 transition-all hover:bg-slate-100 hover:text-blue-500 hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onOpenFolder(node.relative_path);
          }}
          title="在系统文件夹中打开"
          aria-label="在系统文件夹中打开"
        >
          <span aria-hidden="true">📂</span>
        </button>
      </div>
      {hasChildren && isExpanded ? (
        <div>
          {node.children.map((child) => (
            <AttachmentTreeNodeView
              key={child.relative_path}
              node={child}
              selectedFolder={selectedFolder}
              selectedTreePaths={selectedTreePaths}
              expandedFolders={expandedFolders}
              dropTarget={dropTarget}
              onToggle={onToggle}
              onSelectFolder={onSelectFolder}
              onOpenFolder={onOpenFolder}
              onDeleteItem={onDeleteItem}
              onDropItems={onDropItems}
              onSetDropTarget={onSetDropTarget}
              onDragFolderStart={onDragFolderStart}
              onDragEnd={onDragEnd}
              onTreeItemClick={onTreeItemClick}
              renamingPath={renamingPath}
              renameDraft={renameDraft}
              onRenameDraftChange={onRenameDraftChange}
              onStartRename={onStartRename}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AttachmentsWorkspace({
  tree,
  items,
  selectedFolder,
  attachmentsRootDir,
  onSelectFolder,
  onOpenItem,
  onImportFiles,
  onOpenFolder,
  onCreateFolder,
  onRenameItem,
  onDeleteItem,
  onMoveItems,
}: AttachmentsWorkspaceProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(tree.map((node) => node.relative_path)));
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [folderNameDraft, setFolderNameDraft] = useState("新建文件夹");
  const [renamingItem, setRenamingItem] = useState<AttachmentItem | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(null);
  const [selectedTreePaths, setSelectedTreePaths] = useState<Set<string>>(new Set([""]));
  const [treeSelectionAnchorPath, setTreeSelectionAnchorPath] = useState<string | null>("");
  const [draggedPaths, setDraggedPaths] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renamingTreePath, setRenamingTreePath] = useState<string | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<AttachmentItem | null>(null);

  const selectedFolderLabel = selectedFolder || "附件根目录";

  useEffect(() => {
    let cancelled = false;

    const loadPreviewUrls = async () => {
      const imageItems = items.filter((item) => item.item_type === "image");
      if (imageItems.length === 0) {
        setPreviewUrls({});
        return;
      }

      const nextEntries = await Promise.all(
        imageItems.map(async (item) => {
          try {
            const response = await readAttachmentThumbnail(item.relative_path);
            return [item.relative_path, response.success && response.data ? response.data : ""] as const;
          } catch (error) {
            console.error("[ATTACHMENTS] Failed to load thumbnail:", item.relative_path, error);
            return [item.relative_path, ""] as const;
          }
        }),
      );

      if (!cancelled) {
        setPreviewUrls(Object.fromEntries(nextEntries.filter((entry) => entry[1])));
      }
    };

    void loadPreviewUrls();

    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    setSelectedPaths((prev) => new Set(Array.from(prev).filter((path) => items.some((item) => item.relative_path === path))));
    setSelectionAnchorPath((prev) => (prev && items.some((item) => item.relative_path === prev) ? prev : null));
  }, [items]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget = Boolean(
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable),
      );
      if (isEditableTarget) {
        return;
      }

      const primaryPressed = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? event.metaKey : event.ctrlKey;
      if (!primaryPressed) {
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setFolderNameDraft("新建文件夹");
        setIsCreateFolderOpen(true);
        return;
      }

      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedPaths(new Set(items.map((item) => item.relative_path)));
        setSelectionAnchorPath(items[0]?.relative_path ?? null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [items]);

  const previewItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        previewUrl: item.item_type === "image" ? previewUrls[item.relative_path] ?? null : null,
      })),
    [items, previewUrls],
  );

  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    previewItems.forEach((item, index) => {
      map.set(item.relative_path, index);
    });
    return map;
  }, [previewItems]);

  const visibleFolderPaths = useMemo(
    () => buildVisibleFolderPaths(tree, expandedFolders),
    [tree, expandedFolders],
  );

  const visibleFolderIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleFolderPaths.forEach((path, index) => {
      map.set(path, index);
    });
    return map;
  }, [visibleFolderPaths]);

  const getEditableName = (item: AttachmentItem) => {
    if (item.item_type === "folder") {
      return item.name;
    }
    if (item.extension && item.name.endsWith(`.${item.extension}`)) {
      return item.name.slice(0, -(item.extension.length + 1));
    }
    return item.name;
  };

  const handleSingleSelection = useCallback((path: string) => {
    setSelectedPaths(new Set([path]));
    setSelectionAnchorPath(path);
  }, []);

  const handleRangeSelection = useCallback((path: string) => {
    const anchorPath = selectionAnchorPath ?? path;
    const anchorIndex = itemIndexMap.get(anchorPath);
    const targetIndex = itemIndexMap.get(path);
    if (anchorIndex === undefined || targetIndex === undefined) {
      handleSingleSelection(path);
      return;
    }
    const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    setSelectedPaths(new Set(previewItems.slice(start, end + 1).map((item) => item.relative_path)));
  }, [handleSingleSelection, itemIndexMap, previewItems, selectionAnchorPath]);

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
    setSelectionAnchorPath(path);
  }, []);

  const handleItemClick = useCallback((item: AttachmentItem, modifiers: TreeClickModifiers) => {
    if (modifiers.isShiftPressed) {
      handleRangeSelection(item.relative_path);
      return;
    }
    if (modifiers.isPrimaryPressed) {
      handleToggleSelection(item.relative_path);
      return;
    }
    handleSingleSelection(item.relative_path);
  }, [handleRangeSelection, handleSingleSelection, handleToggleSelection]);

  const handleDragSelectionStart = useCallback((path: string) => {
    const dragPaths = selectedPaths.has(path) ? Array.from(selectedPaths) : [path];
    if (!selectedPaths.has(path)) {
      handleSingleSelection(path);
    }
    setDraggedPaths(dragPaths);
    return dragPaths;
  }, [handleSingleSelection, selectedPaths]);

  const handleTreeSingleSelection = useCallback((path: string) => {
    setSelectedTreePaths(new Set([path]));
    setTreeSelectionAnchorPath(path);
  }, []);

  const handleTreeRangeSelection = useCallback((path: string) => {
    const anchorPath = treeSelectionAnchorPath ?? path;
    const anchorIndex = visibleFolderIndexMap.get(anchorPath);
    const targetIndex = visibleFolderIndexMap.get(path);
    if (anchorIndex === undefined || targetIndex === undefined) {
      handleTreeSingleSelection(path);
      return;
    }
    const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    setSelectedTreePaths(new Set(visibleFolderPaths.slice(start, end + 1)));
  }, [handleTreeSingleSelection, treeSelectionAnchorPath, visibleFolderIndexMap, visibleFolderPaths]);

  const handleTreeToggleSelection = useCallback((path: string) => {
    setSelectedTreePaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    setTreeSelectionAnchorPath(path);
  }, []);

  const handleTreeItemClick = useCallback((path: string, modifiers: TreeClickModifiers) => {
    if (modifiers.isShiftPressed) {
      handleTreeRangeSelection(path);
      return;
    }
    if (modifiers.isPrimaryPressed) {
      handleTreeToggleSelection(path);
      return;
    }
    handleTreeSingleSelection(path);
  }, [handleTreeRangeSelection, handleTreeSingleSelection, handleTreeToggleSelection]);

  const handleTreeFolderDragStart = useCallback((path: string) => {
    const dragPaths = selectedTreePaths.has(path) ? Array.from(selectedTreePaths) : [path];
    if (!selectedTreePaths.has(path)) {
      handleTreeSingleSelection(path);
    }
    setDraggedPaths(dragPaths);
    return dragPaths;
  }, [handleTreeSingleSelection, selectedTreePaths]);

  const getDraggedPaths = (event: DragEvent<HTMLElement>) => {
    const rawJson = event.dataTransfer.getData("application/json");
    if (rawJson) {
      try {
        const payload = JSON.parse(rawJson) as { paths?: string[] };
        if (Array.isArray(payload.paths)) {
          return payload.paths;
        }
      } catch (error) {
        console.error("[ATTACHMENTS] parse drag payload failed", error);
      }
    }
    const rawPath = event.dataTransfer.getData("text/plain");
    return rawPath ? [rawPath] : [];
  };

  const handleDropItems = useCallback(async (event: DragEvent<HTMLElement>, targetFolder: string) => {
    event.preventDefault();
    event.stopPropagation();
    const paths = getDraggedPaths(event);
    if (paths.length === 0) {
      setDropTarget(null);
      return;
    }
    await onMoveItems(paths, targetFolder);
    setDraggedPaths([]);
    setDropTarget(null);
    setSelectedPaths(new Set());
    setSelectionAnchorPath(null);
  }, [onMoveItems]);

  const commitTreeRename = useCallback(async (node: AttachmentFolderNode) => {
    const name = renameDraft.trim();
    if (!name) {
      setRenameDraft(node.name);
      setRenamingTreePath(null);
      return;
    }

    if (name === node.name) {
      setRenamingTreePath(null);
      return;
    }

    await onRenameItem({
      name: node.name,
      relative_path: node.relative_path,
      absolute_path: "",
      item_type: "folder",
      extension: null,
      size: null,
      modified_at: node.modified_at ?? null,
    }, name);
    setRenamingTreePath(null);
  }, [onRenameItem, renameDraft]);

  const confirmDeleteItem = useCallback(async () => {
    if (!pendingDeleteItem) {
      return;
    }

    await onDeleteItem(pendingDeleteItem);
    setPendingDeleteItem(null);
  }, [onDeleteItem, pendingDeleteItem]);

  return (
    <>
      <div className="w-[260px] bg-white border-r border-slate-200 flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-slate-200">
          <div>
            <div className="text-sm font-medium text-slate-700">附件目录</div>
            <div className="text-xs text-slate-400 mt-1">支持多选、拖拽移动和导入管理</div>
          </div>
        </div>
        <div
          className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
            dropTarget === ""
              ? "bg-blue-100 text-blue-600"
              : selectedFolder === ""
                ? "bg-blue-50 text-blue-600"
                : "text-slate-700 hover:bg-slate-50"
          }`}
          onClick={(event) => {
            handleTreeItemClick("", {
              isPrimaryPressed: getPrimaryPressed(event),
              isShiftPressed: event.shiftKey,
            });
            onSelectFolder("");
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTarget("");
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(event) => void handleDropItems(event, "")}
        >
          <span>🗂️</span>
          <span>附件根目录</span>
          <button
            type="button"
            className="ml-auto p-1 text-slate-400 opacity-45 transition-opacity hover:text-blue-500 hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              void onOpenFolder("");
            }}
            title="在系统文件夹中打开"
            aria-label="在系统文件夹中打开"
          >
            <span aria-hidden="true">📂</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tree.map((node) => (
            <AttachmentTreeNodeView
              key={node.relative_path}
              node={node}
              selectedFolder={selectedFolder}
              selectedTreePaths={selectedTreePaths}
              expandedFolders={expandedFolders}
              dropTarget={dropTarget}
              onToggle={(path) =>
                setExpandedFolders((prev) => {
                  const next = new Set(prev);
                  if (next.has(path)) next.delete(path);
                  else next.add(path);
                  return next;
                })
              }
              onSelectFolder={onSelectFolder}
              onOpenFolder={onOpenFolder}
              onDeleteItem={(node) => {
                setPendingDeleteItem({
                  name: node.name,
                  relative_path: node.relative_path,
                  absolute_path: "",
                  item_type: "folder",
                  extension: null,
                  size: null,
                  modified_at: node.modified_at ?? null,
                });
              }}
              onDropItems={handleDropItems}
              onSetDropTarget={setDropTarget}
              onDragFolderStart={handleTreeFolderDragStart}
              onDragEnd={() => {
                setDraggedPaths([]);
                setDropTarget(null);
              }}
              onTreeItemClick={handleTreeItemClick}
              renamingPath={renamingTreePath}
              renameDraft={renameDraft}
              onRenameDraftChange={setRenameDraft}
              onStartRename={(node) => {
                setRenamingTreePath(node.relative_path);
                setRenameDraft(node.name);
              }}
              onCommitRename={(node) => {
                void commitTreeRename(node);
              }}
              onCancelRename={() => {
                setRenamingTreePath(null);
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-[500px] flex flex-col bg-white">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
          <div>
            <div className="text-sm font-medium text-slate-700">{selectedFolderLabel}</div>
            <div className="text-xs text-slate-400 mt-1 truncate" title={attachmentsRootDir}>
              {items.length} 个项目 · {attachmentsRootDir || "未设置附件目录"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setFolderNameDraft("新建文件夹");
                setIsCreateFolderOpen(true);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            >
              新建文件夹
            </button>
            <button
              type="button"
              onClick={() => void onImportFiles()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            >
              导入文件
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${viewMode === "grid" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}
            >
              缩略图
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${viewMode === "list" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}
            >
              列表
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
          Cmd/Ctrl+点选多选，Shift+点选连选，Cmd/Ctrl+A 全选，拖到左侧文件夹或当前列表中的文件夹即可移动
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
          {previewItems.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              当前文件夹为空
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-4 gap-4">
              {previewItems.map((item) => {
                const isSelected = selectedPaths.has(item.relative_path);
                const isDropTarget = dropTarget === item.relative_path && item.item_type === "folder";

                return (
                  <div
                    key={item.relative_path}
                    draggable
                    onDragStart={(event) => {
                      const dragPaths = handleDragSelectionStart(item.relative_path);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.relative_path);
                      event.dataTransfer.setData("application/json", JSON.stringify({ paths: dragPaths }));
                    }}
                    onDragEnd={() => {
                      setDraggedPaths([]);
                      setDropTarget(null);
                    }}
                    onDragOver={(event) => {
                      if (item.item_type !== "folder") return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget(item.relative_path);
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(event) => {
                      if (item.item_type !== "folder") return;
                      void handleDropItems(event, item.relative_path);
                    }}
                    className={`overflow-hidden rounded-xl border bg-white text-left shadow-sm transition ${
                      isDropTarget
                        ? "border-blue-400 ring-2 ring-blue-200"
                        : isSelected
                          ? "border-blue-400 ring-2 ring-blue-100"
                          : "border-slate-200 hover:border-blue-300 hover:shadow"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        handleItemClick(item, {
                          isPrimaryPressed: getPrimaryPressed(event),
                          isShiftPressed: event.shiftKey,
                        });
                      }}
                      onDoubleClick={() => {
                        if (item.item_type === "folder") {
                          onSelectFolder(item.relative_path);
                        } else {
                          void onOpenItem(item.relative_path);
                        }
                      }}
                      className="block w-full text-left"
                    >
                      <div className="flex h-36 items-center justify-center bg-slate-100">
                        {item.item_type === "image" && item.previewUrl ? (
                          <img src={item.previewUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : item.item_type === "folder" ? (
                          <span className="text-4xl">📁</span>
                        ) : (
                          <span className="text-4xl">📄</span>
                        )}
                      </div>
                    </button>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate text-sm font-medium text-slate-800">{item.name}</div>
                        <div className="flex shrink-0 items-center gap-1">
                          {item.item_type === "folder" ? (
                            <button
                              type="button"
                              title="在系统文件夹中打开"
                              className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                              onClick={() => void onOpenFolder(item.relative_path)}
                            >
                              📂
                            </button>
                          ) : null}
                          <button
                            type="button"
                            title="重命名"
                            className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                            onClick={() => {
                              setRenamingItem(item);
                              setRenameDraft(getEditableName(item));
                            }}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            title="删除"
                            className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-red-500"
                            onClick={() => setPendingDeleteItem(item)}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {item.item_type === "image" ? "图片" : item.item_type === "folder" ? "文件夹" : item.extension || "文件"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="grid grid-cols-[1.8fr_0.8fr_0.8fr_1fr_1.2fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-400">
                <span>名称</span>
                <span>类型</span>
                <span>大小</span>
                <span>修改时间</span>
                <span className="text-right">操作</span>
              </div>
              {previewItems.map((item) => {
                const isSelected = selectedPaths.has(item.relative_path);
                const isDropTarget = dropTarget === item.relative_path && item.item_type === "folder";

                return (
                  <div
                    key={item.relative_path}
                    draggable
                    onDragStart={(event) => {
                      const dragPaths = handleDragSelectionStart(item.relative_path);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.relative_path);
                      event.dataTransfer.setData("application/json", JSON.stringify({ paths: dragPaths }));
                    }}
                    onDragEnd={() => {
                      setDraggedPaths([]);
                      setDropTarget(null);
                    }}
                    onDragOver={(event) => {
                      if (item.item_type !== "folder") return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget(item.relative_path);
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(event) => {
                      if (item.item_type !== "folder") return;
                      void handleDropItems(event, item.relative_path);
                    }}
                    className={`grid w-full grid-cols-[1.8fr_0.8fr_0.8fr_1fr_1.2fr] gap-3 border-b border-slate-100 px-4 py-3 text-left text-sm transition-colors ${
                      isDropTarget
                        ? "bg-blue-100"
                        : isSelected
                          ? "bg-blue-50"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <div
                      onClick={(event) =>
                        handleItemClick(item, {
                          isPrimaryPressed: getPrimaryPressed(event),
                          isShiftPressed: event.shiftKey,
                        })
                      }
                      onDoubleClick={() => {
                        if (item.item_type === "folder") {
                          onSelectFolder(item.relative_path);
                        } else {
                          void onOpenItem(item.relative_path);
                        }
                      }}
                      className="contents cursor-pointer"
                    >
                      <span className="truncate text-slate-700">
                        {item.item_type === "folder" ? "📁 " : item.item_type === "image" ? "🖼️ " : "📄 "}
                        {item.name}
                      </span>
                      <span className="text-slate-500">{item.item_type === "image" ? "图片" : item.item_type === "folder" ? "文件夹" : item.extension || "文件"}</span>
                      <span className="text-slate-500">{formatFileSize(item.size)}</span>
                      <span className="text-slate-500">{formatDateTime(item.modified_at)}</span>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {item.item_type === "folder" ? (
                        <button
                          type="button"
                          title="在系统文件夹中打开"
                          className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                          onClick={() => void onOpenFolder(item.relative_path)}
                        >
                          打开目录
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title="重命名"
                        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                        onClick={() => {
                          setRenamingItem(item);
                          setRenameDraft(getEditableName(item));
                        }}
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        title="删除"
                        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-red-500"
                        onClick={() => setPendingDeleteItem(item)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {draggedPaths.length > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">
          <span className="text-slate-300">移动{draggedPaths.length > 1 ? `${draggedPaths.length}个项目到` : "到"}：</span>
          <span className="ml-1 font-medium text-blue-300">{dropTarget === null ? "选择目标文件夹" : dropTarget || "附件根目录"}</span>
        </div>
      ) : null}

      {isCreateFolderOpen ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/25">
          <div className="w-[360px] rounded-xl bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-800">新建附件文件夹</div>
            <input
              autoFocus
              value={folderNameDraft}
              onChange={(event) => setFolderNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const name = folderNameDraft.trim();
                  if (!name) return;
                  void onCreateFolder(name).then(() => {
                    setIsCreateFolderOpen(false);
                  });
                }
                if (event.key === "Escape") {
                  setIsCreateFolderOpen(false);
                }
              }}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
              placeholder="请输入文件夹名称"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateFolderOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const name = folderNameDraft.trim();
                  if (!name) return;
                  void onCreateFolder(name).then(() => {
                    setIsCreateFolderOpen(false);
                  });
                }}
                className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renamingItem ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/25">
          <div className="w-[360px] rounded-xl bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-800">重命名附件</div>
            <input
              autoFocus
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const name = renameDraft.trim();
                  if (!name) return;
                  void onRenameItem(renamingItem, name).then(() => {
                    setRenamingItem(null);
                    setRenameDraft("");
                  });
                }
                if (event.key === "Escape") {
                  setRenamingItem(null);
                  setRenameDraft("");
                }
              }}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300"
              placeholder="请输入新名称"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRenamingItem(null);
                  setRenameDraft("");
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const name = renameDraft.trim();
                  if (!name) return;
                  void onRenameItem(renamingItem, name).then(() => {
                    setRenamingItem(null);
                    setRenameDraft("");
                  });
                }}
                className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteItem ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/25">
          <div className="w-[380px] rounded-xl bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-800">确认删除附件</div>
            <div className="mt-3 text-sm text-slate-600">
              确定删除“{pendingDeleteItem.name}”吗？
            </div>
            <div className="mt-1 text-xs text-slate-400">
              删除后会进入系统回收站。
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteItem(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmDeleteItem();
                }}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default AttachmentsWorkspace;
