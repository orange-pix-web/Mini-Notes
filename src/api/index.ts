import { invoke } from "@tauri-apps/api/core";
import type { Note, CreateNoteRequest, CreateFolderRequest, UpdateNoteRequest, SearchRequest, ApiResponse, FileTreeNode, RenameNoteRequest, FileNotePayload } from "@/types";

export async function initApp(): Promise<ApiResponse<{ data_dir: string; db_path: string }>> {
  return invoke("init_app");
}

export async function createNote(request?: CreateNoteRequest): Promise<ApiResponse<Note>> {
  const payload = { request: request || {} };
  console.log("[API] createNote invoke start", payload);
  try {
    const result = await invoke<ApiResponse<Note>>("create_note", payload);
    console.log("[API] createNote invoke success", result);
    return result;
  } catch (error) {
    console.error("[API] createNote invoke failed", error);
    throw error;
  }
}

export async function createFolder(request?: CreateFolderRequest): Promise<ApiResponse<string>> {
  const name = request?.name || "";
  const parentFolder = request?.parent_folder || "";
  console.log("[API] createFolder invoke start", { name, parentFolder });
  try {
    const result = await invoke<ApiResponse<string>>("create_folder", { name, parentFolder });
    console.log("[API] createFolder invoke success", result);
    return result;
  } catch (error) {
    console.error("[API] createFolder invoke failed", error);
    throw error;
  }
}

export async function getNote(id: string): Promise<ApiResponse<Note>> {
  return invoke("get_note", { id });
}

export async function getNoteContent(relativePath: string): Promise<string> {
  try {
    const response = await invoke<ApiResponse<string>>("read_note_content", { relative_path: relativePath });
    if (response.success && response.data) {
      return response.data;
    }
    return "";
  } catch {
    return "";
  }
}

export async function updateNote(request: UpdateNoteRequest): Promise<ApiResponse<Note>> {
  return invoke("update_note", { request });
}

export async function listNotes(filter: string, folder?: string): Promise<ApiResponse<Note[]>> {
  return invoke("list_notes", { filter, folder });
}

export async function getFileTree(): Promise<ApiResponse<FileTreeNode[]>> {
  return invoke("get_file_tree");
}

export async function renameNote(request: RenameNoteRequest): Promise<ApiResponse<Note>> {
  return invoke("rename_note", { request });
}

export async function deleteNote(id: string): Promise<ApiResponse<void>> {
  return invoke("delete_note", { id });
}

export async function searchNotes(request: SearchRequest): Promise<ApiResponse<Note[]>> {
  return invoke("search_notes", { request });
}

export async function addTag(note_id: string, tag_name: string): Promise<ApiResponse<void>> {
  return invoke("add_tag", { note_id, tag_name });
}

export async function addCategory(note_id: string, category_name: string): Promise<ApiResponse<void>> {
  return invoke("add_category", { note_id, category_name });
}

export async function toggleFavorite(id: string): Promise<ApiResponse<Note>> {
  return invoke("toggle_favorite", { id });
}

export async function togglePinned(id: string): Promise<ApiResponse<Note>> {
  return invoke("toggle_pinned", { id });
}

export async function importImage(note_id: string, base64_data: string): Promise<ApiResponse<string>> {
  return invoke("import_image", { note_id, base64_data });
}

export async function importFile(note_id: string, file_path: string): Promise<ApiResponse<string>> {
  return invoke("import_file", { note_id, file_path });
}

export async function getWorkspaceInfo(): Promise<ApiResponse<{ data_dir: string; notes_root_dir: string; database_path: string }>> {
  return invoke("get_workspace_info");
}

export async function setNotesRootDir(path: string): Promise<ApiResponse<{ data_dir: string; notes_root_dir: string; database_path: string }>> {
  return invoke("set_notes_root_dir", { path });
}

export async function scanNotes(): Promise<ApiResponse<{ notes_root_dir: string }>> {
  return invoke("scan_notes");
}

export async function readFileNote(relativePath: string): Promise<ApiResponse<FileNotePayload>> {
  console.log("[API] readFileNote", relativePath);
  try {
    const result = await invoke<ApiResponse<FileNotePayload>>("read_file_note", { relativePath });
    console.log("[API] readFileNote result", result);
    return result;
  } catch (error) {
    console.error("[API] readFileNote error", error);
    throw error;
  }
}

export async function writeFileNote(relativePath: string, content: string): Promise<ApiResponse<FileNotePayload>> {
  console.log("[API] writeFileNote", relativePath);
  try {
    const result = await invoke<ApiResponse<FileNotePayload>>("write_file_note", { relativePath, content });
    console.log("[API] writeFileNote result", result);
    return result;
  } catch (error) {
    console.error("[API] writeFileNote error", error);
    throw error;
  }
}

export async function renameFileNote(relativePath: string, newTitle: string): Promise<ApiResponse<FileNotePayload>> {
  console.log("[API] renameFileNote", relativePath, newTitle);
  try {
    const result = await invoke<ApiResponse<FileNotePayload>>("rename_file_note", { relativePath, newTitle });
    console.log("[API] renameFileNote result", result);
    return result;
  } catch (error) {
    console.error("[API] renameFileNote error", error);
    throw error;
  }
}

export async function deleteFileNote(relativePath: string): Promise<ApiResponse<void>> {
  console.log("[API] deleteFileNote", relativePath);
  try {
    const result = await invoke<ApiResponse<void>>("delete_file_note", { relativePath });
    console.log("[API] deleteFileNote result", result);
    return result;
  } catch (error) {
    console.error("[API] deleteFileNote error", error);
    throw error;
  }
}