# EcoCity Connect - Phase 2 Implementation Plan

## Current State (What's Already Built)

The **hackathon MVP** is deployed at `https://ecocity.zxxc.workers.dev` with:

### Existing Infrastructure
- **Cloudflare Worker** with Hono framework
- **D1 Database** (`ecocity-db`) with schema deployed
- **Workers AI** integration (ResNet-50 + UForm-Gen2)
- **Static assets** served from `/public`

### Existing Features
| Feature | Status | Location |
|---------|--------|----------|
| Citizen reporting UI | ✅ Done | `/user.html` |
| Admin dashboard | ✅ Done | `/admin.html` |
| Image upload API | ✅ Done | `POST /api/upload` |
| AI classification | ✅ Done | `src/utils/ai.ts` |
| Analytics endpoints | ✅ Done | `src/routes/analytics.ts` |
| Chart.js visualizations | ✅ Done | `admin.js` |

### Existing Project Structure
```
city/
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
│   ├── user.html, admin.html
│   ├── user.js, admin.js
│   └── styles.css
├── migrations/
│   └── 0001_init.sql
└── wrangler.jsonc
```

### Existing Database Schema
```sql
CREATE TABLE images (
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

CREATE TABLE telemetry (
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
```

### Existing API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/upload` | Submit report |
| GET | `/api/image/:id` | Get image binary |
| GET | `/api/image/:id/meta` | Get report metadata |
| GET | `/i/:id` | Public report view |
| GET | `/api/admin/uploads` | List reports |
| GET | `/api/admin/uploads/:id` | Get report details |
| POST | `/api/admin/uploads/:id/block` | Block report |
| POST | `/api/admin/uploads/:id/unblock` | Unblock report |
| POST | `/api/admin/uploads/:id/status` | Update status |
| DELETE | `/api/admin/uploads/:id` | Delete report |
| GET | `/api/analytics/stats` | Dashboard KPIs |
| GET | `/api/analytics/domains` | Reports by domain |
| GET | `/api/analytics/hotspots` | Issue hotspots |
| GET | `/api/analytics/recommendations` | Action recommendations |
| GET | `/api/analytics/timeseries` | Reports over time |
| GET | `/api/analytics/domain-timeseries` | Domain breakdown over time |
| GET | `/api/analytics/severity-timeseries` | Severity over time |

---

## Phase 2: Production Enhancements

### 1. Improved AI Classification with LLM

**Goal**: Replace heuristic keyword matching with LLM-based JSON extraction for more accurate domain/issue classification.

**Current Implementation** (`src/utils/ai.ts`):
- Uses keyword matching to detect domain (waste/water/power/roads/traffic)
- Generates recommendations based on static templates

**New Implementation**:

#### 1.1 Add LLM-based extraction
File: `src/utils/ai.ts`

```typescript
async function extractSignalsWithLLM(
  env: Env,
  text: string,
  placeText: string,
  observedAt: string,
  caption: string,
  labels: string[]
): Promise<{ signals: AISignals; recommendations: AIRecommendations }> {
  const prompt = `You are a city infrastructure analyst. Analyze this citizen report and extract structured data.

Report:
- Description: ${text}
- Location: ${placeText}
- Observed at: ${observedAt}
- AI Caption: ${caption}
- Image labels: ${labels.join(', ')}

Extract JSON with this exact structure:
{
  "domain": "waste|water|power|roads|traffic|other",
  "issue_types": ["array of specific issues"],
  "severity": "safe|mild|moderate",
  "recommended_actions": [
    {"title": "action title", "detail": "explanation", "priority": "high|medium|low"}
  ]
}

Issue type examples:
- waste: overflowing_bin, illegal_dumping, missed_collection
- water: leak, water_wastage, flooding
- power: streetlight_outage, streetlight_on_daytime, overuse_report
- roads: pothole, blocked_road
- traffic: congestion, signal_fault

Respond with ONLY valid JSON, no explanation.`;

  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    prompt,
    max_tokens: 500,
  });

  // Parse and validate JSON response
  const parsed = JSON.parse(result.response);
  return {
    signals: {
      domain: parsed.domain,
      issue_types: parsed.issue_types,
      severity: parsed.severity,
      confidence: 0.85,
      location_quality: 'text',
      area_key: null,
      evidence: { has_photo: true, image_labels: labels, caption }
    },
    recommendations: { recommended_actions: parsed.recommended_actions }
  };
}
```

