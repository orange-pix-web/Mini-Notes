import { invoke } from "@tauri-apps/api/core";
import type { Note, CreateNoteRequest, UpdateNoteRequest, SearchRequest, ApiResponse } from "@/types";

export async function initApp(): Promise<ApiResponse<{ data_dir: string; db_path: string }>> {
  return invoke("init_app");
}

export async function createNote(request: CreateNoteRequest): Promise<ApiResponse<Note>> {
  return invoke("create_note", { request });
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

export async function listNotes(filter: string): Promise<ApiResponse<Note[]>> {
  return invoke("list_notes", { filter });
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