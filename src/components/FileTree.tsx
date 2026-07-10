import React, { useState, useRef } from 'react';
import { FileTreeNode } from '../types';

interface FileTreeProps {
  tree: FileTreeNode[];
  activeFolder: string | null;
  onFolderClick: (folder: string) => void;
  onOpenFile: (relativePath: string) => void;
  selectedRelativePath: string | null;
  depth?: number;
  expandedFolders: Set<string>;
  onToggleFolder: (relativePath: string) => void;
  onMoveFile: (sourcePath: string, targetFolder: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onRenameFolder: (oldPath: string, newName: string) => void;
  draggedPath: string | null;
  setDraggedPath: (path: string | null) => void;
  dropTarget: string | null;
  setDropTarget: (path: string | null) => void;
}

const FileTree: React.FC<FileTreeProps> = ({ 
  tree, 
  activeFolder, 
  onFolderClick, 
  onOpenFile, 
  selectedRelativePath, 
  depth = 0, 
  expandedFolders, 
  onToggleFolder, 
  onMoveFile, 
  onDeleteFolder,
  onRenameFolder,
  draggedPath,
  setDraggedPath,
  dropTarget,
  setDropTarget,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<{ path: string; name: string } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const dragCounterRef = useRef(0);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isNoteSelected = (node: FileTreeNode) => {
    if (node.node_type !== 'note' || !selectedRelativePath) return false;
    return selectedRelativePath === node.relative_path;
  };

  const handleDragStart = (e: React.DragEvent, path: string, nodeType: string) => {
    console.log('[DRAG] handleDragStart', path, 'type:', nodeType);
    setDraggedPath(path);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.setData('application/json', JSON.stringify({ path, type: nodeType }));
  };

  const handleDragOver = (e: React.DragEvent, path: string, isFolder: boolean) => {
    if (!isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    console.log('[DRAG] handleDragOver', path);
    setDropTarget(path);
  };

  const handleDragEnter = (e: React.DragEvent, path: string, isFolder: boolean) => {
    if (!isFolder) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    console.log('[DRAG] handleDragEnter', path, 'counter:', dragCounterRef.current);
    setDropTarget(path);
  };

  const handleDragLeave = (e: React.DragEvent, path: string, isFolder: boolean) => {
    if (!isFolder) return;
    e.preventDefault();
    dragCounterRef.current -= 1;
    console.log('[DRAG] handleDragLeave', path, 'counter:', dragCounterRef.current);
    if (dragCounterRef.current === 0) {
      setDropTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetPath: string, isFolder: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[DRAG] handleDrop', targetPath, 'isFolder:', isFolder);
    if (!isFolder) return;
    
    const sourcePath = e.dataTransfer.getData('text/plain');
    console.log('[DRAG] handleDrop sourcePath:', sourcePath);
    
    if (sourcePath && targetPath !== sourcePath) {
      console.log('[DRAG] calling onMoveFile:', sourcePath, '->', targetPath);
      onMoveFile(sourcePath, targetPath);
    }
    setDraggedPath(null);
    setDropTarget(null);
    dragCounterRef.current = 0;
  };

  const handleDragEnd = () => {
    console.log('[DRAG] handleDragEnd');
    setDraggedPath(null);
    setDropTarget(null);
    dragCounterRef.current = 0;
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    console.log('[DRAG] handleRootDrop');
    const sourcePath = e.dataTransfer.getData('text/plain');
    console.log('[DRAG] handleRootDrop sourcePath:', sourcePath);
    
    if (sourcePath) {
      console.log('[DRAG] calling onMoveFile to root:', sourcePath, '->', '(root)');
      onMoveFile(sourcePath, '');
    }
    setDraggedPath(null);
    setDropTarget(null);
    dragCounterRef.current = 0;
  };

  const handleDoubleClick = (node: FileTreeNode) => {
    if (node.node_type === 'folder') {
      setRenamingPath(node.relative_path);
      setRenamingName(node.name);
    }
  };

  const handleRenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRenamingName(e.target.value);
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
    const isFolder = node.node_type === 'folder';
    const isExpanded = expandedFolders.has(node.relative_path);
    const isActive = activeFolder === node.relative_path;
    const isSelected = isNoteSelected(node);
    const isDragging = draggedPath === node.relative_path;
    const isDropTargetNode = dropTarget === node.relative_path;
    const isRenaming = renamingPath === node.relative_path;

    return (
      <div key={node.relative_path}>
        <div
          onClick={() => {
            if (isFolder && !isRenaming) {
              onToggleFolder(node.relative_path);
              onFolderClick(node.relative_path);
            } else if (!isRenaming) {
              onOpenFile(node.relative_path);
            }
          }}
          onDoubleClick={() => handleDoubleClick(node)}
          draggable={true}
          onDragStart={(e) => handleDragStart(e, node.relative_path, node.node_type)}
          onDragOver={(e) => handleDragOver(e, node.relative_path, isFolder)}
          onDragEnter={(e) => handleDragEnter(e, node.relative_path, isFolder)}
          onDragLeave={(e) => handleDragLeave(e, node.relative_path, isFolder)}
          onDrop={(e) => handleDrop(e, node.relative_path, isFolder)}
          onDragEnd={handleDragEnd}
          className={`relative flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer transition-colors hover:bg-slate-100 ${
            isDragging ? 'opacity-50' :
            isDropTargetNode ? 'bg-blue-100 border-l-2 border-blue-500' :
            isSelected ? 'bg-blue-50 text-blue-600 font-medium' :
            isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-700'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {isFolder ? (
            <>
              <span className="text-slate-400 text-xs">
                {isExpanded ? '▼' : '▶'}
              </span>
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
              ref={renameInputRef}
              type="text"
              value={renamingName}
              onChange={handleRenameChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameConfirm();
                } else if (e.key === 'Escape') {
                  handleRenameCancel();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="absolute left-10 right-0 px-1 py-0.5 text-sm border border-blue-400 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 z-10"
              autoFocus
            />
          ) : (
            <span className="truncate flex-1">{node.name}</span>
          )}
          {isFolder && !isRenaming && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFolderToDelete({ path: node.relative_path, name: node.name });
                setShowDeleteConfirm(true);
              }}
              className="opacity-0 hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity"
              title="删除文件夹"
            >
              ✕
            </button>
          )}
        </div>
        {isFolder && isExpanded && node.children && node.children.length > 0 && (
          <FileTree
            tree={node.children}
            activeFolder={activeFolder}
            onFolderClick={onFolderClick}
            onOpenFile={onOpenFile}
            selectedRelativePath={selectedRelativePath}
            depth={depth + 1}
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
    );
  };

  const handleDeleteConfirm = () => {
    if (folderToDelete) {
      onDeleteFolder(folderToDelete.path);
    }
    setShowDeleteConfirm(false);
    setFolderToDelete(null);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setFolderToDelete(null);
  };

  if (depth > 0) {
    return (
      <div>
        {tree.map(renderNode)}
      </div>
    );
  }

  return (
    <div 
      className="overflow-y-auto"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget('');
      }}
      onDrop={handleRootDrop}
    >
      <div
        onClick={() => onFolderClick('')}
        className={`flex items-center gap-2 px-2 py-2 text-sm cursor-pointer transition-colors min-h-[40px] ${
          dropTarget === '' ? 'bg-blue-50 border border-blue-300 rounded-lg' :
          activeFolder === '' ? 'bg-blue-50 text-blue-600' :
          'hover:bg-slate-50'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropTarget('');
        }}
        onDrop={handleRootDrop}
      >
        <span className="text-lg">📂</span>
        <span className={activeFolder === '' ? 'text-blue-600 font-medium' : 'text-slate-600'}>根目录</span>
        {draggedPath && dropTarget === '' && (
          <span className="text-xs text-blue-500 ml-auto">↓ 放置到这里</span>
        )}
      </div>

      <div className="border-t border-slate-100 my-1"></div>

      {tree.map(renderNode)}
      
      {showDeleteConfirm && folderToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 w-[280px]">
            <h3 className="text-sm font-medium text-slate-800 mb-3">删除文件夹</h3>
            <p className="text-sm text-slate-600 mb-4">
              确定要删除文件夹 "{folderToDelete.name}" 吗？删除后无法恢复。
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteCancel}
                className="flex-1 px-3 py-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDeleteConfirm}
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
};

export default FileTree;
