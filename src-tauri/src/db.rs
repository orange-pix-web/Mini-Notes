use chrono::Local;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::fs::write_atomic;
use crate::types::{CreateNoteRequest, CreateTaskRequest, UpdateTaskRequest};

#[derive(Debug, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub relative_path: String,
    pub folder: String,
    pub summary: String,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_viewed_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Todo {
    pub id: String,
    pub title: String,
    pub content: String,
    pub completed: bool,
    pub priority: String,
    pub remind_at: Option<String>,
    pub due_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

fn now_str() -> String {
    Local::now().to_rfc3339()
}

pub fn run_migrations(conn: &Connection) -> SqlResult<()> {
    let migrations = [
        include_str!("../migrations/0001_initial.sql"),
        include_str!("../migrations/0002_add_tasks.sql"),
        include_str!("../migrations/0003_add_note_links.sql"),
        include_str!("../migrations/0004_add_todos.sql"),
    ];

    for (idx, migration) in migrations.iter().enumerate() {
        let version = idx + 1;
        let name = format!("migration_{}", version);

        let mut stmt = conn.prepare("SELECT COUNT(*) FROM schema_migrations WHERE version = ?")?;
        let mut rows = stmt.query(params![version])?;
        let count: i64 = rows.next()?.unwrap().get(0)?;

        if count == 0 {
            conn.execute_batch(migration)?;

            conn.execute(
                "INSERT INTO schema_migrations (version, name, executed_at, success) VALUES (?, ?, ?, ?)",
                params![version, name, now_str(), true],
            )?;

            log::info!("[MIGRATION] {} 执行完成", name);
        }
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> SqlResult<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?")?;
    let mut rows = stmt.query(params![key])?;

    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> SqlResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
        params![key, value, now_str()],
    )?;
    Ok(())
}

fn get_summary(content: &str, max_len: usize) -> String {
    let text = content.replace('\n', " ").replace('\r', "");
    let chars: Vec<char> = text.chars().collect();
    if chars.len() > max_len {
        chars[..max_len].iter().collect::<String>() + "..."
    } else {
        text
    }
}

fn extract_title(content: &str) -> Option<String> {
    let first_line = content.lines().next().unwrap_or("");
    if first_line.starts_with('#') {
        let title = first_line.trim_start_matches('#').trim();
        if !title.is_empty() {
            Some(title.to_string())
        } else {
            None
        }
    } else {
        None
    }
}

pub fn create_note(
    db_path: &Path,
    data_dir: &Path,
    request: &CreateNoteRequest,
) -> SqlResult<Note> {
    log::info!("[NOTE] 开始创建笔记");

    let conn = Connection::open(db_path)?;
    let id = Uuid::new_v4().to_string();

    let folder_path = if request.folder.is_empty() {
        data_dir.to_path_buf()
    } else {
        data_dir.join(&request.folder)
    };

    if !request.folder.is_empty() {
        if let Err(e) = fs::create_dir_all(&folder_path) {
            log::error!("[ERROR] [NOTE] create_note failed: 创建目录失败: {}", e);
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
    }

    let mut existing_indices = std::collections::HashSet::new();
    let mut has_unnamed = false;
    if let Ok(entries) = fs::read_dir(&folder_path) {
        for entry in entries.flatten() {
            if let Some(file_name) = entry.file_name().to_str() {
                if file_name.starts_with("未命名") && file_name.ends_with(".md") {
                    let base = &file_name[0..file_name.len() - 3];
                    if base == "未命名" {
                        has_unnamed = true;
                    } else if let Some(index_str) = base.strip_prefix("未命名") {
                        if let Ok(index) = index_str.parse::<i32>() {
                            existing_indices.insert(index);
                        }
                    }
                }
            }
        }
    }

    let next_index = if !has_unnamed {
        0
    } else {
        let mut index = 1;
        while existing_indices.contains(&index) {
            index += 1;
        }
        index
    };

    let (file_name, title) = if next_index == 0 {
        ("未命名.md".to_string(), "未命名".to_string())
    } else {
        (
            format!("未命名{}.md", next_index),
            format!("未命名{}", next_index),
        )
    };

    let folder = if request.folder.is_empty() {
        ""
    } else {
        &request.folder
    };
    let relative_path = if request.folder.is_empty() {
        PathBuf::from(&file_name)
    } else {
        PathBuf::from(&request.folder).join(&file_name)
    };
    let file_path = data_dir.join(&relative_path);

    log::info!("[NOTE] create note file start: {}", file_path.display());

    let content = if request.content.is_empty() {
        format!("# {}\n\n", title)
    } else {
        request.content.clone()
    };

    if let Err(e) = write_atomic(&file_path, &content) {
        log::error!("[ERROR] [NOTE] create_note failed: 写入文件失败: {}", e);
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    log::info!("[NOTE] create note file success: {}", file_path.display());

    let title = if request.title.is_empty() {
        extract_title(&content).unwrap_or_else(|| "未命名笔记".to_string())
    } else {
        request.title.clone()
    };
    let summary = get_summary(&content, 200);
    let now = now_str();

    log::info!("[NOTE] insert note db start");
    let result: Note = conn.query_row(
        "INSERT INTO notes (id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
         RETURNING id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at, last_viewed_at, deleted_at",
        params![
            id,
            title,
            relative_path.to_string_lossy(),
            relative_path.to_string_lossy(),
            folder,
            summary,
            false,
            false,
            "active",
            now,
            now,
        ],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                relative_path: row.get(3)?,
                folder: row.get(4)?,
                summary: row.get(5)?,
                is_favorite: row.get(6)?,
                is_pinned: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                last_viewed_at: row.get(11)?,
                deleted_at: row.get(12)?,
            })
        },
    )?;

    log::info!("[NOTE] insert note db success: note_id={}", id);
    Ok(result)
}

