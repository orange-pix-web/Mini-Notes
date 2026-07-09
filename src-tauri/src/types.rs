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
pub struct UpdateNoteRequest {
    pub id: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchRequest {
    pub query: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileTreeNode {
    pub name: String,
    pub relative_path: String,
    pub node_type: String,
    pub children: Vec<FileTreeNode>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameNoteRequest {
    pub id: String,
    pub new_title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub message: String,
    pub data: Option<T>,
}