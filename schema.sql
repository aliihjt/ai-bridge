CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('memory','chat','skill')), title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (source, kind, title));
CREATE INDEX IF NOT EXISTS idx_items_updated ON items (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_source_kind ON items (source, kind);
