import React, { useState } from 'react';
import { FileTreeNode, Note } from '../types';

interface FileTreeProps {
  tree: FileTreeNode[];
  activeFolder: string | null;
  onFolderClick: (folder: string) => void;
  onNoteClick: (relativePath: string) => void;
  selectedNote: Note | null;
  depth?: number;
}

const FileTree: React.FC<FileTreeProps> = ({ tree, activeFolder, onFolderClick, onNoteClick, selectedNote, depth = 0 }) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['Notes/Inbox']));

  const toggleFolder = (relativePath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }
      return next;
    });
  };

  const isNoteSelected = (node: FileTreeNode) => {
    if (node.node_type !== 'note' || !selectedNote) return false;
    return selectedNote.relative_path === node.relative_path;
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
            if (isFolder) {
              toggleFolder(node.relative_path);
              onFolderClick(node.relative_path);
            } else {
              onNoteClick(node.relative_path);
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
            onNoteClick={onNoteClick}
            selectedNote={selectedNote}
            depth={depth + 1}
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