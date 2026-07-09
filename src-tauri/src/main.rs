#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use log::{info, error};
use rusqlite::{Connection, Result as SqlResult};
use std::path::{Path, PathBuf};
use tauri::command;

mod db;
mod fs;
mod logger;
mod types;

use types::{ApiResponse, AppState, CreateNoteRequest, RenameNoteRequest, SearchRequest, UpdateNoteRequest};
use db::Note;

fn get_data_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("MiniNotes")
}

fn init_data_directory(data_dir: &Path) -> SqlResult<()> {
    let dirs = [
        "Notes/Inbox",
        "Notes/Projects",
        "Attachments/images",
        "Attachments/files",
        "database",
        "backups",
        "settings",
        "logs",
        "temp",
    ];

    for dir in dirs.iter() {
        let full_path = data_dir.join(dir);
        if !full_path.exists() {
            std::fs::create_dir_all(&full_path).map_err(|e| {
                rusqlite::Error::QueryReturnedNoRows
            })?;
            info!("[DIR] 创建目录: {}", full_path.display());
        }
    }
    Ok(())
}

fn init_database(db_path: &Path) -> SqlResult<()> {
    let conn = rusqlite::Connection::open(db_path)?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            executed_at TEXT NOT NULL,
            success BOOLEAN NOT NULL
        )",
        [],
    )?;

    db::run_migrations(&conn)?;
    
    info!("[DB] SQLite 初始化完成: {}", db_path.display());
    Ok(())
}

#[command]
fn init_app() -> ApiResponse<AppState> {
    logger::init();
    info!("[APP] 应用启动");

    let data_dir = get_data_dir();
    
    match init_data_directory(&data_dir) {
        Ok(_) => info!("[DIR] 数据目录初始化完成"),
        Err(e) => {
            error!("[DIR] 数据目录初始化失败: {}", e);
            return ApiResponse {
                success: false,
                message: format!("数据目录初始化失败: {}", e),
                data: None,
            };
        }
    }

    let db_path = data_dir.join("database").join("index.db");
    
    match init_database(&db_path) {
        Ok(_) => info!("[DB] 数据库初始化完成"),
        Err(e) => {
            error!("[DB] 数据库初始化失败: {}", e);
            return ApiResponse {
                success: false,
                message: format!("数据库初始化失败: {}", e),
                data: None,
            };
        }
    }

    db::scan_and_sync_notes(&db_path, &data_dir);
    info!("[SCAN] 文件扫描同步完成");

    ApiResponse {
        success: true,
        message: "应用初始化成功".to_string(),
        data: Some(AppState {
            data_dir: data_dir.to_string_lossy().to_string(),
            db_path: db_path.to_string_lossy().to_string(),
        }),
    }
}

#[command]
fn create_note(request: CreateNoteRequest) -> ApiResponse<Note> {
    info!("[NOTE] create_note command called");
    
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    info!("[NOTE] data_dir: {}, db_path: {}", data_dir.display(), db_path.display());
    
    let notes_root_dir = match get_notes_root_dir(&db_path) {
        Ok(path) => {
            info!("[NOTE] notes_root_dir: {}", path.display());
            path
        }
        Err(e) => {
            error!("[ERROR] [NOTE] create_note failed: 获取笔记根目录失败: {}", e);
            return ApiResponse {
                success: false,
                message: "获取笔记根目录失败".to_string(),
                data: None,
            };
        }
    };
    
    match db::create_note(&db_path, &notes_root_dir, &request) {
        Ok(note) => {
            info!("[NOTE] create_note command success: note_id={}, title={}", note.id, note.title);
            ApiResponse {
                success: true,
                message: "笔记创建成功".to_string(),
                data: Some(note),
            }
        }
        Err(e) => {
            error!("[ERROR] [NOTE] create_note failed: {}", e);
            ApiResponse {
                success: false,
                message: format!("笔记创建失败: {}", e),
                data: None,
            }
        }
    }
}

