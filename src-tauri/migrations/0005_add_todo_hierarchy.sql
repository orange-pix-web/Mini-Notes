ALTER TABLE todos ADD COLUMN parent_id TEXT;
ALTER TABLE todos ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;
ALTER TABLE todos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON todos(parent_id);
CREATE INDEX IF NOT EXISTS idx_todos_sort_order ON todos(sort_order);
