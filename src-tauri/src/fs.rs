use base64::engine::{general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;
use walkdir::WalkDir;

fn get_modified_at(path: &Path) -> Option<String> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .map(|modified| DateTime::<Utc>::from(modified).to_rfc3339())
}

pub fn get_file_tree(root_dir: &Path) -> std::io::Result<Vec<crate::types::FileTreeNode>> {
    let mut folder_nodes: HashMap<String, crate::types::FileTreeNode> = HashMap::new();
    let mut files: HashMap<String, Vec<crate::types::FileTreeNode>> = HashMap::new();
    let mut all_folder_paths: Vec<String> = Vec::new();

    for entry in WalkDir::new(root_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let relative_path = path.strip_prefix(root_dir).unwrap_or(path);

        if relative_path.components().count() == 0 {
            continue;
        }

        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if file_name.starts_with('.')
            || file_name == "node_modules"
            || file_name == ".git"
            || file_name == ".trash"
        {
            continue;
        }

        let rel_path_str = relative_path.to_string_lossy().to_string();

        if entry.file_type().is_dir() {
            let folder_node = crate::types::FileTreeNode {
                name: file_name.to_string(),
                relative_path: rel_path_str.clone(),
                node_type: "folder".to_string(),
                modified_at: get_modified_at(path),
                children: Vec::new(),
            };
            folder_nodes.insert(rel_path_str.clone(), folder_node);
            all_folder_paths.push(rel_path_str);
        } else if entry.file_type().is_file()
            && path.extension().and_then(|e| e.to_str()) == Some("md")
        {
            let parent_dir = if let Some(p) = relative_path.parent() {
                p.to_string_lossy().to_string()
            } else {
                String::new()
            };

            let node = crate::types::FileTreeNode {
                name: file_name.to_string(),
                relative_path: rel_path_str,
                node_type: "note".to_string(),
                modified_at: get_modified_at(path),
                children: Vec::new(),
            };

            files.entry(parent_dir).or_insert_with(Vec::new).push(node);
        }
    }

    let mut root_files: Vec<crate::types::FileTreeNode> = Vec::new();
    for (parent_path, file_list) in files {
        if parent_path.is_empty() {
            root_files.extend(file_list);
        } else if let Some(parent_node) = folder_nodes.get_mut(&parent_path) {
            parent_node.children.extend(file_list);
        }
    }

    all_folder_paths.sort_by(|a, b| b.len().cmp(&a.len()));

    for folder_path in all_folder_paths {
        let parent_path = if let Some(p) = Path::new(&folder_path).parent() {
            p.to_string_lossy().to_string()
        } else {
            String::new()
        };

        if folder_nodes.contains_key(&parent_path) {
            let child_folder = folder_nodes.remove(&folder_path);
            if let Some(child) = child_folder {
                if let Some(parent_node) = folder_nodes.get_mut(&parent_path) {
                    parent_node.children.push(child);
                }
            }
        }
    }

    let mut tree: Vec<crate::types::FileTreeNode> = folder_nodes.into_values().collect();
    tree.extend(root_files);
    log::info!("[FILE_TREE] root nodes count: {}", tree.len());
    for node in &tree {
        log::info!(
            "[FILE_TREE] root node: {} ({}) children: {}",
            node.name,
            node.relative_path,
            node.children.len()
        );
        for child in &node.children {
            log::info!(
                "[FILE_TREE]   child: {} ({}) type: {}",
                child.name,
                child.relative_path,
                child.node_type
            );
        }
    }

    tree.sort_by(|a, b| {
        let type_order = |t: &str| if t == "folder" { 0 } else { 1 };
        match (type_order(&a.node_type), type_order(&b.node_type)) {
            (0, 1) => std::cmp::Ordering::Less,
            (1, 0) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(tree)
}

pub fn write_atomic(file_path: &Path, content: &str) -> std::io::Result<()> {
    let temp_path = file_path.with_extension("md.tmp");

    let mut file = fs::File::create(&temp_path)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;

    fs::rename(&temp_path, file_path)?;

    Ok(())
}

pub fn import_image(data_dir: &Path, _note_id: &str, base64_data: &str) -> std::io::Result<String> {
    let decoded = general_purpose::STANDARD.decode(base64_data).map_err(|e| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("Base64 decode error: {}", e),
        )
    })?;

    let hash = Sha256::digest(&decoded);
    let hash_str = format!("{:x}", hash);

    let extension = "png";
    let file_name = format!("{}.{}", &hash_str[..16], extension);

    let images_dir = data_dir.join("Attachments").join("images");
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir)?;
    }

    let file_path = images_dir.join(&file_name);
    fs::write(&file_path, &decoded)?;

    let relative_path = format!("Attachments/images/{}", file_name);
    Ok(relative_path)
}

pub fn import_file(data_dir: &Path, _note_id: &str, source_path: &str) -> std::io::Result<String> {
    let source = Path::new(source_path);
    let _file_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");

    let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("");
    let name_without_ext = source
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("file");

    let content = fs::read(source)?;
    let hash = Sha256::digest(&content);
    let hash_str = format!("{:x}", hash);

    let stored_name = if extension.is_empty() {
        format!("{}_{}", name_without_ext, &hash_str[..8])
    } else {
        format!("{}_{}.{}", name_without_ext, &hash_str[..8], extension)
    };

    let files_dir = data_dir.join("Attachments").join("files");
    if !files_dir.exists() {
        fs::create_dir_all(&files_dir)?;
    }

    let file_path = files_dir.join(&stored_name);
    fs::write(&file_path, &content)?;

    let relative_path = format!("Attachments/files/{}", stored_name);
    Ok(relative_path)
}