#[command]
fn get_note(id: String) -> ApiResponse<Note> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    match db::get_note(&db_path, &id) {
        Ok(note) => ApiResponse {
            success: true,
            message: "获取笔记成功".to_string(),
            data: Some(note),
        },
        Err(e) => ApiResponse {
            success: false,
            message: format!("获取笔记失败: {}", e),
            data: None,
        },
    }
}

#[command]
fn update_note(request: UpdateNoteRequest) -> ApiResponse<Note> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    let notes_root_dir = match get_notes_root_dir(&db_path) {
        Ok(path) => path,
        Err(e) => {
            error!("[NOTE] 获取笔记根目录失败: {}", e);
            return ApiResponse {
                success: false,
                message: "获取笔记根目录失败".to_string(),
                data: None,
            };
        }
    };
    
    match db::update_note(&db_path, &notes_root_dir, &request.id, &request.content) {
        Ok(note) => {
            info!("[NOTE] 笔记更新成功: {}", note.id);
            ApiResponse {
                success: true,
                message: "笔记更新成功".to_string(),
                data: Some(note),
            }
        }
        Err(e) => {
            error!("[NOTE] 笔记更新失败: {}", e);
            ApiResponse {
                success: false,
                message: format!("笔记更新失败: {}", e),
                data: None,
            }
        }
    }
}

#[command]
fn list_notes(filter: String, folder: Option<String>) -> ApiResponse<Vec<Note>> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    let folder_str = folder.as_deref();
    
    match db::list_notes(&db_path, &filter, folder_str) {
        Ok(notes) => ApiResponse {
            success: true,
            message: "获取笔记列表成功".to_string(),
            data: Some(notes),
        },
        Err(e) => ApiResponse {
            success: false,
            message: format!("获取笔记列表失败: {}", e),
            data: None,
        },
    }
}

#[command]
fn delete_note(id: String) -> ApiResponse<()> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    match db::delete_note(&db_path, &id) {
        Ok(_) => {
            info!("[NOTE] 笔记删除成功: {}", id);
            ApiResponse {
                success: true,
                message: "笔记已移至回收站".to_string(),
                data: None,
            }
        }
        Err(e) => {
            error!("[NOTE] 笔记删除失败: {}", e);
            ApiResponse {
                success: false,
                message: format!("笔记删除失败: {}", e),
                data: None,
            }
        }
    }
}

#[command]
fn search_notes(request: SearchRequest) -> ApiResponse<Vec<Note>> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    match db::search_notes(&db_path, &request.query) {
        Ok(notes) => ApiResponse {
            success: true,
            message: "搜索完成".to_string(),
            data: Some(notes),
        },
        Err(e) => ApiResponse {
            success: false,
            message: format!("搜索失败: {}", e),
            data: None,
        },
    }
}

#[command]
fn add_tag(note_id: String, tag_name: String) -> ApiResponse<()> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    match db::add_tag(&db_path, &note_id, &tag_name) {
        Ok(_) => ApiResponse {
            success: true,
            message: "标签添加成功".to_string(),
            data: None,
        },
        Err(e) => ApiResponse {
            success: false,
            message: format!("标签添加失败: {}", e),
            data: None,
        },
    }
}

#[command]
fn add_category(note_id: String, category_name: String) -> ApiResponse<()> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    match db::add_category(&db_path, &note_id, &category_name) {
        Ok(_) => ApiResponse {
            success: true,
            message: "分类添加成功".to_string(),
            data: None,
        },
        Err(e) => ApiResponse {
            success: false,
            message: format!("分类添加失败: {}", e),
            data: None,
        },
    }
}

#[command]
fn toggle_favorite(id: String) -> ApiResponse<Note> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    match db::toggle_favorite(&db_path, &id) {
        Ok(note) => ApiResponse {
            success: true,
            message: format!("收藏状态已{}", if note.is_favorite { "开启" } else { "关闭" }),
            data: Some(note),
        },
        Err(e) => ApiResponse {
            success: false,
            message: format!("操作失败: {}", e),
            data: None,
        },
    }
}

