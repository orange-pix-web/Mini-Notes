import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import NoteList from "@/components/NoteList";
import Editor from "@/components/Editor";
import SearchModal from "@/components/SearchModal";
import TaskWorkspace from "@/components/TaskWorkspace";
import TrashWorkspace from "@/components/TrashWorkspace";
import AttachmentsWorkspace from "@/components/AttachmentsWorkspace";
import { initApp, listNotes, createNote, createFolder, getWorkspaceInfo, setNotesRootDir, setAttachmentsRootDir, getFileTree, readFileNote, writeFileNote, renameFileNote, deleteFileNote, moveFile, deleteFolder, renameFolder, openFolder, searchNotes, listTasks, createTask, updateTask, deleteTask, restoreTask, permanentlyDeleteTask, getAttachmentTree, listAttachmentItems, openAttachmentItem, importAttachmentFiles, createAttachmentFolder, renameAttachmentItem, deleteAttachmentItem, moveAttachmentItems } from "@/api";
import type { Note, NavItem, FileTreeNode, FileNotePayload, SearchResultItem, Task, UpdateTaskRequest, AttachmentFolderNode, AttachmentItem } from "@/types";
import { open } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";

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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [deletedTasks, setDeletedTasks] = useState<Task[]>([]);
  const [selectedDeletedTaskId, setSelectedDeletedTaskId] = useState<string | null>(null);
  const [attachmentTree, setAttachmentTree] = useState<AttachmentFolderNode[]>([]);
  const [selectedAttachmentFolder, setSelectedAttachmentFolder] = useState("");
  const [attachmentItems, setAttachmentItems] = useState<AttachmentItem[]>([]);
  const [activeNav, setActiveNav] = useState<NavItem>("all");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState(true);
  const [notesRootDir, setNotesRootDirState] = useState("");
  const [attachmentsRootDir, setAttachmentsRootDirState] = useState("");
  const [createStatus, setCreateStatus] = useState<{
    state: "idle" | "creating" | "success" | "failed";
    message: string;
  }>({ state: "idle", message: "" });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("新建文件夹");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [treeRevealPath, setTreeRevealPath] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("sidebar_collapsed") === "true";
  });

  useEffect(() => {
    window.localStorage.setItem("sidebar_collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    let cancelled = false;

    const loadVersion = async () => {
      try {
        const version = await getVersion();
        if (!cancelled) {
          setAppVersion(version);
        }
      } catch (error) {
        console.error("[APP] Failed to load runtime version:", error);
      }
    };

    void loadVersion();

    return () => {
      cancelled = true;
    };
  }, []);

  const getDbFolderName = (fileTreePath: string): string => {
    if (fileTreePath.startsWith("Notes/")) {
      return fileTreePath.slice(6);
    }
    return fileTreePath;
  };

  const getSearchScore = useCallback((query: string, title: string, path: string, snippet = "") => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedTitle = title.toLowerCase();
    const normalizedPath = path.toLowerCase();
    const normalizedSnippet = snippet.toLowerCase();

    if (!normalizedQuery) {
      return Number.MAX_SAFE_INTEGER;
    }

    if (normalizedTitle === normalizedQuery) return 0;
    if (normalizedTitle.startsWith(normalizedQuery)) return 1;
    if (normalizedTitle.includes(normalizedQuery)) return 2;
    if (normalizedPath.endsWith(normalizedQuery)) return 3;
    if (normalizedPath.includes(normalizedQuery)) return 4;
    if (normalizedSnippet.includes(normalizedQuery)) return 5;
    return 6;
  }, []);

  const buildSnippet = useCallback((summary: string, query: string) => {
    const trimmedSummary = summary.trim();
    if (!trimmedSummary) {
      return "";
    }

    const normalizedQuery = query.trim().toLowerCase();
    const normalizedSummary = trimmedSummary.toLowerCase();
    const matchIndex = normalizedSummary.indexOf(normalizedQuery);

    if (matchIndex === -1) {
      return trimmedSummary.length > 80 ? `${trimmedSummary.slice(0, 80)}...` : trimmedSummary;
    }

    const start = Math.max(0, matchIndex - 24);
    const end = Math.min(trimmedSummary.length, matchIndex + normalizedQuery.length + 36);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < trimmedSummary.length ? "..." : "";
    return `${prefix}${trimmedSummary.slice(start, end)}${suffix}`;
  }, []);

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

  const loadActiveTasks = useCallback(async () => {
    try {
      const response = await listTasks(false);
      if (response.success && response.data) {
        const loadedTasks = response.data;
        setTasks(loadedTasks);
        setSelectedTaskId((prev) => prev && loadedTasks.some((task) => task.id === prev) ? prev : loadedTasks[0]?.id ?? null);
      }
    } catch (error) {
      console.error("[APP] Failed to load tasks:", error);
    }
  }, []);

  const loadDeletedTasks = useCallback(async () => {
    try {
      const response = await listTasks(true);
      if (response.success && response.data) {
        const loadedTasks = response.data;
        setDeletedTasks(loadedTasks);
        setSelectedDeletedTaskId((prev) => prev && loadedTasks.some((task) => task.id === prev) ? prev : loadedTasks[0]?.id ?? null);
      }
    } catch (error) {
      console.error("[APP] Failed to load deleted tasks:", error);
    }
  }, []);

  const loadAttachmentTree = useCallback(async () => {
    try {
      const response = await getAttachmentTree();
      if (response.success && response.data) {
        setAttachmentTree(response.data);
      }
    } catch (error) {
      console.error("[APP] Failed to load attachment tree:", error);
    }
  }, []);

  const loadAttachmentItems = useCallback(async (relativePath = "") => {
    try {
      const response = await listAttachmentItems(relativePath);
      if (response.success && response.data) {
        setAttachmentItems(response.data);
      }
    } catch (error) {
      console.error("[APP] Failed to load attachment items:", error);
    }
  }, []);

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
          setAttachmentsRootDirState(workspaceResponse.data.attachments_root_dir);
        }
        await loadNotes();
        await loadFileTree();
        await loadActiveTasks();
        await loadDeletedTasks();
        await loadAttachmentTree();
        await loadAttachmentItems("");
      } catch (error) {
        console.error("Initialization failed:", error);
      }
    };
    initialize();
  }, [loadNotes, loadFileTree, loadActiveTasks, loadDeletedTasks, loadAttachmentTree, loadAttachmentItems]);

  useEffect(() => {
    console.log("[APP] fileTree state changed:", fileTree.length, "nodes");
  }, [fileTree]);

  useEffect(() => {
    if (activeNav === "tasks") {
      void loadActiveTasks();
      return;
    }

    if (activeNav === "trash") {
      void loadDeletedTasks();
      return;
    }

    if (activeNav === "attachments") {
      void loadAttachmentTree();
      void loadAttachmentItems(selectedAttachmentFolder);
      return;
    }

    void loadNotes();
  }, [activeNav, activeFolder, loadNotes, loadActiveTasks, loadDeletedTasks, loadAttachmentTree, loadAttachmentItems, selectedAttachmentFolder]);

  const expandFolderPath = useCallback((folderPath: string) => {
    const segments = folderPath.split("/").filter(Boolean);
    const foldersToExpand = new Set<string>();
    let currentPath = "";

    for (let i = 0; i < segments.length - 1; i += 1) {
      currentPath = currentPath ? `${currentPath}/${segments[i]}` : segments[i];
      foldersToExpand.add(currentPath);
    }

    setExpandedFolders((prev) => {
      const next = new Set(prev);
      foldersToExpand.forEach((path) => next.add(path));
      return next;
    });
  }, []);

  const flattenFileTreeItems = useCallback((nodes: FileTreeNode[]): SearchResultItem[] => {
    const items: SearchResultItem[] = [];

    const visit = (treeNodes: FileTreeNode[]) => {
      for (const node of treeNodes) {
        if (node.node_type === "folder") {
          items.push({
            id: `folder:${node.relative_path}`,
            type: "folder",
            title: node.name,
            path: node.relative_path,
            subtitle: node.relative_path ? `根目录/${node.relative_path}` : "根目录",
          });
        } else {
          const folderPath = node.relative_path.includes("/") ? node.relative_path.slice(0, node.relative_path.lastIndexOf("/")) : "";
          items.push({
            id: `note-file:${node.relative_path}`,
            type: "note",
            title: node.name,
            path: node.relative_path,
            subtitle: folderPath || "根目录",
          });
        }

        if (node.children.length > 0) {
          visit(node.children);
        }
      }
    };

    visit(nodes);
    return items;
  }, []);

  const handleOpenSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedSearchIndex(0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const primaryPressed = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? event.metaKey : event.ctrlKey;
      if (!primaryPressed || event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();
      setIsSearchOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    const trimmedQuery = searchQuery.trim().toLowerCase();
    if (!trimmedQuery) {
      setSearchResults([]);
      setSelectedSearchIndex(0);
      setIsSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearchLoading(true);

      try {
        const fileTreeItems = flattenFileTreeItems(fileTree);
        const folderMatches = fileTreeItems
          .filter((item) => item.type === "folder" && (
            item.title.toLowerCase().includes(trimmedQuery) || item.path.toLowerCase().includes(trimmedQuery)
          ))
          .map((item) => ({
            ...item,
            score: getSearchScore(trimmedQuery, item.title, item.path),
          }))
          .sort((a, b) => (a.score ?? 99) - (b.score ?? 99) || a.path.localeCompare(b.path, "zh-Hans-CN"));

        const noteFileMatches = fileTreeItems.filter((item) => item.type === "note" && (
          item.title.toLowerCase().includes(trimmedQuery) || item.path.toLowerCase().includes(trimmedQuery)
        ));

        const response = await searchNotes({ query: searchQuery.trim() });
        const noteMap = new Map<string, SearchResultItem>();

        for (const item of noteFileMatches) {
          noteMap.set(item.path, {
            ...item,
            score: getSearchScore(trimmedQuery, item.title, item.path),
          });
        }

        if (response.success && response.data) {
          for (const note of response.data) {
            noteMap.set(note.relative_path, {
              id: `note-db:${note.relative_path}`,
              type: "note",
              title: note.title || note.relative_path.split("/").pop() || note.relative_path,
              path: note.relative_path,
              subtitle: note.folder || "根目录",
              snippet: buildSnippet(note.summary || "", searchQuery.trim()),
              score: getSearchScore(
                trimmedQuery,
                note.title || note.relative_path.split("/").pop() || note.relative_path,
                note.relative_path,
                note.summary || "",
              ),
            });
          }
        }

        if (!cancelled) {
          const sortedNotes = Array.from(noteMap.values()).sort(
            (a, b) => (a.score ?? 99) - (b.score ?? 99) || a.path.localeCompare(b.path, "zh-Hans-CN"),
          );
          setSearchResults([...folderMatches, ...sortedNotes]);
          setSelectedSearchIndex(0);
        }
      } catch (error) {
        console.error("[APP] search failed", error);
        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearchLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isSearchOpen, searchQuery, fileTree, flattenFileTreeItems, getSearchScore, buildSnippet]);

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

  const handleSearchResultSelect = useCallback(async () => {
    const selectedItem = searchResults[selectedSearchIndex];
    if (!selectedItem) {
      return;
    }

    if (selectedItem.type === "folder") {
      expandFolderPath(selectedItem.path);
      setSelectedFile(null);
      setActiveNav("folder");
      setActiveFolder(selectedItem.path);
      setTreeRevealPath(selectedItem.path);
    } else {
      const folderPath = selectedItem.path.includes("/") ? selectedItem.path.slice(0, selectedItem.path.lastIndexOf("/")) : "";
      if (folderPath) {
        expandFolderPath(folderPath);
      }
      await handleOpenFile(selectedItem.path);
      setTreeRevealPath(selectedItem.path);
    }

    handleCloseSearch();
  }, [searchResults, selectedSearchIndex, expandFolderPath, handleOpenFile, handleCloseSearch]);

  const handleNavChange = useCallback((nav: NavItem) => {
    setActiveNav(nav);
    setActiveFolder(null);
    if (nav === "tasks" || nav === "trash") {
      setSelectedFile(null);
    }
    if (nav === "attachments") {
      setSelectedFile(null);
      setSelectedAttachmentFolder("");
    }
  }, []);

  const handleFolderChange = useCallback((folder: string) => {
    setActiveNav("folder");
    setActiveFolder(folder);
  }, []);

  const handleTaskCreated = useCallback(async (parentId: string | null = null) => {
    const response = await createTask({
      title: "新待办",
      content: "",
      priority: "normal",
      parent_id: parentId,
      remind_at: null,
      due_at: null,
    });
    if (response.success && response.data) {
      await loadActiveTasks();
      setActiveNav("tasks");
      setSelectedTaskId(response.data.id);
    }
  }, [loadActiveTasks]);

  const handleTaskSaved = useCallback(async (request: UpdateTaskRequest): Promise<Task | null> => {
    try {
      const response = await updateTask(request);
      if (response.success && response.data) {
        await loadActiveTasks();
        await loadDeletedTasks();
        setSelectedTaskId(response.data.id);
        return response.data;
      }
      return null;
    } catch (error) {
      console.error("[APP] Failed to save task:", error);
      return null;
    }
  }, [loadActiveTasks, loadDeletedTasks]);

  const handleTaskDeleted = useCallback(async (id: string) => {
    try {
      await deleteTask(id);
      await loadActiveTasks();
      await loadDeletedTasks();
    } catch (error) {
      console.error("[APP] Failed to delete task:", error);
    }
  }, [loadActiveTasks, loadDeletedTasks]);

  const handleTaskCompletedToggle = useCallback(async (task: Task, completed: boolean) => {
    try {
      await updateTask({
        id: task.id,
        title: task.title,
        content: task.content,
        completed,
        priority: task.priority,
        parent_id: task.parent_id ?? null,
        remind_at: task.remind_at ?? null,
        due_at: task.due_at ?? null,
      });
      await loadActiveTasks();
      await loadDeletedTasks();
      if (selectedTaskId === task.id) {
        setSelectedTaskId(task.id);
      }
    } catch (error) {
      console.error("[APP] Failed to toggle task completed:", error);
    }
  }, [loadActiveTasks, loadDeletedTasks, selectedTaskId]);

  const handleTaskRestored = useCallback(async (id: string) => {
    try {
      await restoreTask(id);
      await loadActiveTasks();
      await loadDeletedTasks();
    } catch (error) {
      console.error("[APP] Failed to restore task:", error);
    }
  }, [loadActiveTasks, loadDeletedTasks]);

  const handleTaskPermanentDelete = useCallback(async (id: string) => {
    const ok = window.confirm("确定彻底删除这个待办吗？此操作无法恢复。");
    if (!ok) {
      return;
    }

    try {
      await permanentlyDeleteTask(id);
      await loadDeletedTasks();
    } catch (error) {
      console.error("[APP] Failed to permanently delete task:", error);
    }
  }, [loadDeletedTasks]);

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
          setAttachmentsRootDirState(apiResponse.data.attachments_root_dir);
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

  const handleAttachmentsDirChange = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择附件文件夹",
      });

      if (selected && typeof selected === "string") {
        const response = await setAttachmentsRootDir(selected);
        if (response.success && response.data) {
          setAttachmentsRootDirState(response.data.attachments_root_dir);
          setSelectedAttachmentFolder("");
          await loadAttachmentTree();
          await loadAttachmentItems("");
        } else {
          console.error("[APP] Failed to set attachments directory:", response.message);
        }
      }
    } catch (error) {
      console.error("[APP] Failed to select attachments directory:", error);
    }
  }, [loadAttachmentItems, loadAttachmentTree]);

  const handleImportAttachments = useCallback(async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: true,
        title: "导入附件文件",
      });

      if (!selected) {
        return;
      }

      const filePaths = Array.isArray(selected) ? selected.filter((item): item is string => typeof item === "string") : [selected];
      if (filePaths.length === 0) {
        return;
      }

      const response = await importAttachmentFiles(filePaths, selectedAttachmentFolder);
      if (response.success) {
        await loadAttachmentTree();
        await loadAttachmentItems(selectedAttachmentFolder);
      } else {
        console.error("[APP] Failed to import attachments:", response.message);
      }
    } catch (error) {
      console.error("[APP] Failed to import attachments:", error);
    }
  }, [loadAttachmentItems, loadAttachmentTree, selectedAttachmentFolder]);

  const handleOpenAttachmentFolder = useCallback(async (relativePath: string) => {
    try {
      const response = await openAttachmentItem(relativePath);
      if (!response.success) {
        console.error("[APP] Failed to open attachment folder:", response.message);
      }
    } catch (error) {
      console.error("[APP] Failed to open attachment folder:", error);
    }
  }, []);

  const handleCreateAttachmentFolder = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    try {
      const response = await createAttachmentFolder({
        name: trimmedName,
        parent_folder: selectedAttachmentFolder,
      });
      if (response.success && response.data) {
        await loadAttachmentTree();
        setSelectedAttachmentFolder(selectedAttachmentFolder);
        await loadAttachmentItems(selectedAttachmentFolder);
      } else {
        console.error("[APP] Failed to create attachment folder:", response.message);
      }
    } catch (error) {
      console.error("[APP] Failed to create attachment folder:", error);
    }
  }, [loadAttachmentItems, loadAttachmentTree, selectedAttachmentFolder]);

  const handleRenameAttachmentItem = useCallback(async (item: AttachmentItem, name: string) => {
    const newName = name.trim();
    if (!newName) {
      return;
    }

    try {
      const response = await renameAttachmentItem({
        old_path: item.relative_path,
        new_name: newName,
      });
      if (response.success) {
        await loadAttachmentTree();
        await loadAttachmentItems(selectedAttachmentFolder);
      } else {
        console.error("[APP] Failed to rename attachment item:", response.message);
      }
    } catch (error) {
      console.error("[APP] Failed to rename attachment item:", error);
    }
  }, [loadAttachmentItems, loadAttachmentTree, selectedAttachmentFolder]);

  const handleDeleteAttachmentItem = useCallback(async (item: AttachmentItem) => {
    try {
      const response = await deleteAttachmentItem(item.relative_path);
      if (response.success) {
        await loadAttachmentTree();
        await loadAttachmentItems(selectedAttachmentFolder);
      } else {
        console.error("[APP] Failed to delete attachment item:", response.message);
      }
    } catch (error) {
      console.error("[APP] Failed to delete attachment item:", error);
    }
  }, [loadAttachmentItems, loadAttachmentTree, selectedAttachmentFolder]);

  const handleMoveAttachmentItems = useCallback(async (sourcePaths: string[], targetFolder: string) => {
    try {
      const response = await moveAttachmentItems(sourcePaths, targetFolder);
      if (response.success) {
        await loadAttachmentTree();
        await loadAttachmentItems(selectedAttachmentFolder);
      } else {
        console.error("[APP] Failed to move attachment items:", response.message);
      }
    } catch (error) {
      console.error("[APP] Failed to move attachment items:", error);
    }
  }, [loadAttachmentItems, loadAttachmentTree, selectedAttachmentFolder]);

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
      tasks: "待办",
      attachments: "附件",
      trash: "回收站",
      folder: "文件夹",
    };
    return navLabels[activeNav] || "全部笔记";
  }, [activeNav, activeFolder]);

  const sidebarPrimaryActionLabel = activeNav === "tasks" ? "新建待办" : "新建笔记";
  const sidebarSecondaryActionLabel = activeNav === "tasks" ? "新建子待办" : "新建文件夹";
  const sidebarPrimaryActionIcon = activeNav === "tasks" ? "✅" : "📝";
  const sidebarSecondaryActionIcon = activeNav === "tasks" ? "↳" : "📁";
  const sidebarPrimaryAction = activeNav === "tasks"
    ? () => void handleTaskCreated(null)
    : handleNoteCreated;
  const sidebarSecondaryAction = activeNav === "tasks"
    ? (selectedTaskId ? () => void handleTaskCreated(selectedTaskId) : undefined)
    : handleNewFolderClick;

  return (
    <div className="flex h-full bg-slate-50">
      <Sidebar 
        activeNav={activeNav} 
        activeFolder={activeFolder}
        onNavChange={handleNavChange}
        onNewNote={sidebarPrimaryAction}
        onNewFolder={sidebarSecondaryAction}
        currentDir={notesRootDir}
        onDirChange={handleDirChange}
        attachmentsDir={attachmentsRootDir}
        onAttachmentsDirChange={handleAttachmentsDirChange}
        createStatus={createStatus}
        showNewFolderModal={showNewFolderModal}
        newFolderName={newFolderName}
        onNewFolderNameChange={setNewFolderName}
        onNewFolderConfirm={handleFolderCreated}
        onNewFolderCancel={() => setShowNewFolderModal(false)}
        currentFolderPath={activeFolder || '根目录'}
        version={appVersion}
        collapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
        onOpenSearch={handleOpenSearch}
        primaryActionLabel={sidebarPrimaryActionLabel}
        secondaryActionLabel={sidebarSecondaryActionLabel}
        primaryActionIcon={sidebarPrimaryActionIcon}
        secondaryActionIcon={sidebarSecondaryActionIcon}
      />
      {activeNav === "tasks" ? (
        <TaskWorkspace
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
          onCreateTask={() => void handleTaskCreated(null)}
          onCreateChildTask={(parentId) => void handleTaskCreated(parentId)}
          onSaveTask={handleTaskSaved}
          onDeleteTask={handleTaskDeleted}
          onToggleTaskCompleted={handleTaskCompletedToggle}
        />
      ) : activeNav === "trash" ? (
        <TrashWorkspace
          tasks={deletedTasks}
          selectedTaskId={selectedDeletedTaskId}
          onSelectTask={setSelectedDeletedTaskId}
          onRestoreTask={handleTaskRestored}
          onPermanentlyDeleteTask={handleTaskPermanentDelete}
        />
      ) : activeNav === "attachments" ? (
        <AttachmentsWorkspace
          tree={attachmentTree}
          items={attachmentItems}
          selectedFolder={selectedAttachmentFolder}
          attachmentsRootDir={attachmentsRootDir}
          onSelectFolder={(path) => {
            setSelectedAttachmentFolder(path);
            void loadAttachmentItems(path);
          }}
          onOpenItem={async (path) => {
            await openAttachmentItem(path);
          }}
          onImportFiles={handleImportAttachments}
          onOpenFolder={handleOpenAttachmentFolder}
          onCreateFolder={handleCreateAttachmentFolder}
          onRenameItem={handleRenameAttachmentItem}
          onDeleteItem={handleDeleteAttachmentItem}
          onMoveItems={handleMoveAttachmentItems}
        />
      ) : (
        <>
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
            revealPath={treeRevealPath}
            onRevealHandled={() => setTreeRevealPath(null)}
          />
          <Editor 
            file={selectedFile}
            onSaveFile={handleSaveFile}
            onDeleteFile={handleNoteDeleted}
            onRenameFile={handleRenameFile}
          />
        </>
      )}
      <SearchModal
        isOpen={isSearchOpen}
        query={searchQuery}
        results={searchResults}
        selectedIndex={selectedSearchIndex}
        isLoading={isSearchLoading}
        onQueryChange={setSearchQuery}
        onClose={handleCloseSearch}
        onSelectIndex={setSelectedSearchIndex}
        onConfirmSelection={handleSearchResultSelect}
      />
    </div>
  );
}

export default App;