pub fn get_note(db_path: &Path, id: &str) -> SqlResult<Note> {
    let conn = Connection::open(db_path)?;

    let note: Note = conn.query_row(
        "SELECT id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at, last_viewed_at, deleted_at 
         FROM notes WHERE id = ?",
        params![id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                relative_path: row.get(3)?,
                folder: row.get(4)?,
                summary: row.get(5)?,
                is_favorite: row.get(6)?,
                is_pinned: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                last_viewed_at: row.get(11)?,
                deleted_at: row.get(12)?,
            })
        },
    )?;

    conn.execute(
        "UPDATE notes SET last_viewed_at = ? WHERE id = ?",
        params![now_str(), id],
    )?;

    Ok(note)
}

pub fn update_note(db_path: &Path, data_dir: &Path, id: &str, content: &str) -> SqlResult<Note> {
    let conn = Connection::open(db_path)?;

    let note: Note = conn.query_row(
        "SELECT id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at, last_viewed_at, deleted_at 
         FROM notes WHERE id = ?",
        params![id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                relative_path: row.get(3)?,
                folder: row.get(4)?,
                summary: row.get(5)?,
                is_favorite: row.get(6)?,
                is_pinned: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                last_viewed_at: row.get(11)?,
                deleted_at: row.get(12)?,
            })
        },
    )?;

    let file_path = data_dir.join(&note.relative_path);
    if let Err(e) = write_atomic(&file_path, content) {
        log::error!("Failed to write file: {}", e);
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }

    let title = extract_title(content).unwrap_or_else(|| note.title.clone());
    let summary = get_summary(content, 200);
    let now = now_str();

    let updated_note: Note = conn.query_row(
        "UPDATE notes SET title = ?, summary = ?, updated_at = ? WHERE id = ? 
         RETURNING id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at, last_viewed_at, deleted_at",
        params![title, summary, now, id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                relative_path: row.get(3)?,
                folder: row.get(4)?,
                summary: row.get(5)?,
                is_favorite: row.get(6)?,
                is_pinned: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                last_viewed_at: row.get(11)?,
                deleted_at: row.get(12)?,
            })
        },
    )?;

    Ok(updated_note)
}

