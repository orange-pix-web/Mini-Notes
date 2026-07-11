import React, { useRef, useState } from "react";
import type { FileTreeNode, FileTreeVisibleItem } from "@/types";

interface TreeClickModifiers {
  isPrimaryPressed: boolean;
  isShiftPressed: boolean;
}

interface FileTreeProps {
  tree: FileTreeNode[];
  activeFolder: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (relativePath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onRenameFolder: (oldPath: string, newName: string) => void;
  onOpenFolder: (relativePath: string) => void;
  onDeleteNote: (relativePath: string) => void;
  selectedPaths: Set<string>;
  focusedPath: string | null;
  draggedPaths: string[];
  dropTarget: string | null;
  onItemClick: (item: FileTreeVisibleItem, modifiers: TreeClickModifiers) => void;
  onDragSelectionStart: (path: string) => string[];
  onDragEnd: () => void;
  onDropPaths: (paths: string[], targetFolder: string) => Promise<void>;
  onSetDropTarget: (path: string | null) => void;
  depth?: number;
  parentPath?: string | null;
}

const ROOT_PATH = "";

function FileTree({
  tree,
  activeFolder,
  expandedFolders,
  onToggleFolder,
  onDeleteFolder,
  onRenameFolder,
  onOpenFolder,
  onDeleteNote,
  selectedPaths,
  focusedPath,
  draggedPaths,
  dropTarget,
  onItemClick,
  onDragSelectionStart,
  onDragEnd,
  onDropPaths,
  onSetDropTarget,
  depth = 0,
  parentPath = null,
}: FileTreeProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ path: string; name: string; type: "folder" | "note" } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const dragCounterRef = useRef(0);

  const getModifiers = (event: React.MouseEvent): TreeClickModifiers => ({
    isPrimaryPressed: navigator.platform.includes("Mac") ? event.metaKey : event.ctrlKey,
    isShiftPressed: event.shiftKey,
  });

  const handleDragStart = (event: React.DragEvent, path: string) => {
    const dragPaths = onDragSelectionStart(path);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", path);
    event.dataTransfer.setData("application/json", JSON.stringify({ paths: dragPaths }));
  };

  const handleDragOver = (event: React.DragEvent, path: string, isFolder: boolean) => {
    if (!isFolder) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    onSetDropTarget(path);
  };

  const handleDragEnter = (event: React.DragEvent, path: string, isFolder: boolean) => {
    if (!isFolder) return;
    event.preventDefault();
    dragCounterRef.current += 1;
    onSetDropTarget(path);
  };

