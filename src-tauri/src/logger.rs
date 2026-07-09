use chrono::Local;
use log::{set_boxed_logger, set_max_level, Level, LevelFilter, Log, Metadata, Record};
use once_cell::sync::OnceCell;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

struct AppLogger {
    log_dir: PathBuf,
}

impl AppLogger {
    fn new() -> Self {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let log_dir = home.join("MiniNotes").join("logs");
        if !log_dir.exists() {
            let _ = fs::create_dir_all(&log_dir);
        }
        AppLogger { log_dir }
    }

    fn format_message(&self, record: &Record) -> String {
        let now = Local::now().format("[%Y-%m-%d %H:%M:%S]").to_string();
        let level = match record.level() {
            Level::Error => "[ERROR]",
            Level::Warn => "[WARN]",
            Level::Info => "[INFO]",
            Level::Debug => "[DEBUG]",
            Level::Trace => "[TRACE]",
        };
        let module = format!("[{}]", record.module_path().unwrap_or("unknown"));
        let args = record.args().to_string();
        
        format!("{} {} {} {}", now, level, module, args)
    }
}

impl Log for AppLogger {
    fn enabled(&self, _metadata: &Metadata) -> bool {
        true
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        
        let message = self.format_message(record);
        println!("{}", message);
        
        let log_file = self.log_dir.join(format!("{}.log", Local::now().format("%Y-%m-%d")));
        if let Ok(mut file) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file)
        {
            let _ = writeln!(file, "{}", message);
        }
    }

    fn flush(&self) {}
}

static LOGGER_INIT: OnceCell<()> = OnceCell::new();

pub fn init() {
    LOGGER_INIT.get_or_init(|| {
        let logger = Box::new(AppLogger::new());
        if let Err(e) = set_boxed_logger(logger) {
            eprintln!("Failed to set logger: {}", e);
        }
        set_max_level(LevelFilter::Info);
    });
}