pub fn list_notes(db_path: &Path, filter: &str, folder: Option<&str>) -> SqlResult<Vec<Note>> {
    let conn = Connection::open(db_path)?;

    let (query, params) = match (filter, folder) {
        ("folder", Some(f)) => (
            "SELECT * FROM notes WHERE folder = ? AND deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC",
            vec![f.to_string()],
        ),
        ("inbox", _) => (
            "SELECT * FROM notes WHERE folder = 'Inbox' AND deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC",
            vec![],
        ),
        ("favorite", _) => (
            "SELECT * FROM notes WHERE is_favorite = 1 AND deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC",
            vec![],
        ),
        ("trash", _) => (
            "SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
            vec![],
        ),
        _ => (
            "SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC",
            vec![],
        ),
    };

    let mut stmt = conn.prepare(query)?;
    let notes_iter = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            file_path: row.get(2)?,
            relative_path: row.get(3)?,
            folder: row.get(4)?,
            summary: row.get(5)?,
            is_favorite: row.get(6)?,
            is_pinned: row.get(7)?,
            status: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            last_viewed_at: row.get(11)?,
            deleted_at: row.get(12)?,
        })
    })?;

    let mut notes = Vec::new();
    for note in notes_iter {
        notes.push(note?);
    }

    Ok(notes)
}

pub fn rename_note(db_path: &Path, data_dir: &Path, id: &str, new_title: &str) -> SqlResult<Note> {
    let conn = Connection::open(db_path)?;

    let note: Note = conn.query_row("SELECT * FROM notes WHERE id = ?", params![id], |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            file_path: row.get(2)?,
            relative_path: row.get(3)?,
            folder: row.get(4)?,
            summary: row.get(5)?,
            is_favorite: row.get(6)?,
            is_pinned: row.get(7)?,
            status: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            last_viewed_at: row.get(11)?,
            deleted_at: row.get(12)?,
        })
    })?;

    let safe_title = sanitize_filename(new_title);
    let safe_title = if safe_title.is_empty() {
        "未命名笔记"
    } else {
        &safe_title
    };

    let old_relative_path = PathBuf::from(&note.relative_path);
    let empty_path = PathBuf::from("");
    let parent_dir = old_relative_path.parent().unwrap_or(&empty_path);
    let new_file_name = format!("{}.md", safe_title);

    let mut new_relative_path = parent_dir.join(&new_file_name);
    let mut counter = 1;
    while new_relative_path == old_relative_path || {
        let full_path = data_dir.join(&new_relative_path);
        full_path.exists()
    } {
        new_relative_path = parent_dir.join(format!("{}_{}.md", safe_title, counter));
        counter += 1;
    }

    let old_full_path = data_dir.join(&old_relative_path);
    let new_full_path = data_dir.join(&new_relative_path);

    std::fs::rename(&old_full_path, &new_full_path)
        .map_err(|_e| rusqlite::Error::ExecuteReturnedResults)?;

    let now = now_str();
    let new_relative_path_str = new_relative_path.to_string_lossy().to_string();

    let result: Note = conn.query_row(
        "UPDATE notes SET title = ?, relative_path = ?, file_path = ?, updated_at = ? WHERE id = ? RETURNING *",
        params![safe_title, new_relative_path_str, new_relative_path_str, now, id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                relative_path: row.get(3)?,
                folder: row.get(4)?,
                summary: row.get(5)?,
                is_favorite: row.get(6)?,
                is_pinned: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                last_viewed_at: row.get(11)?,
                deleted_at: row.get(12)?,
            })
        },
    )?;

    Ok(result)
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn delete_note(db_path: &Path, id: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;

    conn.execute(
        "UPDATE notes SET deleted_at = ?, status = 'deleted' WHERE id = ?",
        params![now_str(), id],
    )?;

    Ok(())
}

