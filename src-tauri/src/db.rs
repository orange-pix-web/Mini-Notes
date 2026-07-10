use chrono::Local;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::fs::write_atomic;
use crate::types::CreateNoteRequest;

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

fn now_str() -> String {
    Local::now().to_rfc3339()
}

pub fn run_migrations(conn: &Connection) -> SqlResult<()> {
    let migrations = [
        include_str!("../migrations/0001_initial.sql"),
        include_str!("../migrations/0002_add_tasks.sql"),
        include_str!("../migrations/0003_add_note_links.sql"),
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

pub fn create_note(db_path: &Path, data_dir: &Path, request: &CreateNoteRequest) -> SqlResult<Note> {
    log::info!("[NOTE] 开始创建笔记");
    
    let conn = Connection::open(db_path)?;
    let id = Uuid::new_v4().to_string();
    
    let folder = if request.folder.is_empty() { "Inbox" } else { &request.folder };
    let folder_path = data_dir.join(folder);
    
    if let Err(e) = fs::create_dir_all(&folder_path) {
        log::error!("[ERROR] [NOTE] create_note failed: 创建目录失败: {}", e);
        return Err(rusqlite::Error::QueryReturnedNoRows);
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
        (format!("未命名{}.md", next_index), format!("未命名{}", next_index))
    };
    
    let relative_path = PathBuf::from(folder).join(&file_name);
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
    
    let note: Note = conn.query_row(
        "SELECT * FROM notes WHERE id = ?",
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
    
    let safe_title = sanitize_filename(new_title);
    let safe_title = if safe_title.is_empty() { "未命名笔记" } else { &safe_title };
    
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
    
    std::fs::rename(&old_full_path, &new_full_path).map_err(|e| {
        rusqlite::Error::ExecuteReturnedResults
    })?;
    
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

            let mut stmt = match conn.prepare(
                "SELECT COUNT(*) FROM notes WHERE id = ? AND deleted_at IS NULL"
            ) {
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