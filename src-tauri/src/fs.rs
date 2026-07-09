use base64::engine::{general_purpose, Engine as _};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

pub fn import_image(data_dir: &Path, _note_id: &str, base64_data: &str) -> std::io::Result<String> {
    let decoded = general_purpose::STANDARD.decode(base64_data).map_err(|e| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, format!("Base64 decode error: {}", e))
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
    let _file_name = source.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    
    let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("");
    let name_without_ext = source.file_stem().and_then(|n| n.to_str()).unwrap_or("file");
    
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