pub fn update_note_path(db_path: &Path, old_path: &str, new_path: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;

    let new_folder = match new_path.rfind('/') {
        Some(pos) => new_path[..pos].to_string(),
        None => "".to_string(),
    };

    conn.execute(
        "UPDATE notes SET relative_path = ?, file_path = ?, folder = ?, updated_at = ? WHERE relative_path = ?",
        params![new_path, new_path, new_folder, now_str(), old_path],
    )?;

    Ok(())
}

pub fn update_folder_path(db_path: &Path, old_path: &str, new_path: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;

    let mut stmt = conn.prepare("SELECT relative_path FROM notes WHERE relative_path LIKE ?")?;
    let pattern = format!("{}%", old_path);
    let mut rows = stmt.query(params![pattern])?;

    let mut paths_to_update = Vec::new();
    while let Some(row) = rows.next()? {
        let path: String = row.get(0)?;
        paths_to_update.push(path);
    }

    for old_note_path in paths_to_update {
        let new_note_path = if old_note_path == old_path {
            new_path.to_string()
        } else {
            old_note_path.replacen(old_path, new_path, 1)
        };

        let new_folder = match new_note_path.rfind('/') {
            Some(pos) => new_note_path[..pos].to_string(),
            None => "".to_string(),
        };

        conn.execute(
            "UPDATE notes SET relative_path = ?, file_path = ?, folder = ?, updated_at = ? WHERE relative_path = ?",
            params![new_note_path, new_note_path, new_folder, now_str(), old_note_path],
        )?;
    }

    Ok(())
}

pub fn delete_folder_notes(db_path: &Path, folder_path: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;

    let pattern = format!("{}%", folder_path);
    conn.execute(
        "UPDATE notes SET deleted_at = ?, status = 'deleted' WHERE relative_path LIKE ?",
        params![now_str(), pattern],
    )?;

    Ok(())
}

pub fn delete_note_by_path(db_path: &Path, relative_path: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;

    conn.execute(
        "UPDATE notes SET deleted_at = ?, status = 'deleted' WHERE relative_path = ?",
        params![now_str(), relative_path],
    )?;

    Ok(())
}

pub fn search_notes(db_path: &Path, query: &str) -> SqlResult<Vec<Note>> {
    let conn = Connection::open(db_path)?;

    let pattern = format!("%{}%", query);

    let mut stmt = conn.prepare(
        "SELECT * FROM notes 
         WHERE (title LIKE ? OR summary LIKE ?) AND deleted_at IS NULL 
         ORDER BY is_pinned DESC, updated_at DESC",
    )?;

    let notes_iter = stmt.query_map(params![&pattern, &pattern], |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            file_path: row.get(2)?,
            relative_path: row.get(3)?,
            folder: row.get(4)?,
            summary: row.get(5)?,
            is_favorite: row.get(6)?,
            is_pinned: row.get(7)?,
            status: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            last_viewed_at: row.get(11)?,
            deleted_at: row.get(12)?,
        })
    })?;

    let mut notes = Vec::new();
    for note in notes_iter {
        notes.push(note?);
    }

    Ok(notes)
}

pub fn add_tag(db_path: &Path, note_id: &str, tag_name: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;

    conn.execute(
        "INSERT OR IGNORE INTO tags (name) VALUES (?)",
        params![tag_name],
    )?;

    let tag_id: i64 = conn.query_row(
        "SELECT id FROM tags WHERE name = ?",
        params![tag_name],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
        params![note_id, tag_id],
    )?;

    Ok(())
}

