CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    completed BOOLEAN NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'normal',
    remind_at TEXT,
    due_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
CREATE INDEX IF NOT EXISTS idx_todos_deleted_at ON todos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_todos_due_at ON todos(due_at);
