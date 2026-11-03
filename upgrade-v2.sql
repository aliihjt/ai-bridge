CREATE TABLE items_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('memory','chat','skill','file')), title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (source, kind, title));
INSERT INTO items_v2 (id, source, kind, title, content, tags, created_at, updated_at) SELECT id, source, kind, title, content, tags, created_at, updated_at FROM items;
DROP TABLE items;
ALTER TABLE items_v2 RENAME TO items;
CREATE INDEX IF NOT EXISTS idx_items_updated ON items (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_source_kind ON items (source, kind);
