-- EcoCity Connect Database Schema
-- Reports table (stores citizen reports with optional images)

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,

  -- Image (optional - reports can be text-only)
  image_data BLOB,
  content_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  original_filename TEXT,

  -- Report metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  observed_at TEXT,
  uploader_ip TEXT,
  text TEXT NOT NULL,
  place_text TEXT NOT NULL,
  place_area TEXT,
  lat REAL,
  lng REAL,

  -- Moderation
  status TEXT NOT NULL DEFAULT 'new',
  visibility TEXT NOT NULL DEFAULT 'public',

  -- AI enrichment
  ai_caption TEXT,
  ai_category TEXT,
  ai_severity TEXT,
  ai_confidence REAL,
  ai_labels TEXT,
  ai_signals_json TEXT,
  ai_recommendations_json TEXT
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_observed_at ON images(observed_at);
CREATE INDEX IF NOT EXISTS idx_images_visibility ON images(visibility);
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_place_area ON images(place_area);
CREATE INDEX IF NOT EXISTS idx_images_ai_category ON images(ai_category);
CREATE INDEX IF NOT EXISTS idx_images_ai_severity ON images(ai_severity);

-- Optional: Telemetry table for simulated IoT data (hackathon demo)
CREATE TABLE IF NOT EXISTS telemetry (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  observed_at TEXT,
  domain TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  place_area TEXT,
  lat REAL,
  lng REAL,
  source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_domain_metric ON telemetry(domain, metric);
CREATE INDEX IF NOT EXISTS idx_telemetry_place_area ON telemetry(place_area);
