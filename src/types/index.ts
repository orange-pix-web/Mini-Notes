export interface Note {
  id: string;
  title: string;
  file_path: string;
  relative_path: string;
  folder: string;
  summary: string;
  is_favorite: boolean;
  is_pinned: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  last_viewed_at?: string;
  deleted_at?: string;
}

export interface CreateNoteRequest {
  title: string;
  content: string;
  folder: string;
}

export interface CreateFolderRequest {
  name: string;
  parent_folder: string;
}

export interface UpdateNoteRequest {
  id: string;
  content: string;
}

export interface SearchRequest {
  query: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  parent_id?: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  note_id: string;
  original_name: string;
  stored_name: string;
  relative_path: string;
  mime_type?: string;
  file_extension?: string;
  file_size?: number;
  file_hash?: string;
  created_at: string;
  deleted_at?: string;
}

export interface AttachmentFolderNode {
  name: string;
  relative_path: string;
  modified_at?: string | null;
  children: AttachmentFolderNode[];
}

export interface AttachmentItem {
  name: string;
  relative_path: string;
  absolute_path: string;
  item_type: "folder" | "image" | "file";
  extension?: string | null;
  size?: number | null;
  modified_at?: string | null;
}

export interface Task {
  id: string;
  title: string;
  content: string;
  completed: boolean;
  priority: string;
  remind_at?: string | null;
  due_at?: string | null;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface CreateTaskRequest {
  title: string;
  content: string;
  priority: string;
  remind_at?: string | null;
  due_at?: string | null;
}

export interface UpdateTaskRequest {
  id: string;
  title: string;
  content: string;
  completed: boolean;
  priority: string;
  remind_at?: string | null;
  due_at?: string | null;
}

export type NavItem =
  | "all"
  | "inbox"
  | "favorite"
  | "tags"
  | "categories"
  | "projects"
  | "tasks"
  | "attachments"
  | "trash"
  | "folder";

export interface NavOption {
  id: NavItem;
  label: string;
  icon: string;
}

export interface FileTreeNode {
  name: string;
  relative_path: string;
  node_type: string;
  modified_at?: string | null;
  children: FileTreeNode[];
}

export type FileTreeItemType = "root" | "folder" | "note";

export interface FileTreeVisibleItem {
  path: string;
  name: string;
  type: FileTreeItemType;
  depth: number;
  parentPath: string | null;
  isExpanded?: boolean;
}

export interface SearchResultItem {
  id: string;
  type: "folder" | "note";
  title: string;
  path: string;
  subtitle: string;
  snippet?: string;
  score?: number;
}

export interface RenameNoteRequest {
  id: string;
  new_title: string;
}

export interface RenameFolderRequest {
  old_path: string;
  new_name: string;
}

export interface MoveFileRequest {
  source_path: string;
  target_folder: string;
}

export interface FileNotePayload {
  title: string;
  relative_path: string;
  folder: string;
  content: string;
}
