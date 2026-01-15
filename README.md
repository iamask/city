# EcoCity Connect

Smart Urban Resource Optimization Platform - A hackathon MVP for citizen reporting and city authority dashboards.

## Overview

EcoCity Connect is an AI-powered smart city platform that:
- Enables citizens to report waste, water, power, and infrastructure issues via photo + text
- Uses Workers AI for automatic issue classification and severity detection
- Provides an authority dashboard with analytics, hotspots, and actionable recommendations
- Supports SDG 11: Sustainable Cities and Communities

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| AI | Workers AI (ResNet-50, UForm-Gen2) |
| Frontend | Vanilla HTML + CSS + JavaScript |
| Charts | Chart.js |

## Quick Start

### Prerequisites
- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account with Workers, D1, and Workers AI enabled

### 1. Install Dependencies
```bash
npm install
```

### 2. Create D1 Database (for remote deployment)
```bash
npx wrangler d1 create ecocity-db
```
Copy the `database_id` from the output and update `wrangler.jsonc`.

### 3. Run Database Migration

**Local development:**
```bash
npx wrangler d1 execute ecocity-db --local --file=./migrations/0001_init.sql
```

**Remote deployment:**
```bash
npx wrangler d1 execute ecocity-db --remote --file=./migrations/0001_init.sql
```

### 4. Local Development
```bash
npm run dev -- --local
```
Open http://localhost:8788

### 5. Deploy to Cloudflare
```bash
npm run deploy
```

## Project Structure

```
city/
├── src/
│   ├── index.ts              # Main Hono app
│   ├── types.ts              # TypeScript interfaces
│   ├── routes/
│   │   ├── upload.ts         # POST /api/upload
│   │   ├── image.ts          # GET /api/image/:id
│   │   ├── admin.ts          # Admin CRUD endpoints
│   │   └── analytics.ts      # Analytics endpoints
│   └── utils/
│       ├── validation.ts     # File validation
│       └── ai.ts             # Workers AI integration
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

## API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Redirects to /user |
| GET | `/health` | Health check |
| POST | `/api/upload` | Submit a report |
| GET | `/api/image/:id` | Get image binary |
| GET | `/api/image/:id/meta` | Get report metadata |
| GET | `/i/:id` | Public report view |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/uploads` | List reports |
| GET | `/api/admin/uploads/:id` | Get report details |
| POST | `/api/admin/uploads/:id/block` | Block a report |
| POST | `/api/admin/uploads/:id/unblock` | Unblock a report |
| POST | `/api/admin/uploads/:id/status` | Update status |
| DELETE | `/api/admin/uploads/:id` | Delete a report |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/stats` | Dashboard KPIs |
| GET | `/api/analytics/domains` | Reports by domain |
| GET | `/api/analytics/hotspots` | Issue hotspots |
| GET | `/api/analytics/recommendations` | Action recommendations |
| GET | `/api/analytics/timeseries` | Reports over time |

## Domains Supported

- **waste** - Overflowing bins, illegal dumping, missed collection
- **water** - Leaks, water wastage, flooding
- **power** - Streetlight outages, daytime lighting, overuse
- **roads** - Potholes, blocked roads
- **traffic** - Congestion, signal faults

## Features

### Citizen Reporting (`/user`)
- Drag & drop image upload
- GPS location capture
- Required: description, location, observation time
- AI-powered issue classification
- Shareable report links

### Authority Dashboard (`/admin`)
- KPI cards (total, today, flagged, top domain)
- Charts: domain breakdown, time series, severity trends
- Hotspot analysis by area
- Actionable recommendations
- Report moderation (block/unblock/delete)
- Status workflow (new → in_review → actioned)

## License

MIT