#[command]
fn toggle_pinned(id: String) -> ApiResponse<Note> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    match db::toggle_pinned(&db_path, &id) {
        Ok(note) => ApiResponse {
            success: true,
            message: format!("置顶状态已{}", if note.is_pinned { "开启" } else { "关闭" }),
            data: Some(note),
        },
        Err(e) => ApiResponse {
            success: false,
            message: format!("操作失败: {}", e),
            data: None,
        },
    }
}

#[command]
fn import_image(note_id: String, base64_data: String) -> ApiResponse<String> {
    let data_dir = get_data_dir();
    
    match fs::import_image(&data_dir, &note_id, &base64_data) {
        Ok(relative_path) => {
            info!("[ATTACHMENT] 图片导入成功: {}", relative_path);
            ApiResponse {
                success: true,
                message: "图片导入成功".to_string(),
                data: Some(relative_path),
            }
        }
        Err(e) => {
            error!("[ATTACHMENT] 图片导入失败: {}", e);
            ApiResponse {
                success: false,
                message: format!("图片导入失败: {}", e),
                data: None,
            }
        }
    }
}

#[command]
fn import_file(note_id: String, file_path: String) -> ApiResponse<String> {
    let data_dir = get_data_dir();
    
    match fs::import_file(&data_dir, &note_id, &file_path) {
        Ok(relative_path) => {
            info!("[ATTACHMENT] 文件导入成功: {}", relative_path);
            ApiResponse {
                success: true,
                message: "文件导入成功".to_string(),
                data: Some(relative_path),
            }
        }
        Err(e) => {
            error!("[ATTACHMENT] 文件导入失败: {}", e);
            ApiResponse {
                success: false,
                message: format!("文件导入失败: {}", e),
                data: None,
            }
        }
    }
}

#[command]
fn read_note_content(relative_path: String) -> ApiResponse<String> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    let notes_root_dir = match get_notes_root_dir(&db_path) {
        Ok(path) => path,
        Err(e) => {
            error!("[FILE] 获取笔记根目录失败: {}", e);
            return ApiResponse {
                success: false,
                message: "获取笔记根目录失败".to_string(),
                data: None,
            };
        }
    };
    
    let file_path = notes_root_dir.join(&relative_path);
    
    match std::fs::read_to_string(&file_path) {
        Ok(content) => ApiResponse {
            success: true,
            message: "读取成功".to_string(),
            data: Some(content),
        },
        Err(e) => {
            error!("[FILE] 读取文件失败: {}", e);
            ApiResponse {
                success: false,
                message: format!("读取文件失败: {}", e),
                data: None,
            }
        }
    }
}

fn get_notes_root_dir(db_path: &Path) -> SqlResult<PathBuf> {
    let conn = Connection::open(db_path)?;
    
    if let Some(path_str) = db::get_setting(&conn, "notes_root_dir")? {
        Ok(PathBuf::from(path_str))
    } else {
        let default = get_data_dir().join("Notes");
        Ok(default)
    }
}

#[command]
fn get_workspace_info() -> ApiResponse<serde_json::Value> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    let notes_root_dir = match get_notes_root_dir(&db_path) {
        Ok(path) => path,
        Err(e) => {
            error!("[WORKSPACE] 获取笔记根目录失败: {}", e);
            return ApiResponse {
                success: false,
                message: "获取工作区信息失败".to_string(),
                data: None,
            };
        }
    };
    
    ApiResponse {
        success: true,
        message: "获取工作区信息成功".to_string(),
        data: Some(serde_json::json!({
            "data_dir": data_dir.to_string_lossy().to_string(),
            "notes_root_dir": notes_root_dir.to_string_lossy().to_string(),
            "database_path": db_path.to_string_lossy().to_string(),
        })),
    }
}

