import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import NoteList from "@/components/NoteList";
import Editor from "@/components/Editor";
import { initApp, listNotes, createNote, getWorkspaceInfo, setNotesRootDir, getFileTree, renameNote } from "@/api";
import type { Note, NavItem, FileTreeNode } from "@/types";
import { open } from "@tauri-apps/plugin-dialog";

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem>("all");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notesRootDir, setNotesRootDirState] = useState("");
  const [createStatus, setCreateStatus] = useState<{
    state: "idle" | "creating" | "success" | "failed";
    message: string;
  }>({ state: "idle", message: "" });

  const getDbFolderName = (fileTreePath: string): string => {
    if (fileTreePath.startsWith("Notes/")) {
      const afterNotes = fileTreePath.slice(6);
      return afterNotes || "Inbox";
    }
    return fileTreePath || "Inbox";
  };

  const loadNotes = useCallback(async (filter?: string, folder?: string) => {
    const currentFilter = filter || activeNav;
    let currentFolder = folder || activeFolder || undefined;
    if (currentFolder) {
      currentFolder = getDbFolderName(currentFolder);
    }
    setIsLoading(true);
    try {
      const response = await listNotes(currentFilter, currentFolder);
      if (response.success && response.data) {
        setNotes(response.data);
      }
    } catch (error) {
      console.error("Failed to load notes:", error);
    } finally {
      setIsLoading(false);
    }
  }, [activeNav, activeFolder]);

  const loadFileTree = useCallback(async () => {
    try {
      const response = await getFileTree();
      if (response.success && response.data) {
        setFileTree(response.data);
      }
    } catch (error) {
      console.error("Failed to load file tree:", error);
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
    loadNotes();
  }, [activeNav, activeFolder, loadNotes]);

  const handleNoteSelect = useCallback((note: Note) => {
    setSelectedNote(note);
  }, []);

  const handleNoteSelectByPath = useCallback(async (relativePath: string) => {
    const foundNote = notes.find(n => n.relative_path === relativePath);
    if (foundNote) {
      setSelectedNote(foundNote);
      return;
    }
    
    try {
      const allNotesResponse = await listNotes("all");
      if (allNotesResponse.success && allNotesResponse.data) {
        const note = allNotesResponse.data.find(n => n.relative_path === relativePath);
        if (note) {
          setSelectedNote(note);
        } else {
          console.warn(`Note not found: ${relativePath}`);
        }
      }
    } catch (error) {
      console.error(`Failed to find note by path: ${relativePath}`, error);
    }
  }, [notes]);

  const handleNavChange = useCallback((nav: NavItem) => {
    setActiveNav(nav);
    setActiveFolder(null);
  }, []);

  const handleFolderChange = useCallback((folder: string) => {
    setActiveNav("folder");
    setActiveFolder(folder);
  }, []);

  const handleNoteCreated = useCallback(async () => {
    console.log("[APP] handleCreateNote start");
    setCreateStatus({ state: "creating", message: "创建中..." });
    
    try {
      console.log("[APP] invoking createNote");
      
      let targetFolder = "Inbox";
      if (activeNav === "folder" && activeFolder) {
        targetFolder = activeFolder;
      } else if (activeNav === "inbox") {
        targetFolder = "Inbox";
      }
      
      const response = await createNote({ title: "", content: "", folder: targetFolder });
      
      if (response.success && response.data) {
        console.log("[APP] createNote success", response.data);
        const createdNote = response.data;
        
        if (activeNav !== "folder" || !activeFolder) {
          setActiveNav("folder");
          setActiveFolder("Inbox");
        }
        
        await loadNotes("folder", activeNav === "folder" && activeFolder ? activeFolder : "Inbox");
        await loadFileTree();
        setSelectedNote(createdNote);
        
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

  const handleNoteUpdated = useCallback(() => {
    loadNotes();
    loadFileTree();
  }, [loadNotes, loadFileTree]);

  const handleNoteDeleted = useCallback(() => {
    setSelectedNote(null);
    loadNotes();
    loadFileTree();
  }, [loadNotes, loadFileTree]);

  const handleNoteRenamed = useCallback(async (noteId: string, newTitle: string): Promise<boolean> => {
    try {
      const response = await renameNote({ id: noteId, new_title: newTitle });
      if (response.success && response.data) {
        console.log("[APP] renameNote success", response.data);
        setSelectedNote(response.data);
        await loadNotes();
        await loadFileTree();
        return true;
      } else {
        console.error("[APP] renameNote failed", response.message);
        return false;
      }
    } catch (error) {
      console.error("[APP] Failed to rename note:", error);
      return false;
    }
  }, [loadNotes, loadFileTree]);

  const getCurrentFolderName = useCallback(() => {
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
        currentDir={notesRootDir}
        onDirChange={handleDirChange}
        createStatus={createStatus}
      />
      <NoteList 
        notes={notes}
        selectedNote={selectedNote}
        onSelect={handleNoteSelect}
        isLoading={isLoading}
        activeNav={activeNav}
        folderName={getCurrentFolderName()}
        fileTree={fileTree}
        activeFolder={activeFolder}
        onFolderChange={handleFolderChange}
        onNoteSelectByPath={handleNoteSelectByPath}
      />
      <Editor 
        note={selectedNote}
        onNoteUpdated={handleNoteUpdated}
        onNoteDeleted={handleNoteDeleted}
        onNoteRenamed={handleNoteRenamed}
      />
    </div>
  );
}

export default App;