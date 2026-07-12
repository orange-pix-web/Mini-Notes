use base64::engine::{general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::ffi::OsStr;
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

pub fn get_attachment_tree(
    root_dir: &Path,
) -> std::io::Result<Vec<crate::types::AttachmentFolderNode>> {
    let mut folder_nodes: HashMap<String, crate::types::AttachmentFolderNode> = HashMap::new();
    let mut all_folder_paths: Vec<String> = Vec::new();

    for entry in WalkDir::new(root_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let relative_path = path.strip_prefix(root_dir).unwrap_or(path);

        if relative_path.components().count() == 0 || !entry.file_type().is_dir() {
            continue;
        }

        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if file_name.starts_with('.') || file_name == "node_modules" || file_name == ".git" {
            continue;
        }

        let rel_path_str = relative_path.to_string_lossy().to_string();
        let folder_node = crate::types::AttachmentFolderNode {
            name: file_name.to_string(),
            relative_path: rel_path_str.clone(),
            modified_at: get_modified_at(path),
            children: Vec::new(),
        };
        folder_nodes.insert(rel_path_str.clone(), folder_node);
        all_folder_paths.push(rel_path_str);
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

    let mut tree: Vec<crate::types::AttachmentFolderNode> = folder_nodes.into_values().collect();
    tree.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(tree)
}

fn is_image_extension(extension: Option<&OsStr>) -> bool {
    matches!(
        extension
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase()),
        Some(ref ext)
            if matches!(
                ext.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "avif"
            )
    )
}

pub fn list_attachment_items(
    root_dir: &Path,
    relative_path: &str,
) -> std::io::Result<Vec<crate::types::AttachmentItem>> {
    let target_dir = if relative_path.is_empty() {
        root_dir.to_path_buf()
    } else {
        root_dir.join(relative_path)
    };

    let mut items = Vec::new();
    for entry in fs::read_dir(&target_dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if file_name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata()?;
        let rel_path = path
            .strip_prefix(root_dir)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase());
        let item_type = if metadata.is_dir() {
            "folder".to_string()
        } else if is_image_extension(path.extension()) {
            "image".to_string()
        } else {
            "file".to_string()
        };

        items.push(crate::types::AttachmentItem {
            name: file_name.to_string(),
            relative_path: rel_path,
            absolute_path: path.to_string_lossy().to_string(),
            item_type,
            extension,
            size: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
            modified_at: get_modified_at(&path),
        });
    }

    items.sort_by(|a, b| match (&a.item_type[..], &b.item_type[..]) {
        ("folder", "folder") => a.name.cmp(&b.name),
        ("folder", _) => std::cmp::Ordering::Less,
        (_, "folder") => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(items)
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

pub fn import_attachment_sources(
    attachments_root: &Path,
    target_folder: &str,
    file_paths: &[String],
) -> std::io::Result<Vec<crate::types::AttachmentItem>> {
    let target_dir = if target_folder.is_empty() {
        attachments_root.to_path_buf()
    } else {
        attachments_root.join(target_folder)
    };

    if !target_dir.exists() {
        fs::create_dir_all(&target_dir)?;
    }

    let mut imported_items = Vec::new();
    for source_path in file_paths {
        let source = Path::new(source_path);
        if !source.exists() || !source.is_file() {
            continue;
        }

        let extension = source
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase());
        let file_stem = source
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("file");
        let original_name = source
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("file");

        let mut candidate_name = original_name.to_string();
        let mut target_path = target_dir.join(&candidate_name);
        let mut counter = 1;
        while target_path.exists() {
            candidate_name = if let Some(ext) = &extension {
                format!("{}_{}.{}", file_stem, counter, ext)
            } else {
                format!("{}_{}", file_stem, counter)
            };
            target_path = target_dir.join(&candidate_name);
            counter += 1;
        }

        fs::copy(source, &target_path)?;
        let metadata = fs::metadata(&target_path)?;
        let rel_path = target_path
            .strip_prefix(attachments_root)
            .unwrap_or(&target_path)
            .to_string_lossy()
            .to_string();

        let item_type = if is_image_extension(target_path.extension()) {
            "image".to_string()
        } else {
            "file".to_string()
        };

        imported_items.push(crate::types::AttachmentItem {
            name: candidate_name,
            relative_path: rel_path,
            absolute_path: target_path.to_string_lossy().to_string(),
            item_type,
            extension,
            size: Some(metadata.len()),
            modified_at: get_modified_at(&target_path),
        });
    }

    Ok(imported_items)
}

pub fn move_attachment_items(
    attachments_root: &Path,
    source_paths: &[String],
    target_folder: &str,
) -> std::io::Result<Vec<String>> {
    let target_dir = if target_folder.is_empty() {
        attachments_root.to_path_buf()
    } else {
        attachments_root.join(target_folder)
    };

    if !target_dir.exists() || !target_dir.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "目标文件夹不存在",
        ));
    }

    let mut normalized_sources = source_paths.to_vec();
    normalized_sources.sort_by_key(|path| path.len());
    normalized_sources.dedup();
    let filtered_sources = normalized_sources
        .iter()
        .filter(|path| {
            !normalized_sources
                .iter()
                .any(|candidate| candidate != *path && path.starts_with(&format!("{candidate}/")))
        })
        .cloned()
        .collect::<Vec<_>>();
    normalized_sources = filtered_sources;

    let mut moved_paths = Vec::new();

    for source_path in normalized_sources {
        let source_full_path = attachments_root.join(&source_path);
        if !source_full_path.exists() {
            continue;
        }

        if target_folder == source_path
            || (!target_folder.is_empty() && target_folder.starts_with(&format!("{source_path}/")))
        {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "不能将文件夹移动到其自身或子目录中",
            ));
        }

        let item_name = source_full_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("item");

        let file_stem = source_full_path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("item");
        let extension = source_full_path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_string());

        let mut candidate_name = item_name.to_string();
        let mut target_path = target_dir.join(&candidate_name);
        let mut counter = 1;
        while target_path.exists() {
            candidate_name = if source_full_path.is_file() {
                match &extension {
                    Some(ext) if !ext.is_empty() => format!("{}_{}.{}", file_stem, counter, ext),
                    _ => format!("{}_{}", file_stem, counter),
                }
            } else {
                format!("{}_{}", file_stem, counter)
            };
            target_path = target_dir.join(&candidate_name);
            counter += 1;
        }

        fs::rename(&source_full_path, &target_path)?;
        moved_paths.push(
            target_path
                .strip_prefix(attachments_root)
                .unwrap_or(&target_path)
                .to_string_lossy()
                .to_string(),
        );
    }

    Ok(moved_paths)
}