#[command]
fn set_notes_root_dir(path: String) -> ApiResponse<serde_json::Value> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    let dir_path = PathBuf::from(&path);
    
    if !dir_path.exists() {
        return ApiResponse {
            success: false,
            message: "路径不存在".to_string(),
            data: None,
        };
    }
    
    if !dir_path.is_dir() {
        return ApiResponse {
            success: false,
            message: "路径不是目录".to_string(),
            data: None,
        };
    }
    
    match std::fs::read_dir(&dir_path) {
        Ok(_) => (),
        Err(e) => {
            return ApiResponse {
                success: false,
                message: format!("目录不可读: {}", e),
                data: None,
            };
        }
    }
    
    let test_file = dir_path.join(".mininotes_test");
    match std::fs::write(&test_file, "test") {
        Ok(_) => {
            let _ = std::fs::remove_file(&test_file);
        }
        Err(e) => {
            return ApiResponse {
                success: false,
                message: format!("目录不可写: {}", e),
                data: None,
            };
        }
    }
    
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            error!("[WORKSPACE] 打开数据库失败: {}", e);
            return ApiResponse {
                success: false,
                message: "打开数据库失败".to_string(),
                data: None,
            };
        }
    };
    
    if let Err(e) = db::set_setting(&conn, "notes_root_dir", &path) {
        error!("[WORKSPACE] 保存设置失败: {}", e);
        return ApiResponse {
            success: false,
            message: "保存设置失败".to_string(),
            data: None,
        };
    }
    
    db::scan_and_sync_notes(&db_path, &dir_path);
    
    info!("[WORKSPACE] 笔记根目录已设置: {}", path);
    
    get_workspace_info()
}

#[command]
fn scan_notes() -> ApiResponse<serde_json::Value> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    let notes_root_dir = match get_notes_root_dir(&db_path) {
        Ok(path) => path,
        Err(e) => {
            error!("[SCAN] 获取笔记根目录失败: {}", e);
            return ApiResponse {
                success: false,
                message: "获取笔记根目录失败".to_string(),
                data: None,
            };
        }
    };
    
    db::scan_and_sync_notes(&db_path, &notes_root_dir);
    
    ApiResponse {
        success: true,
        message: "扫描完成".to_string(),
        data: Some(serde_json::json!({
            "notes_root_dir": notes_root_dir.to_string_lossy().to_string(),
        })),
    }
}

#[command]
fn get_file_tree() -> ApiResponse<Vec<types::FileTreeNode>> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    let notes_root_dir = match get_notes_root_dir(&db_path) {
        Ok(path) => path,
        Err(e) => {
            error!("[FILE_TREE] 获取笔记根目录失败: {}", e);
            return ApiResponse {
                success: false,
                message: "获取笔记根目录失败".to_string(),
                data: None,
            };
        }
    };
    
    match fs::get_file_tree(&notes_root_dir) {
        Ok(tree) => ApiResponse {
            success: true,
            message: "获取文件树成功".to_string(),
            data: Some(tree),
        },
        Err(e) => {
            error!("[FILE_TREE] 获取文件树失败: {}", e);
            ApiResponse {
                success: false,
                message: format!("获取文件树失败: {}", e),
                data: None,
            }
        }
    }
}

#[command]
fn rename_note(request: RenameNoteRequest) -> ApiResponse<Note> {
    let data_dir = get_data_dir();
    let db_path = data_dir.join("database").join("index.db");
    
    let notes_root_dir = match get_notes_root_dir(&db_path) {
        Ok(path) => path,
        Err(e) => {
            error!("[RENAME] 获取笔记根目录失败: {}", e);
            return ApiResponse {
                success: false,
                message: "获取笔记根目录失败".to_string(),
                data: None,
            };
        }
    };
    
    match db::rename_note(&db_path, &notes_root_dir, &request.id, &request.new_title) {
        Ok(note) => {
            info!("[RENAME] 笔记重命名成功: {} -> {}", request.id, note.title);
            ApiResponse {
                success: true,
                message: "笔记重命名成功".to_string(),
                data: Some(note),
            }
        }
        Err(e) => {
            error!("[RENAME] 笔记重命名失败: {}", e);
            ApiResponse {
                success: false,
                message: format!("笔记重命名失败: {}", e),
                data: None,
            }
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            init_app,
            create_note,
            get_note,
            update_note,
            list_notes,
            delete_note,
            search_notes,
            add_tag,
            add_category,
            toggle_favorite,
            toggle_pinned,
            import_image,
            import_file,
            read_note_content,
            get_workspace_info,
            set_notes_root_dir,
            scan_notes,
            get_file_tree,
            rename_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}