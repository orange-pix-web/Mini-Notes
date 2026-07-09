use chrono::Local;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

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

    Ok(())
}

fn get_summary(content: &str, max_len: usize) -> String {
    let text = content.replace('\n', " ").replace('\r', "");
    if text.len() > max_len {
        text[..max_len].to_string() + "..."
    } else {
        text
    }
}

pub fn create_note(db_path: &Path, data_dir: &Path, request: &CreateNoteRequest) -> SqlResult<Note> {
    let conn = Connection::open(db_path)?;
    let id = Uuid::new_v4().to_string();
    
    let folder = if request.folder.is_empty() { "Inbox" } else { &request.folder };
    let file_name = format!("{}.md", id);
    let relative_path = PathBuf::from("Notes").join(folder).join(&file_name);
    let file_path = data_dir.join(&relative_path);

    match fs::write(&file_path, &request.content) {
        Ok(_) => (),
        Err(e) => return Err(rusqlite::Error::QueryReturnedNoRows),
    }

    let summary = get_summary(&request.content, 200);
    let now = now_str();

    let result: Note = conn.query_row(
        "INSERT INTO notes (id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
         RETURNING id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at, last_viewed_at, deleted_at",
        params![
            id,
            request.title,
            file_path.to_string_lossy(),
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
    match fs::write(&file_path, content) {
        Ok(_) => (),
        Err(e) => return Err(rusqlite::Error::QueryReturnedNoRows),
    }

    let summary = get_summary(content, 200);
    let now = now_str();

    let updated_note: Note = conn.query_row(
        "UPDATE notes SET summary = ?, updated_at = ? WHERE id = ? 
         RETURNING id, title, file_path, relative_path, folder, summary, is_favorite, is_pinned, status, created_at, updated_at, last_viewed_at, deleted_at",
        params![summary, now, id],
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

pub fn list_notes(db_path: &Path, filter: &str) -> SqlResult<Vec<Note>> {
    let conn = Connection::open(db_path)?;
    
    let query = match filter {
        "inbox" => "SELECT * FROM notes WHERE folder = 'Inbox' AND deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC",
        "favorite" => "SELECT * FROM notes WHERE is_favorite = 1 AND deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC",
        "trash" => "SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
        _ => "SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC",
    };

    let mut stmt = conn.prepare(query)?;
    let notes_iter = stmt.query_map([], |row| {
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

pub fn delete_note(db_path: &Path, id: &str) -> SqlResult<()> {
    let conn = Connection::open(db_path)?;
    
    conn.execute(
        "UPDATE notes SET deleted_at = ?, status = 'deleted' WHERE id = ?",
        params![now_str(), id],
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