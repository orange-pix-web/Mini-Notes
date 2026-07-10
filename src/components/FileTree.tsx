import React from 'react';
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
}

const FileTree: React.FC<FileTreeProps> = ({ tree, activeFolder, onFolderClick, onOpenFile, selectedRelativePath, depth = 0, expandedFolders, onToggleFolder }) => {
  console.log('[FILETREE] rendering tree, depth:', depth, 'nodes:', tree.length);

  const isNoteSelected = (node: FileTreeNode) => {
    if (node.node_type !== 'note' || !selectedRelativePath) return false;
    return selectedRelativePath === node.relative_path;
  };

  const renderNode = (node: FileTreeNode) => {
    const isFolder = node.node_type === 'folder';
    const isExpanded = expandedFolders.has(node.relative_path);
    const isActive = activeFolder === node.relative_path;
    const isSelected = isNoteSelected(node);

    return (
      <div key={node.relative_path}>
        <div
          onClick={() => {
            console.log('[FILETREE] onClick', node.relative_path, node.node_type);
            if (isFolder) {
              onToggleFolder(node.relative_path);
              onFolderClick(node.relative_path);
            } else {
              console.log('[FILETREE] calling onOpenFile', node.relative_path);
              onOpenFile(node.relative_path);
            }
          }}
          className={`flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer transition-colors hover:bg-slate-100 ${
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
          <span className="truncate">{node.name}</span>
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
          />
        )}
      </div>
    );
  };

  return (
    <div className="overflow-y-auto">
      {tree.map(renderNode)}
    </div>
  );
};

export default FileTree;