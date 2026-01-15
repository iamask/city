# EcoCity Connect - Complete Build Prompt for AI IDEs

> **Purpose**: This document is a complete, standalone prompt for any AI IDE (Windsurf, Cursor, etc.) to build and deploy EcoCity Connect from scratch.

---

## Project Overview

Build **EcoCity Connect** - a smart urban resource optimization platform:
- **Citizen Reporting UI** (`/user.html`) - Upload photos + text reports
- **Authority Dashboard** (`/admin.html`) - Analytics, hotspots, moderation
- **REST API** - Upload, image retrieval, admin CRUD, analytics
- **AI Classification** - Workers AI for image analysis

**Tech Stack**: Cloudflare Workers + Hono, D1, Workers AI, Vanilla HTML/CSS/JS + Chart.js

---

## Quick Start Commands

```bash
# 1. Create project
npx create-cloudflare@latest ecocity
# Select: "Hello World" Worker, TypeScript

cd ecocity
npm install hono
npm install --save-dev @cloudflare/workers-types

# 2. Create D1 database
npx wrangler d1 create ecocity-db
# Copy database_id to wrangler.jsonc

# 3. Run migration (local)
npx wrangler d1 execute ecocity-db --local --file=./migrations/0001_init.sql

# 4. Local dev
npm run dev -- --local

# 5. Deploy (after updating database_id)
npx wrangler d1 execute ecocity-db --remote --file=./migrations/0001_init.sql
npm run deploy
```

---

## File Structure to Create

```
ecocity/
├── src/
│   ├── index.ts              # Main Hono app
│   ├── types.ts              # TypeScript interfaces
│   ├── routes/
│   │   ├── upload.ts         # POST /api/upload
│   │   ├── image.ts          # GET /api/image/:id
│   │   ├── admin.ts          # Admin CRUD
│   │   └── analytics.ts      # Analytics endpoints
│   └── utils/
│       ├── validation.ts     # File validation
│       └── ai.ts             # Workers AI
├── public/
│   ├── user.html             # Citizen reporting UI
│   ├── admin.html            # Authority dashboard
│   ├── user.js               # Upload form logic
│   ├── admin.js              # Dashboard logic
│   └── styles.css            # Shared styles
├── migrations/
│   └── 0001_init.sql         # D1 schema
└── wrangler.jsonc            # Cloudflare config
```

---

## wrangler.jsonc

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ecocity",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-08",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./public",
    "binding": "ASSETS"
  },
  "observability": { "enabled": true },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "ecocity-db",
    "database_id": "YOUR_D1_DATABASE_ID"
  }],
  "ai": { "binding": "AI" }
}
```

---

## Database Schema (migrations/0001_init.sql)

```sql
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  image_data BLOB,
  content_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  original_filename TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  observed_at TEXT,
  uploader_ip TEXT,
  text TEXT NOT NULL,
  place_text TEXT NOT NULL,
  place_area TEXT,
  lat REAL,
  lng REAL,
  status TEXT NOT NULL DEFAULT 'new',
  visibility TEXT NOT NULL DEFAULT 'public',
  ai_caption TEXT,
  ai_category TEXT,
  ai_severity TEXT,
  ai_confidence REAL,
  ai_labels TEXT,
  ai_signals_json TEXT,
  ai_recommendations_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_observed_at ON images(observed_at);
CREATE INDEX IF NOT EXISTS idx_images_visibility ON images(visibility);
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_place_area ON images(place_area);
CREATE INDEX IF NOT EXISTS idx_images_ai_category ON images(ai_category);
CREATE INDEX IF NOT EXISTS idx_images_ai_severity ON images(ai_severity);

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
```

---

## API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/upload` | Submit report (multipart: file, text, place_text, observed_at, lat?, lng?, place_area?) |
| GET | `/api/image/:id` | Get image binary |
| GET | `/api/image/:id/meta` | Get report metadata |
| GET | `/i/:id` | Public report view page |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/uploads` | List reports (page, pageSize, visibility, status, domain) |
| GET | `/api/admin/uploads/:id` | Get report details |
| POST | `/api/admin/uploads/:id/block` | Block report |
| POST | `/api/admin/uploads/:id/unblock` | Unblock report |
| POST | `/api/admin/uploads/:id/status` | Update status (new/in_review/actioned) |
| DELETE | `/api/admin/uploads/:id` | Delete report |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/stats` | Dashboard KPIs |
| GET | `/api/analytics/domains` | Reports by domain |
| GET | `/api/analytics/hotspots?window=7d` | Issue hotspots |
| GET | `/api/analytics/recommendations?window=7d` | Action recommendations |
| GET | `/api/analytics/timeseries?window=30d` | Reports over time |
| GET | `/api/analytics/domain-timeseries?window=30d` | Domain breakdown over time |
| GET | `/api/analytics/severity-timeseries?window=30d` | Severity over time |

---

## Domains & Issue Types

**Domains**: waste, water, power, roads, traffic, other

**Issue Types**:
- waste: overflowing_bin, illegal_dumping, missed_collection
- water: leak, water_wastage, flooding
- power: streetlight_outage, streetlight_on_daytime, overuse_report
- roads: pothole, blocked_road
- traffic: congestion, signal_fault

**Severity**: safe, mild, moderate

---

## Workers AI Models

1. **Image Classification**: `@cf/microsoft/resnet-50` - Returns top 5 labels
2. **Image-to-Text**: `@cf/unum/uform-gen2-qwen-500m` - Generates captions

---

## Frontend Features

### User Page (/user.html)
- Drag & drop image upload with preview
- GPS location capture via browser geolocation
- Required: description, location, observation time
- Shows AI analysis results after submission
- Shareable report link

### Admin Dashboard (/admin.html)
- KPI cards: total, today, flagged, top domain
- Chart.js visualizations: domain bar, timeseries line, stacked domain, severity trend, visibility doughnut, hotspot areas
- Hotspots table with drilldown
- Recommendations panel with priority badges
- Reports table with pagination
- Modal for report detail + moderation actions

---

## Implementation Notes

1. **Static assets** served via `assets.directory` in wrangler.jsonc
2. **Image storage** in D1 as BLOB (max ~1MB recommended)
3. **AI analysis** runs on upload, results stored as JSON in D1
4. **Hotspots** grouped by place_area or lat/lng grid
5. **Recommendations** generated from hotspot aggregation

---

## Deployment Checklist

1. [ ] Create D1 database: `npx wrangler d1 create ecocity-db`
2. [ ] Update wrangler.jsonc with database_id
3. [ ] Run remote migration: `npx wrangler d1 execute ecocity-db --remote --file=./migrations/0001_init.sql`
4. [ ] Deploy: `npm run deploy`
5. [ ] Test at deployed URL

---

## Reference Implementation

The complete source code for all files is available in the `/Users/asasikumar/paru_project/city/` directory. Copy the following files:

- `src/index.ts` - Main Hono app with routes
- `src/types.ts` - TypeScript interfaces
- `src/routes/upload.ts` - Upload endpoint
- `src/routes/image.ts` - Image retrieval
- `src/routes/admin.ts` - Admin CRUD
- `src/routes/analytics.ts` - Analytics endpoints
- `src/utils/validation.ts` - File validation utilities
- `src/utils/ai.ts` - Workers AI integration
- `public/user.html` - Citizen reporting UI
- `public/admin.html` - Authority dashboard
- `public/user.js` - Upload form logic
- `public/admin.js` - Dashboard logic with Chart.js
- `public/styles.css` - Complete CSS styles
- `migrations/0001_init.sql` - Database schema
