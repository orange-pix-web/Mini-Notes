use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AppState {
    pub data_dir: String,
    pub db_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct CreateNoteRequest {
    pub title: String,
    pub content: String,
    pub folder: String,
}

impl Default for CreateNoteRequest {
    fn default() -> Self {
        CreateNoteRequest {
            title: String::new(),
            content: String::new(),
            folder: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(default)]
#[allow(dead_code)]
pub struct CreateFolderRequest {
    pub name: String,
    pub parent_folder: String,
}

impl Default for CreateFolderRequest {
    fn default() -> Self {
        CreateFolderRequest {
            name: String::new(),
            parent_folder: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateNoteRequest {
    pub id: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchRequest {
    pub query: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct CreateTaskRequest {
    pub title: String,
    pub content: String,
    pub priority: String,
    pub remind_at: Option<String>,
    pub due_at: Option<String>,
}

impl Default for CreateTaskRequest {
    fn default() -> Self {
        CreateTaskRequest {
            title: String::new(),
            content: String::new(),
            priority: "normal".to_string(),
            remind_at: None,
            due_at: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct UpdateTaskRequest {
    pub id: String,
    pub title: String,
    pub content: String,
    pub completed: bool,
    pub priority: String,
    pub remind_at: Option<String>,
    pub due_at: Option<String>,
}

impl Default for UpdateTaskRequest {
    fn default() -> Self {
        UpdateTaskRequest {
            id: String::new(),
            title: String::new(),
            content: String::new(),
            completed: false,
            priority: "normal".to_string(),
            remind_at: None,
            due_at: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileTreeNode {
    pub name: String,
    pub relative_path: String,
    pub node_type: String,
    pub modified_at: Option<String>,
    pub children: Vec<FileTreeNode>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameNoteRequest {
    pub id: String,
    pub new_title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameFolderRequest {
    pub old_path: String,
    pub new_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub message: String,
    pub data: Option<T>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNotePayload {
    pub title: String,
    pub relative_path: String,
    pub folder: String,
    pub content: String,
}