#### 1.2 Update analyzeImage function
Add fallback to heuristic if LLM fails:

```typescript
export async function analyzeImage(env: Env, ...args): Promise<AIAnalysisResult> {
  // ... existing image analysis code ...
  
  try {
    // Try LLM extraction first
    const llmResult = await extractSignalsWithLLM(env, text, placeText, observedAt, caption, labels);
    return { ...baseResult, signals: llmResult.signals, recommendations: llmResult.recommendations };
  } catch (error) {
    console.error('LLM extraction failed, using heuristics:', error);
    // Fall back to existing heuristic logic
    return heuristicAnalysis(text, placeText, caption, labels);
  }
}
```

---

### 2. Simulated Telemetry System

**Goal**: Add IoT-style telemetry ingestion and visualization for hackathon demo.

#### 2.1 Create telemetry routes
File: `src/routes/telemetry.ts`

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';

const telemetry = new Hono<{ Bindings: Env }>();

// Ingest telemetry data (simulated sensors)
telemetry.post('/ingest', async (c) => {
  const body = await c.req.json<{
    domain: string;
    metric: string;
    value: number;
    unit?: string;
    place_area?: string;
    lat?: number;
    lng?: number;
    observed_at?: string;
  }>();

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  
  await c.env.DB.prepare(`
    INSERT INTO telemetry (id, domain, metric, value, unit, place_area, lat, lng, observed_at, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'simulated')
  `).bind(
    id,
    body.domain,
    body.metric,
    body.value,
    body.unit || null,
    body.place_area || null,
    body.lat || null,
    body.lng || null,
    body.observed_at || new Date().toISOString()
  ).run();

  return c.json({ id, success: true });
});

// Get telemetry summary
telemetry.get('/summary', async (c) => {
  const domain = c.req.query('domain');
  const window = c.req.query('window') || '24h';
  
  let hours = 24;
  if (window === '7d') hours = 168;
  if (window === '1h') hours = 1;
  
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  let query = `
    SELECT domain, metric, place_area,
           AVG(value) as avg_value,
           MAX(value) as max_value,
           MIN(value) as min_value,
           COUNT(*) as reading_count
    FROM telemetry
    WHERE created_at >= ?
  `;
  const params: (string | null)[] = [cutoff];
  
  if (domain) {
    query += ' AND domain = ?';
    params.push(domain);
  }
  
  query += ' GROUP BY domain, metric, place_area ORDER BY avg_value DESC';
  
  const results = await c.env.DB.prepare(query).bind(...params).all();
  
  return c.json({
    window,
    summary: results.results
  });
});

// Get latest readings per metric/area
telemetry.get('/latest', async (c) => {
  const results = await c.env.DB.prepare(`
    SELECT t1.*
    FROM telemetry t1
    INNER JOIN (
      SELECT domain, metric, place_area, MAX(created_at) as max_created
      FROM telemetry
      GROUP BY domain, metric, place_area
    ) t2 ON t1.domain = t2.domain 
        AND t1.metric = t2.metric 
        AND COALESCE(t1.place_area, '') = COALESCE(t2.place_area, '')
        AND t1.created_at = t2.max_created
    ORDER BY t1.created_at DESC
    LIMIT 50
  `).all();
  
  return c.json({ readings: results.results });
});

export default telemetry;
```

#### 2.2 Register telemetry routes in index.ts
```typescript
import telemetryRoutes from './routes/telemetry';
// ...
app.route('/api/telemetry', telemetryRoutes);
```

#### 2.3 Create telemetry simulator script
File: `scripts/simulate-telemetry.js`

```javascript
const WORKER_URL = 'https://ecocity.zxxc.workers.dev';

const AREAS = ['Ward 1', 'Ward 2', 'Ward 3', 'Ward 4', 'Ward 5'];