pub fn add_category(db_path: &Path, note_id: &str, category_name: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;

    conn.execute(
        "INSERT OR IGNORE INTO categories (name) VALUES (?)",
        params![category_name],
    )?;

    let category_id: i64 = conn.query_row(
        "SELECT id FROM categories WHERE name = ?",
        params![category_name],
        |row| row.get(0),
    )?;

    conn.execute(
        "UPDATE notes SET category_id = ? WHERE id = ?",
        params![category_id, note_id],
    )?;

    Ok(())
}

pub fn toggle_favorite(db_path: &Path, id: &str) -> SqlResult<Note> {
    let conn = Connection::open(db_path)?;

    let updated_note: Note = conn.query_row(
        "UPDATE notes SET is_favorite = NOT is_favorite, updated_at = ? WHERE id = ? 
         RETURNING id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at, last_viewed_at, deleted_at",
        params![now_str(), id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                relative_path: row.get(3)?,
                folder: row.get(4)?,
                summary: row.get(5)?,
                is_favorite: row.get(6)?,
                is_pinned: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                last_viewed_at: row.get(11)?,
                deleted_at: row.get(12)?,
            })
        },
    )?;

    Ok(updated_note)
}

pub fn toggle_pinned(db_path: &Path, id: &str) -> SqlResult<Note> {
    let conn = Connection::open(db_path)?;

    let updated_note: Note = conn.query_row(
        "UPDATE notes SET is_pinned = NOT is_pinned, updated_at = ? WHERE id = ? 
         RETURNING id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at, last_viewed_at, deleted_at",
        params![now_str(), id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                relative_path: row.get(3)?,
                folder: row.get(4)?,
                summary: row.get(5)?,
                is_favorite: row.get(6)?,
                is_pinned: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                last_viewed_at: row.get(11)?,
                deleted_at: row.get(12)?,
            })
        },
    )?;

    Ok(updated_note)
}

fn map_todo_row(row: &rusqlite::Row<'_>) -> SqlResult<Todo> {
    Ok(Todo {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        completed: row.get(3)?,
        priority: row.get(4)?,
        remind_at: row.get(5)?,
        due_at: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        deleted_at: row.get(9)?,
    })
}

pub fn create_todo(db_path: &Path, request: &CreateTaskRequest) -> SqlResult<Todo> {
    let conn = Connection::open(db_path)?;
    let id = Uuid::new_v4().to_string();
    let now = now_str();
    let title = if request.title.trim().is_empty() {
        "未命名待办".to_string()
    } else {
        request.title.trim().to_string()
    };
    let priority = if request.priority.trim().is_empty() {
        "normal".to_string()
    } else {
        request.priority.trim().to_string()
    };

    conn.query_row(
        "INSERT INTO todos (id, title, content, completed, priority, remind_at, due_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         RETURNING id, title, content, completed, priority, remind_at, due_at, created_at, updated_at, deleted_at",
        params![
            id,
            title,
            request.content,
            false,
            priority,
            request.remind_at,
            request.due_at,
            now,
            now
        ],
        map_todo_row,
    )
}

pub fn list_todos(db_path: &Path, include_deleted: bool) -> SqlResult<Vec<Todo>> {
    let conn = Connection::open(db_path)?;
    let query = if include_deleted {
        "SELECT id, title, content, completed, priority, remind_at, due_at, created_at, updated_at, deleted_at
         FROM todos WHERE deleted_at IS NOT NULL
         ORDER BY deleted_at DESC, updated_at DESC"
    } else {
        "SELECT id, title, content, completed, priority, remind_at, due_at, created_at, updated_at, deleted_at
         FROM todos WHERE deleted_at IS NULL
         ORDER BY completed ASC,
                  CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC,
                  CASE WHEN due_at IS NULL OR due_at = '' THEN 1 ELSE 0 END ASC,
                  due_at ASC,
                  updated_at DESC"
    };

    let mut stmt = conn.prepare(query)?;
    let rows = stmt.query_map([], map_todo_row)?;
    rows.collect()
}