  const handleDragLeave = (event: React.DragEvent, isFolder: boolean) => {
    if (!isFolder) return;
    event.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      onSetDropTarget(null);
      dragCounterRef.current = 0;
    }
  };

  const getDraggedPaths = (event: React.DragEvent) => {
    const rawJson = event.dataTransfer.getData("application/json");
    if (rawJson) {
      try {
        const payload = JSON.parse(rawJson) as { paths?: string[] };
        if (Array.isArray(payload.paths)) {
          return payload.paths;
        }
      } catch (error) {
        console.error("[DRAG] parse drag payload failed", error);
      }
    }

    const rawPath = event.dataTransfer.getData("text/plain");
    return rawPath ? [rawPath] : [];
  };

  const handleDrop = async (event: React.DragEvent, targetPath: string, isFolder: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isFolder) return;

    const paths = getDraggedPaths(event);
    await onDropPaths(paths, targetPath);
    dragCounterRef.current = 0;
  };

  const handleRootDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    const paths = getDraggedPaths(event);
    await onDropPaths(paths, ROOT_PATH);
    dragCounterRef.current = 0;
  };

  const handleRenameConfirm = () => {
    if (renamingPath && renamingName.trim()) {
      onRenameFolder(renamingPath, renamingName.trim());
    }
    setRenamingPath(null);
    setRenamingName("");
  };

  const handleRenameCancel = () => {
    setRenamingPath(null);
    setRenamingName("");
  };

  const renderNode = (node: FileTreeNode) => {
    const isFolder = node.node_type === "folder";
    const isExpanded = expandedFolders.has(node.relative_path);
    const isSelected = selectedPaths.has(node.relative_path);
    const isFocused = focusedPath === node.relative_path;
    const isActiveFolder = activeFolder === node.relative_path;
    const isDragging = draggedPaths.includes(node.relative_path);
    const isDropTargetNode = dropTarget === node.relative_path;
    const isRenaming = renamingPath === node.relative_path;
    const item: FileTreeVisibleItem = {
      path: node.relative_path,
      name: node.name,
      type: isFolder ? "folder" : "note",
      depth,
      parentPath,
      isExpanded,
    };

    return (
      <div key={node.relative_path}>
        <div
          onClick={(event) => onItemClick(item, getModifiers(event))}
          onDoubleClick={() => {
            if (isFolder) {
              setRenamingPath(node.relative_path);
              setRenamingName(node.name);
            }
          }}
          draggable={!isRenaming}
          onDragStart={(event) => handleDragStart(event, node.relative_path)}
          onDragOver={(event) => handleDragOver(event, node.relative_path, isFolder)}
          onDragEnter={(event) => handleDragEnter(event, node.relative_path, isFolder)}
          onDragLeave={(event) => handleDragLeave(event, isFolder)}
          onDrop={(event) => void handleDrop(event, node.relative_path, isFolder)}
          onDragEnd={onDragEnd}
          className={`group relative flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer transition-colors ${
            isDragging ? "opacity-50" :
            isDropTargetNode ? "bg-blue-100 border-l-2 border-blue-500" :
            isSelected ? "bg-blue-50 text-blue-600 font-medium" :
            isActiveFolder ? "bg-blue-50 text-blue-600" :
            "text-slate-700 hover:bg-slate-100"
          } ${isFocused ? "ring-1 ring-blue-300 ring-inset" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {isFolder ? (
            <>
              <button
                type="button"
                className="text-slate-400 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFolder(node.relative_path);
                }}
              >
                {isExpanded ? "▼" : "▶"}
              </button>
              <span className="text-lg">📁</span>
            </>
          ) : (
            <>
              <span className="w-3" />
              <span className="text-lg">📄</span>
            </>
          )}

          {isRenaming ? (
            <input
              type="text"
              value={renamingName}
              onChange={(event) => setRenamingName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleRenameConfirm();
                } else if (event.key === "Escape") {
                  handleRenameCancel();
                }
              }}
              onClick={(event) => event.stopPropagation()}
              className="absolute left-10 right-0 px-1 py-0.5 text-sm border border-blue-400 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 z-10"
              autoFocus
            />
          ) : (
            <span className="truncate flex-1">{node.name}</span>
          )}

          {isFolder && !isRenaming && (
            <>
              <button
                type="button"
                draggable={false}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenFolder(node.relative_path);
                }}
                className="opacity-45 p-1 text-slate-400 hover:text-blue-500 hover:opacity-100 transition-opacity"
                title="在系统文件夹中打开"
                aria-label="在系统文件夹中打开"
              >
                <span aria-hidden="true">📂</span>
              </button>
            </>
          )}
          {!isRenaming && item.type !== "root" && (
            <button
              type="button"
              draggable={false}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setItemToDelete({
                  path: node.relative_path,
                  name: node.name,
                  type: isFolder ? "folder" : "note",
                });
                setShowDeleteConfirm(true);
              }}
              className="opacity-45 p-1 text-slate-400 hover:text-red-500 hover:opacity-100 transition-opacity"
              title={isFolder ? "删除这个文件夹" : "删除这个文档"}
              aria-label={isFolder ? "删除这个文件夹" : "删除这个文档"}
            >
              <span aria-hidden="true">🗑</span>
            </button>
          )}
        </div>

        {isFolder && isExpanded && node.children.length > 0 && (
          <FileTree
            tree={node.children}
            activeFolder={activeFolder}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
            onDeleteFolder={onDeleteFolder}
            onRenameFolder={onRenameFolder}
            onOpenFolder={onOpenFolder}
            onDeleteNote={onDeleteNote}
            selectedPaths={selectedPaths}
            focusedPath={focusedPath}
            draggedPaths={draggedPaths}
            dropTarget={dropTarget}
            onItemClick={onItemClick}
            onDragSelectionStart={onDragSelectionStart}
            onDragEnd={onDragEnd}
            onDropPaths={onDropPaths}
            onSetDropTarget={onSetDropTarget}
            depth={depth + 1}
            parentPath={node.relative_path}
          />
        )}
      </div>
    );
  };

  if (depth > 0) {
    return <div>{tree.map(renderNode)}</div>;
  }

  const isRootSelected = selectedPaths.has(ROOT_PATH);
  const isRootFocused = focusedPath === ROOT_PATH;

  return (
    <div
      className="overflow-y-auto"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onSetDropTarget(ROOT_PATH);
      }}
      onDrop={(event) => void handleRootDrop(event)}
    >
      <div
        onClick={(event) =>
          onItemClick(
            { path: ROOT_PATH, name: "根目录", type: "root", depth: 0, parentPath: null, isExpanded: true },
            getModifiers(event),
          )
        }
        className={`group flex items-center gap-2 px-2 py-2 text-sm cursor-pointer transition-colors min-h-[40px] ${
          dropTarget === ROOT_PATH ? "bg-blue-50 border border-blue-300 rounded-lg" :
          isRootSelected ? "bg-blue-50 text-blue-600 font-medium" :
          "hover:bg-slate-50"
        } ${isRootFocused ? "ring-1 ring-blue-300 ring-inset" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onSetDropTarget(ROOT_PATH);
        }}
        onDrop={(event) => void handleRootDrop(event)}
      >
        <span className="text-lg">📂</span>
        <span className={isRootSelected ? "text-blue-600 font-medium" : "text-slate-600"}>根目录</span>
        <button
          type="button"
          draggable={false}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpenFolder(ROOT_PATH);
          }}
          className="opacity-45 p-1 text-slate-400 hover:text-blue-500 hover:opacity-100 transition-opacity ml-auto"
          title="在系统文件夹中打开"
          aria-label="在系统文件夹中打开"
        >
          <span aria-hidden="true">📂</span>
        </button>
        {draggedPaths.length > 0 && dropTarget === ROOT_PATH && (
          <span className="text-xs text-blue-500">↓ 放置到这里</span>
        )}
      </div>

      <div className="border-t border-slate-100 my-1"></div>

      {tree.map(renderNode)}

      {showDeleteConfirm && itemToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 w-[280px]">
            <h3 className="text-sm font-medium text-slate-800 mb-3">
              {itemToDelete.type === "folder" ? "删除文件夹" : "删除文档"}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              确定要删除{itemToDelete.type === "folder" ? "文件夹" : "文档"} "{itemToDelete.name}" 吗？删除后无法恢复。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setItemToDelete(null);
                }}
                className="flex-1 px-3 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (itemToDelete) {
                    if (itemToDelete.type === "folder") {
                      onDeleteFolder(itemToDelete.path);
                    } else {
                      onDeleteNote(itemToDelete.path);
                    }
                  }
                  setShowDeleteConfirm(false);
                  setItemToDelete(null);
                }}
                className="flex-1 px-3 py-1.5 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileTree;
