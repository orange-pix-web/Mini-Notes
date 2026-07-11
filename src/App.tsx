import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import NoteList from "@/components/NoteList";
import Editor from "@/components/Editor";
import { initApp, listNotes, createNote, createFolder, getWorkspaceInfo, setNotesRootDir, getFileTree, readFileNote, writeFileNote, renameFileNote, deleteFileNote, moveFile, deleteFolder, renameFolder, openFolder } from "@/api";
import type { Note, NavItem, FileTreeNode, FileNotePayload } from "@/types";
import { open } from "@tauri-apps/plugin-dialog";

console.log("[APP] App component loaded");
console.log("[APP] readFileNote function:", typeof readFileNote);

window.addEventListener('error', (e) => {
  console.error('[APP] Global error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[APP] Unhandled rejection:', e.reason);
});

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNotePayload | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem>("all");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState(true);
  const [notesRootDir, setNotesRootDirState] = useState("");
  const [createStatus, setCreateStatus] = useState<{
    state: "idle" | "creating" | "success" | "failed";
    message: string;
  }>({ state: "idle", message: "" });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("新建文件夹");

  const getDbFolderName = (fileTreePath: string): string => {
    if (fileTreePath.startsWith("Notes/")) {
      return fileTreePath.slice(6);
    }
    return fileTreePath;
  };

  const loadNotes = useCallback(async (filter?: string, folder?: string) => {
    const currentFilter = filter || activeNav;
    let currentFolder = folder ?? activeFolder ?? undefined;
    if (currentFolder !== undefined) {
      currentFolder = getDbFolderName(currentFolder);
    }
    setIsLoading(true);
    console.log("[APP] loadNotes started, filter:", currentFilter, "folder:", currentFolder);
    try {
      const response = await listNotes(currentFilter, currentFolder);
      console.log("[APP] listNotes response:", response);
      if (response.success && response.data) {
        setNotes(response.data);
        console.log("[APP] notes loaded, count:", response.data.length);
      } else {
        console.log("[APP] listNotes failed or no data");
      }
    } catch (error) {
      console.error("[APP] Failed to load notes:", error);
    } finally {
      setIsLoading(false);
      console.log("[APP] loadNotes finished, isLoading set to false");
    }
  }, [activeNav, activeFolder]);

  const loadFileTree = useCallback(async () => {
    setIsFileTreeLoading(true);
    try {
      const response = await getFileTree();
      console.log("[APP] getFileTree response", response);
      if (response.success && response.data) {
        console.log("[APP] fileTree loaded, count:", response.data.length);
        console.log("[APP] fileTree data:", JSON.stringify(response.data));
        setFileTree(response.data);
      } else {
        console.log("[APP] getFileTree failed or no data", response);
      }
    } catch (error) {
      console.error("Failed to load file tree:", error);
    } finally {
      setIsFileTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initApp();
        const workspaceResponse = await getWorkspaceInfo();
        if (workspaceResponse.success && workspaceResponse.data) {
          setNotesRootDirState(workspaceResponse.data.notes_root_dir);
        }
        await loadNotes();
        await loadFileTree();
      } catch (error) {
        console.error("Initialization failed:", error);
      }
    };
    initialize();
  }, [loadNotes, loadFileTree]);

  useEffect(() => {
    console.log("[APP] fileTree state changed:", fileTree.length, "nodes");
  }, [fileTree]);

  useEffect(() => {
    loadNotes();
  }, [activeNav, activeFolder, loadNotes]);

  const handleOpenFile = useCallback(async (relativePath: string) => {
    console.log("[APP] handleOpenFile START", relativePath);
    try {
      const response = await readFileNote(relativePath);
      console.log("[APP] readFileNote response", response);
      if (response.success && response.data) {
        console.log("[APP] setSelectedFile", response.data.title, response.data.relative_path);
        setSelectedFile(response.data);
        if (response.data.folder) {
          setActiveNav("folder");
          setActiveFolder(response.data.folder);
        }
      } else {
        console.error("[APP] readFileNote failed", response.message);
        setSelectedFile(null);
      }
    } catch (error) {
      console.error("[APP] Failed to read file:", error);
      setSelectedFile(null);
    }
    console.log("[APP] handleOpenFile END");
  }, []);

  const handleNavChange = useCallback((nav: NavItem) => {
    setActiveNav(nav);
    setActiveFolder(null);
  }, []);

  const handleFolderChange = useCallback((folder: string) => {
    setActiveNav("folder");
    setActiveFolder(folder);
  }, []);

  const handleToggleFolder = useCallback((relativePath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }
      return next;
    });
  }, []);

  const handleNoteCreated = useCallback(async () => {
    console.log("[APP] handleCreateNote start");
    setCreateStatus({ state: "creating", message: "创建中..." });
    
    try {
      console.log("[APP] invoking createNote");
      
      const isRootFolderSelected = activeNav === "folder" && activeFolder === "";

      let targetFolder = "";
      if (activeNav === "folder" && activeFolder !== null) {
        targetFolder = activeFolder;
      } else if (activeNav === "inbox") {
        targetFolder = "Inbox";
      }
      
      const response = await createNote({ title: "", content: "", folder: targetFolder });
      
      if (response.success && response.data) {
        console.log("[APP] createNote success", response.data);
        const createdNote = response.data;
        
        if (isRootFolderSelected) {
          await loadNotes("folder", "");
        } else if (activeNav !== "folder" || !activeFolder) {
          setActiveNav("folder");
          setActiveFolder("Inbox");
          await loadNotes("folder", "Inbox");
        } else {
          await loadNotes("folder", activeFolder);
        }

        await loadFileTree();
        if (createdNote.relative_path) {
          await handleOpenFile(createdNote.relative_path);
        }
        
        setCreateStatus({ state: "success", message: `创建成功: ${createdNote.title}` });
        setTimeout(() => {
          setCreateStatus({ state: "idle", message: "" });
        }, 2000);
      } else {
        console.error("[APP] createNote failed", response.message || "Unknown error");
        setCreateStatus({ state: "failed", message: response.message || "创建失败" });
      }
    } catch (error) {
      console.error("[APP] createNote failed with exception", error);
      setCreateStatus({ state: "failed", message: "创建失败: 网络或系统错误" });
    }
  }, [loadNotes, loadFileTree, activeNav, activeFolder]);

  const handleNewFolderClick = useCallback(() => {
    let defaultName = "未命名";
    
    const findNodeByPath = (nodes: FileTreeNode[], path: string): FileTreeNode | null => {
      for (const node of nodes) {
        if (node.relative_path === path && node.node_type === "folder") {
          return node;
        }
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
      return null;
    };
    
    const parentNode = activeFolder ? findNodeByPath(fileTree, activeFolder) : null;
    const existingNames = new Set<string>();
    
    if (parentNode) {
      for (const child of parentNode.children) {
        if (child.node_type === "folder") {
          existingNames.add(child.name);
        }
      }
    } else {
      for (const node of fileTree) {
        if (node.node_type === "folder") {
          existingNames.add(node.name);
        }
      }
    }
    
    let counter = 0;
    while (existingNames.has(defaultName)) {
      counter++;
      defaultName = `未命名${counter}`;
    }
    
    setNewFolderName(defaultName);
    setShowNewFolderModal(true);
  }, [showNewFolderModal, fileTree, activeFolder]);

  const handleFolderCreated = useCallback(async () => {
    console.log("[APP] handleFolderCreated start");
    setShowNewFolderModal(false);
    
    const folderName = newFolderName.trim();
    if (!folderName) {
      console.log("[APP] folderName is empty, aborting");
      return;
    }
    
    setCreateStatus({ state: "creating", message: "创建中..." });
    
    try {
      let parentFolder = "";
      if (activeFolder) {
        parentFolder = activeFolder;
      }
      console.log("[APP] parentFolder:", parentFolder);
      
      const response = await createFolder({ name: folderName, parent_folder: parentFolder });
      console.log("[APP] createFolder response:", response);
      
      if (response.success && response.data) {
        console.log("[APP] createFolder success, reloading file tree");
        
        await loadFileTree();
        
        if (parentFolder) {
          handleFolderChange(parentFolder);
          setExpandedFolders(prev => {
            const next = new Set(prev);
            next.add(parentFolder);
            return next;
          });
        }
        
        setCreateStatus({ state: "success", message: `文件夹创建成功: ${folderName}` });
        setTimeout(() => {
          setCreateStatus({ state: "idle", message: "" });
        }, 2000);
      } else {
        console.error("[APP] createFolder failed", response.message || "Unknown error");
        setCreateStatus({ state: "failed", message: response.message || "创建失败" });
      }
    } catch (error) {
      console.error("[APP] createFolder failed with exception", error);
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      setCreateStatus({ state: "failed", message: `创建失败: ${errorMsg}` });
    }
  }, [newFolderName, loadFileTree, activeFolder, handleFolderChange]);

  const handleMoveFile = useCallback(async (sourcePath: string, targetFolder: string) => {
    console.log("[APP] handleMoveFile", sourcePath, targetFolder);
    
    try {
      const response = await moveFile({ source_path: sourcePath, target_folder: targetFolder });
      console.log("[APP] moveFile response", response);
      
      if (response.success) {
        await loadFileTree();
        console.log("[APP] moveFile success, file tree reloaded");
      } else {
        console.error("[APP] moveFile failed", response.message || "Unknown error");
      }
    } catch (error) {
      console.error("[APP] moveFile failed with exception", error);
    }
  }, [loadFileTree]);

  const handleMoveFiles = useCallback(async (sourcePaths: string[], targetFolder: string) => {
    console.log("[APP] handleMoveFiles", sourcePaths, targetFolder);

    for (const sourcePath of sourcePaths) {
      try {
        const response = await moveFile({ source_path: sourcePath, target_folder: targetFolder });
        console.log("[APP] batch moveFile response", sourcePath, response);
        if (!response.success) {
          console.error("[APP] batch moveFile failed", sourcePath, response.message || "Unknown error");
          break;
        }
      } catch (error) {
        console.error("[APP] batch moveFile failed with exception", sourcePath, error);
        break;
      }
    }

    await loadFileTree();
  }, [loadFileTree]);

  const handleDeleteFolder = useCallback(async (folderPath: string) => {
    console.log("[APP] handleDeleteFolder", folderPath);
    
    try {
      const response = await deleteFolder(folderPath);
      console.log("[APP] deleteFolder response", response);
      
      if (response.success) {
        await loadFileTree();
        if (activeFolder === folderPath) {
          setActiveFolder(null);
        }
        console.log("[APP] deleteFolder success, file tree reloaded");
      } else {
        console.error("[APP] deleteFolder failed", response.message || "Unknown error");
      }
    } catch (error) {
      console.error("[APP] deleteFolder failed with exception", error);
    }
  }, [loadFileTree, activeFolder]);

  const handleRenameFolder = useCallback(async (oldPath: string, newName: string) => {
    console.log("[APP] handleRenameFolder", oldPath, newName);
    
    try {
      const response = await renameFolder({ old_path: oldPath, new_name: newName });
      console.log("[APP] renameFolder response", response);
      
      if (response.success) {
        await loadFileTree();
        if (activeFolder === oldPath) {
          setActiveFolder(response.data || null);
        }
        console.log("[APP] renameFolder success, file tree reloaded");
      } else {
        console.error("[APP] renameFolder failed", response.message || "Unknown error");
      }
    } catch (error) {
      console.error("[APP] renameFolder failed with exception", error);
    }
  }, [loadFileTree, activeFolder]);

  const handleOpenFolder = useCallback(async (relativePath: string) => {
    console.log("[APP] handleOpenFolder", relativePath);

    try {
      const response = await openFolder(relativePath);
      if (!response.success) {
        console.error("[APP] openFolder failed", response.message || "Unknown error");
      }
    } catch (error) {
      console.error("[APP] openFolder failed with exception", error);
    }
  }, []);

  const handleDirChange = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择笔记文件夹",
      });
      
      if (selected && typeof selected === "string") {
        const apiResponse = await setNotesRootDir(selected);
        if (apiResponse.success && apiResponse.data) {
          setNotesRootDirState(apiResponse.data.notes_root_dir);
          await loadNotes();
          await loadFileTree();
        } else {
          console.error("Failed to set notes directory:", apiResponse.message);
        }
      }
    } catch (error) {
      console.error("Failed to select directory:", error);
    }
  }, [loadNotes, loadFileTree]);

  const handleNoteDeleted = useCallback(async () => {
    const currentFile = selectedFile;
    if (!currentFile) return;
    
    console.log("[APP] handleNoteDeleted", currentFile.relative_path);
    try {
      const response = await deleteFileNote(currentFile.relative_path);
      if (response.success) {
        console.log("[APP] deleteFileNote success");
      } else {
        console.error("[APP] deleteFileNote failed", response.message);
      }
    } catch (error) {
      console.error("[APP] Failed to delete file:", error);
    }
    
    setSelectedFile(null);
    loadNotes();
    loadFileTree();
  }, [selectedFile, loadNotes, loadFileTree]);

  const handleDeleteNoteFromTree = useCallback(async (relativePath: string) => {
    console.log("[APP] handleDeleteNoteFromTree", relativePath);
    try {
      const response = await deleteFileNote(relativePath);
      if (response.success) {
        if (selectedFile?.relative_path === relativePath) {
          setSelectedFile(null);
        }
        await loadNotes();
        await loadFileTree();
      } else {
        console.error("[APP] deleteFileNote from tree failed", response.message);
      }
    } catch (error) {
      console.error("[APP] Failed to delete file from tree:", error);
    }
  }, [selectedFile, loadNotes, loadFileTree]);

  const handleSaveFile = useCallback(async (relativePath: string, content: string): Promise<boolean> => {
    console.log("[APP] handleSaveFile", relativePath);
    try {
      const response = await writeFileNote(relativePath, content);
      if (response.success && response.data) {
        console.log("[APP] writeFileNote success");
        setSelectedFile(response.data);
        await loadFileTree();
        return true;
      } else {
        console.error("[APP] writeFileNote failed", response.message);
        return false;
      }
    } catch (error) {
      console.error("[APP] Failed to save file:", error);
      return false;
    }
  }, [loadFileTree]);

  const handleRenameFile = useCallback(async (relativePath: string, newTitle: string): Promise<FileNotePayload | null> => {
    console.log("[APP] handleRenameFile", relativePath, newTitle);
    try {
      const response = await renameFileNote(relativePath, newTitle);
      if (response.success && response.data) {
        console.log("[APP] renameFileNote success", response.data);
        setSelectedFile(response.data);
        await loadFileTree();
        return response.data;
      } else {
        console.error("[APP] renameFileNote failed", response.message);
        return null;
      }
    } catch (error) {
      console.error("[APP] Failed to rename file:", error);
      return null;
    }
  }, [loadFileTree]);

  const getCurrentFolderName = useCallback(() => {
    if (activeNav === "folder" && activeFolder === "") {
      return "根目录";
    }
    if (activeNav === "folder" && activeFolder) {
      return activeFolder.split("/").pop() || activeFolder;
    }
    const navLabels: Record<NavItem, string> = {
      all: "全部笔记",
      inbox: "Inbox",
      favorite: "收藏",
      tags: "标签",
      categories: "分类",
      projects: "项目",
      tasks: "任务",
      attachments: "附件",
      trash: "回收站",
      folder: "文件夹",
    };
    return navLabels[activeNav] || "全部笔记";
  }, [activeNav, activeFolder]);

  return (
    <div className="flex h-full bg-slate-50">
      <Sidebar 
        activeNav={activeNav} 
        activeFolder={activeFolder}
        onNavChange={handleNavChange}
        onNewNote={handleNoteCreated}
        onNewFolder={handleNewFolderClick}
        currentDir={notesRootDir}
        onDirChange={handleDirChange}
        createStatus={createStatus}
        showNewFolderModal={showNewFolderModal}
        newFolderName={newFolderName}
        onNewFolderNameChange={setNewFolderName}
        onNewFolderConfirm={handleFolderCreated}
        onNewFolderCancel={() => setShowNewFolderModal(false)}
        currentFolderPath={activeFolder || '根目录'}
      />
      <NoteList 
        notes={notes}
        selectedRelativePath={selectedFile?.relative_path || null}
        isLoading={isLoading || isFileTreeLoading}
        activeNav={activeNav}
        folderName={getCurrentFolderName()}
        fileTree={fileTree}
        activeFolder={activeFolder}
        onFolderChange={handleFolderChange}
        onOpenFile={handleOpenFile}
        expandedFolders={expandedFolders}
        onToggleFolder={handleToggleFolder}
        onMoveFile={handleMoveFile}
        onMoveFiles={handleMoveFiles}
        onDeleteFolder={handleDeleteFolder}
        onRenameFolder={handleRenameFolder}
        onOpenFolder={handleOpenFolder}
        onDeleteNote={handleDeleteNoteFromTree}
        onNewNote={handleNoteCreated}
        onNewFolder={handleNewFolderClick}
      />
      <Editor 
        file={selectedFile}
        onSaveFile={handleSaveFile}
        onDeleteFile={handleNoteDeleted}
        onRenameFile={handleRenameFile}
      />
    </div>
  );
}

export default App;