const METRICS = {
  waste: [
    { metric: 'bin_fill_pct', unit: '%', min: 0, max: 100 },
  ],
  water: [
    { metric: 'flow_rate', unit: 'L/min', min: 0, max: 50 },
    { metric: 'pressure', unit: 'bar', min: 1, max: 5 },
    { metric: 'leak_score', unit: '', min: 0, max: 1 },
  ],
  power: [
    { metric: 'kwh', unit: 'kWh', min: 0, max: 100 },
    { metric: 'streetlight_status', unit: '', min: 0, max: 1 },
    { metric: 'anomaly_score', unit: '', min: 0, max: 1 },
  ],
};

async function sendReading(domain, metric, value, unit, place_area) {
  const response = await fetch(`${WORKER_URL}/api/telemetry/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, metric, value, unit, place_area }),
  });
  return response.json();
}

async function simulate() {
  for (const [domain, metrics] of Object.entries(METRICS)) {
    for (const { metric, unit, min, max } of metrics) {
      for (const area of AREAS) {
        const value = min + Math.random() * (max - min);
        await sendReading(domain, metric, value, unit, area);
        console.log(`Sent: ${domain}/${metric} = ${value.toFixed(2)} for ${area}`);
      }
    }
  }
}

// Run every 5 minutes
setInterval(simulate, 5 * 60 * 1000);
simulate(); // Initial run
```

---

### 3. Enhanced Admin Dashboard

**Goal**: Add telemetry visualizations and real-time anomaly alerts.

#### 3.1 Add telemetry section to admin.html
```html
<!-- Telemetry Section -->
<section class="telemetry-section">
  <h2>Live Telemetry</h2>
  <div class="telemetry-grid">
    <div class="telemetry-card waste">
      <h3>Waste Bins</h3>
      <div class="metric-value" id="wasteBinFill">-</div>
      <p>Avg Fill Level</p>
      <canvas id="chartWasteTrend" height="100"></canvas>
    </div>
    <div class="telemetry-card water">
      <h3>Water System</h3>
      <div class="metric-value" id="waterLeakScore">-</div>
      <p>Leak Risk Score</p>
      <canvas id="chartWaterTrend" height="100"></canvas>
    </div>
    <div class="telemetry-card power">
      <h3>Power Grid</h3>
      <div class="metric-value" id="powerAnomaly">-</div>
      <p>Anomaly Score</p>
      <canvas id="chartPowerTrend" height="100"></canvas>
    </div>
  </div>
</section>

<!-- Anomaly Alerts -->
<section class="alerts-section">
  <h2>Active Alerts</h2>
  <div id="alertsList" class="alerts-list"></div>
</section>
```

#### 3.2 Add telemetry loading to admin.js
```javascript
async function loadTelemetry() {
  try {
    const [summary, latest] = await Promise.all([
      fetch('/api/telemetry/summary?window=24h').then(r => r.json()),
      fetch('/api/telemetry/latest').then(r => r.json()),
    ]);
    
    // Update KPI cards
    const wasteBin = summary.summary.find(s => s.metric === 'bin_fill_pct');
    const waterLeak = summary.summary.find(s => s.metric === 'leak_score');
    const powerAnomaly = summary.summary.find(s => s.metric === 'anomaly_score');
    
    document.getElementById('wasteBinFill').textContent = 
      wasteBin ? `${wasteBin.avg_value.toFixed(0)}%` : '-';
    document.getElementById('waterLeakScore').textContent = 
      waterLeak ? waterLeak.avg_value.toFixed(2) : '-';
    document.getElementById('powerAnomaly').textContent = 
      powerAnomaly ? powerAnomaly.avg_value.toFixed(2) : '-';
    
    // Generate alerts for high values
    generateAlerts(summary.summary);
  } catch (error) {
    console.error('Telemetry error:', error);
  }
}

function generateAlerts(summary) {
  const alerts = [];
  
  for (const item of summary) {
    if (item.metric === 'bin_fill_pct' && item.avg_value > 80) {
      alerts.push({
        type: 'waste',
        severity: 'high',
        message: `Bin fill level critical in ${item.place_area}: ${item.avg_value.toFixed(0)}%`
      });
    }
    if (item.metric === 'leak_score' && item.avg_value > 0.7) {
      alerts.push({
        type: 'water',
        severity: 'high',
        message: `Potential water leak detected in ${item.place_area}`
      });
    }
    if (item.metric === 'anomaly_score' && item.avg_value > 0.8) {
      alerts.push({
        type: 'power',
        severity: 'medium',
        message: `Power anomaly detected in ${item.place_area}`
      });
    }
  }
  
  const alertsList = document.getElementById('alertsList');
  if (alerts.length === 0) {
    alertsList.innerHTML = '<p class="no-alerts">No active alerts</p>';
  } else {
    alertsList.innerHTML = alerts.map(a => `
      <div class="alert alert-${a.severity} alert-${a.type}">
        <span class="alert-icon"></span>
        <span class="alert-message">${a.message}</span>
      </div>
    `).join('');
  }
}
```

---

### 4. Mobile-First UI Improvements

**Goal**: Optimize citizen reporting UI for mobile phone usage.

#### 4.1 Update user.html for mobile
```html
<!-- Add to <head> -->
<meta name="theme-color" content="#3b82f6">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="manifest" href="/manifest.json">

<!-- Camera capture button for mobile -->
<div class="form-group">
  <label>Photo</label>
  <div class="capture-options">
    <button type="button" id="cameraBtn" class="btn btn-camera">
      <svg><!-- camera icon --></svg>
      Take Photo
    </button>
    <button type="button" id="galleryBtn" class="btn btn-gallery">
      <svg><!-- gallery icon --></svg>
      Choose from Gallery
    </button>
  </div>
  <input type="file" id="cameraInput" accept="image/*" capture="environment" style="display:none">
  <input type="file" id="galleryInput" accept="image/*" style="display:none">
</div>
```

#### 4.2 Add PWA manifest
File: `public/manifest.json`
```json
{
  "name": "EcoCity Connect",
  "short_name": "EcoCity",
  "description": "Report city infrastructure issues",
  "start_url": "/user.html",
  "display": "standalone",
  "background_color": "#f9fafb",
  "theme_color": "#3b82f6",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

#### 4.3 Mobile-specific styles
```css
/* Mobile camera UI */
@media (max-width: 600px) {
  .capture-options {
    display: flex;
    gap: 10px;
  }
  
  .btn-camera, .btn-gallery {
    flex: 1;
    padding: 20px;
    font-size: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  
  .drop-zone {
    display: none; /* Hide drag-drop on mobile */
  }
}

@media (min-width: 601px) {
  .capture-options {
    display: none; /* Hide camera buttons on desktop */
  }
}
```

---

### 5. Admin Authentication

**Goal**: Protect admin routes with Cloudflare Access or simple API key.

#### 5.1 Simple API key middleware (for hackathon)
File: `src/middleware/auth.ts`

```typescript
import { Context, Next } from 'hono';
import type { Env } from '../types';

export async function adminAuth(c: Context<{ Bindings: Env }>, next: Next) {
  // Check for API key in header
  const apiKey = c.req.header('X-Admin-Key');
  const expectedKey = c.env.ADMIN_API_KEY; // Set via wrangler secret
  
  if (!expectedKey) {
    // No key configured, allow access (dev mode)
    return next();
  }
  
  if (apiKey !== expectedKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  return next();
}
```

#### 5.2 Apply middleware to admin routes
```typescript
// In index.ts
import { adminAuth } from './middleware/auth';

app.use('/api/admin/*', adminAuth);
```

#### 5.3 Set admin key secret
```bash
npx wrangler secret put ADMIN_API_KEY
# Enter a secure random string
```

#### 5.4 Update types.ts
```typescript
export interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  ADMIN_API_KEY?: string; // Optional admin API key
}
```

---

### 6. Export & Reporting

**Goal**: Allow admins to export reports for offline analysis.

#### 6.1 Add export endpoint
File: `src/routes/admin.ts`

```typescript
admin.get('/export', async (c) => {
  const format = c.req.query('format') || 'csv';
  const window = c.req.query('window') || '30d';
  
  let days = 30;
  if (window === '7d') days = 7;
  if (window === '24h') days = 1;
  
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const results = await c.env.DB.prepare(`
    SELECT id, created_at, observed_at, text, place_text, place_area, lat, lng,
           status, visibility, ai_category, ai_severity,
           json_extract(ai_signals_json, '$.domain') as domain,
           json_extract(ai_signals_json, '$.issue_types') as issue_types
    FROM images
    WHERE created_at >= ?
    ORDER BY created_at DESC
  `).bind(cutoff).all();
  
  if (format === 'json') {
    return c.json({ reports: results.results });
  }
  
  // CSV format
  const headers = ['id', 'created_at', 'observed_at', 'text', 'place_text', 'place_area', 
                   'lat', 'lng', 'status', 'visibility', 'domain', 'severity', 'issue_types'];
  
  const csv = [
    headers.join(','),
    ...results.results.map(r => headers.map(h => {
      const val = r[h];
      if (val === null) return '';
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      return val;
    }).join(','))
  ].join('\n');
  
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename=ecocity-reports-${window}.csv`
    }
  });
});
```

#### 6.2 Add export button to admin.html
```html
<div class="export-controls">
  <select id="exportWindow">
    <option value="24h">Last 24 Hours</option>
    <option value="7d">Last 7 Days</option>
    <option value="30d" selected>Last 30 Days</option>
  </select>
  <button id="exportCsvBtn" class="btn btn-secondary">Export CSV</button>
  <button id="exportJsonBtn" class="btn btn-secondary">Export JSON</button>
</div>
```

---

## Implementation Checklist

### Phase 2.1: LLM Integration
- [ ] Update `src/utils/ai.ts` with LLM extraction function
- [ ] Add fallback to heuristics on LLM failure
- [ ] Test with various report types
- [ ] Deploy and verify

### Phase 2.2: Telemetry System
- [ ] Create `src/routes/telemetry.ts`
- [ ] Register routes in `index.ts`
- [ ] Create simulator script
- [ ] Test ingestion and summary endpoints
- [ ] Deploy

### Phase 2.3: Dashboard Enhancements
- [ ] Add telemetry section to `admin.html`
- [ ] Add telemetry loading to `admin.js`
- [ ] Add alert generation logic
- [ ] Style telemetry cards
- [ ] Test with simulated data

### Phase 2.4: Mobile Optimization
- [ ] Add camera capture buttons
- [ ] Create PWA manifest
- [ ] Add mobile-specific styles
- [ ] Test on mobile devices

### Phase 2.5: Admin Auth
- [ ] Create auth middleware
- [ ] Apply to admin routes
- [ ] Set ADMIN_API_KEY secret
- [ ] Update admin.js to send key header
- [ ] Test protected routes

### Phase 2.6: Export Feature
- [ ] Add export endpoint
- [ ] Add export UI to admin.html
- [ ] Add export handlers to admin.js
- [ ] Test CSV and JSON exports

---

## Deployment Commands

```bash
# Navigate to project
cd /Users/asasikumar/paru_project/city

# Install any new dependencies
npm install

# Run migrations (if schema changes)
npx wrangler d1 execute ecocity-db --remote --file=./migrations/0002_updates.sql

# Set secrets
npx wrangler secret put ADMIN_API_KEY

# Deploy
npm run deploy

# Local development
npm run dev -- --local
```

---

## Tech Stack Reference

| Component | Technology | Notes |
|-----------|------------|-------|
| Backend | Cloudflare Workers + Hono | Already configured |
| Database | Cloudflare D1 | `ecocity-db` deployed |
| AI | Workers AI | ResNet-50, UForm-Gen2, Llama-3.1-8b |
| Frontend | Vanilla HTML/CSS/JS | No build step needed |
| Charts | Chart.js (CDN) | Already integrated |
| Deployment | Wrangler CLI | `npm run deploy` |

---

## Current Deployment

- **URL**: https://ecocity.zxxc.workers.dev
- **Database ID**: `1747be6b-5a04-4d60-8f0d-f9ce8f0ef941`
- **Worker Name**: `ecocity`

---

## Notes for AI Agent

1. **Always run migrations on remote** after schema changes:
   ```bash
   npx wrangler d1 execute ecocity-db --remote --file=./migrations/XXXX.sql
   ```

2. **Test locally first** with `--local` flag:
   ```bash
   npm run dev -- --local
   ```

3. **AI binding requires remote access** - local dev will show "not supported" warning but still works for other features.

4. **Static assets** are served automatically from `public/` directory via the `assets` binding in `wrangler.jsonc`.

5. **Database schema** is already deployed - only run new migrations for schema changes.