pub fn update_todo(db_path: &Path, request: &UpdateTaskRequest) -> SqlResult<Todo> {
    let conn = Connection::open(db_path)?;
    let now = now_str();
    let title = if request.title.trim().is_empty() {
        "未命名待办".to_string()
    } else {
        request.title.trim().to_string()
    };
    let priority = if request.priority.trim().is_empty() {
        "normal".to_string()
    } else {
        request.priority.trim().to_string()
    };

    conn.query_row(
        "UPDATE todos
         SET title = ?, content = ?, completed = ?, priority = ?, remind_at = ?, due_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL
         RETURNING id, title, content, completed, priority, remind_at, due_at, created_at, updated_at, deleted_at",
        params![
            title,
            request.content,
            request.completed,
            priority,
            request.remind_at,
            request.due_at,
            now,
            request.id
        ],
        map_todo_row,
    )
}

pub fn delete_todo(db_path: &Path, id: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;
    conn.execute(
        "UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        params![now_str(), now_str(), id],
    )?;
    Ok(())
}

pub fn restore_todo(db_path: &Path, id: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;
    conn.execute(
        "UPDATE todos SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL",
        params![now_str(), id],
    )?;
    Ok(())
}

pub fn permanently_delete_todo(db_path: &Path, id: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;
    conn.execute("DELETE FROM todos WHERE id = ?", params![id])?;
    Ok(())
}

pub fn scan_and_sync_notes(db_path: &Path, data_dir: &Path) {
    let notes_dir = data_dir.join("Notes");
    if !notes_dir.exists() {
        return;
    }

    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to open database: {}", e);
            return;
        }
    };

    let folders = vec!["", "Inbox", "Projects"];

    for folder in folders {
        let folder_path = if folder.is_empty() {
            notes_dir.clone()
        } else {
            notes_dir.join(folder)
        };

        if !folder_path.exists() {
            continue;
        }

        let entries = match fs::read_dir(&folder_path) {
            Ok(e) => e,
            Err(e) => {
                log::error!("Failed to read directory {}: {}", folder_path.display(), e);
                continue;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext != "md" {
                continue;
            }

            let file_name = path.file_stem().and_then(|n| n.to_str()).unwrap_or("");
            if !is_valid_uuid(file_name) {
                continue;
            }

            let id = file_name.to_string();
            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Failed to read file {}: {}", path.display(), e);
                    continue;
                }
            };

            let relative_path = match path.strip_prefix(data_dir) {
                Ok(p) => p.to_string_lossy().to_string(),
                Err(e) => {
                    log::error!("Failed to get relative path for {}: {}", path.display(), e);
                    continue;
                }
            };

            let title = extract_title(&content).unwrap_or_else(|| file_name.to_string());
            let summary = get_summary(&content, 200);
            let now = now_str();

            let mut stmt = match conn
                .prepare("SELECT COUNT(*) FROM notes WHERE id = ? AND deleted_at IS NULL")
            {
                Ok(s) => s,
                Err(e) => {
                    log::error!("Failed to prepare query: {}", e);
                    continue;
                }
            };

            let count: i64 = match stmt.query_row(params![&id], |row| row.get(0)) {
                Ok(c) => c,
                Err(_) => 0,
            };

            if count == 0 {
                match conn.execute(
                    "INSERT INTO notes (id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    params![
                        id,
                        title,
                        relative_path,
                        relative_path,
                        folder,
                        summary,
                        false,
                        false,
                        "active",
                        now,
                        now,
                    ],
                ) {
                    Ok(_) => log::info!("Scanned and added note: {}", path.display()),
                    Err(e) => log::error!("Failed to insert note {}: {}", path.display(), e),
                }
            }
        }
    }
}

fn is_valid_uuid(s: &str) -> bool {
    uuid::Uuid::parse_str(s).is_ok()
}
