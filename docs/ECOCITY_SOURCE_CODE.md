# EcoCity Connect - Complete Source Code Reference

This file contains all source code for the EcoCity Connect project. Copy each section into the corresponding file.

---

## src/types.ts

```typescript
import type { D1Database, Fetcher } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
}

export interface Report {
  id: string;
  image_data: ArrayBuffer | null;
  content_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  original_filename: string | null;
  created_at: string;
  observed_at: string | null;
  uploader_ip: string | null;
  text: string;
  place_text: string;
  place_area: string | null;
  lat: number | null;
  lng: number | null;
  status: 'new' | 'in_review' | 'actioned';
  visibility: 'public' | 'blocked';
  ai_caption: string | null;
  ai_category: string | null;
  ai_severity: string | null;
  ai_confidence: number | null;
  ai_labels: string | null;
  ai_signals_json: string | null;
  ai_recommendations_json: string | null;
}

export interface AISignals {
  domain: 'waste' | 'power' | 'water' | 'roads' | 'traffic' | 'other';
  issue_types: string[];
  severity: 'safe' | 'mild' | 'moderate';
  confidence: number;
  location_quality: 'gps' | 'text' | 'unknown';
  area_key: string | null;
  evidence: {
    has_photo: boolean;
    image_labels: string[];
    caption: string | null;
  };
}

export interface AIRecommendation {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AIRecommendations {
  recommended_actions: AIRecommendation[];
}

export interface AIAnalysisResult {
  caption: string;
  category: string;
  severity: 'safe' | 'mild' | 'moderate';
  confidence: number;
  labels: string[];
  signals: AISignals;
  recommendations: AIRecommendations;
}

export interface UploadResponse {
  id: string;
  viewUrl: string;
  ai: {
    caption: string;
    domain: string;
    issue_types: string[];
    severity: string;
    confidence: number;
    recommended_actions: AIRecommendation[];
  };
}

export interface Hotspot {
  domain: string;
  issue_type: string;
  area_key: string;
  count: number;
  avg_severity: number;
  top_places: string[];
  sample_ids: string[];
}

export interface DashboardStats {
  total: number;
  today: number;
  flagged: number;
  topDomain: string | null;
  byStatus: Record<string, number>;
  byVisibility: Record<string, number>;
  bySeverity: Record<string, number>;
}
```

---

## src/utils/validation.ts

```typescript
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
];

const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/gif': [0x47, 0x49, 0x46],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function validateMimeType(contentType: string | null): boolean {
  if (!contentType) return false;
  return ALLOWED_MIME_TYPES.includes(contentType.toLowerCase());
}

export function validateMagicBytes(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  for (const [mimeType, magic] of Object.entries(MAGIC_BYTES)) {
    if (magic.every((byte, i) => bytes[i] === byte)) {
      return mimeType;
    }
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1') {
      return 'image/heic';
    }
  }
  return null;
}

export function validateFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

export async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
}

export function clampLatitude(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

export function clampLongitude(lng: number): number {
  return Math.max(-180, Math.min(180, lng));
}

export function parseCoordinate(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? null : num;
}
```

---

## src/index.ts

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import uploadRoutes from './routes/upload';
import imageRoutes from './routes/image';
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.get('/', (c) => c.redirect('/user.html'));

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.route('/api/upload', uploadRoutes);
app.route('/api/image', imageRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/analytics', analyticsRoutes);

app.get('/i/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const result = await c.env.DB.prepare(`
      SELECT id, content_type, size_bytes, original_filename, created_at, observed_at, 
             text, place_text, place_area, lat, lng, status, visibility,
             ai_caption, ai_category, ai_severity, ai_confidence, ai_labels,
             ai_signals_json, ai_recommendations_json
      FROM images WHERE id = ?
    `).bind(id).first();
    
    if (!result) return c.html('<h1>Report not found</h1>', 404);
    if (result.visibility === 'blocked') return c.html('<h1>Report blocked</h1>', 403);
    
    const hasImage = result.size_bytes && (result.size_bytes as number) > 0;
    const signals = result.ai_signals_json ? JSON.parse(result.ai_signals_json as string) : null;
    const recommendations = result.ai_recommendations_json ? JSON.parse(result.ai_recommendations_json as string) : null;
    
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report - ${result.place_text}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container">
    <header><h1>EcoCity Connect</h1><p class="subtitle">Citizen Report</p></header>
    <main class="report-view">
      ${hasImage ? `<div class="report-image"><img src="/api/image/${id}" alt="Report"></div>` : ''}
      <div class="report-details">
        <div class="report-meta">
          <span class="badge badge-${signals?.domain || 'other'}">${signals?.domain || 'Report'}</span>
          <span class="badge badge-severity-${result.ai_severity}">${result.ai_severity}</span>
        </div>
        <h2>${result.place_text}</h2>
        <p class="report-text">${result.text}</p>
        ${result.ai_caption ? `<div class="ai-analysis"><h3>AI Analysis</h3><p>${result.ai_caption}</p></div>` : ''}
      </div>
    </main>
    <footer><a href="/user.html">Submit a Report</a></footer>
  </div>
</body>
</html>`);
  } catch (error) {
    return c.html('<h1>Error loading report</h1>', 500);
  }
});

export default app;
```

---

## public/user.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EcoCity Connect - Report an Issue</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>EcoCity Connect</h1>
      <p class="subtitle">Smart Urban Resource Optimization</p>
      <nav>
        <a href="/user.html" class="active">Report Issue</a>
        <a href="/admin.html">Admin Dashboard</a>
      </nav>
    </header>
    <main>
      <section class="upload-section">
        <h2>Report an Issue</h2>
        <form id="reportForm" class="report-form">
          <div class="form-group">
            <label for="text">Description *</label>
            <textarea id="text" name="text" required placeholder="Describe what you observed"></textarea>
          </div>
          <div class="form-group">
            <label for="place_text">Location *</label>
            <input type="text" id="place_text" name="place_text" required placeholder="e.g., MG Road, near Metro Station">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="place_area">Ward/Zone (optional)</label>
              <input type="text" id="place_area" name="place_area" placeholder="e.g., Ward 12">
            </div>
            <div class="form-group">
              <label for="observed_at">When observed *</label>
              <input type="datetime-local" id="observed_at" name="observed_at" required>
            </div>
          </div>
          <div class="form-group">
            <label>GPS Location (optional)</label>
            <div class="gps-row">
              <input type="text" id="lat" name="lat" placeholder="Latitude" readonly>
              <input type="text" id="lng" name="lng" placeholder="Longitude" readonly>
              <button type="button" id="getLocationBtn" class="btn btn-secondary">Get Location</button>
            </div>
            <p class="help-text" id="locationStatus"></p>
          </div>
          <div class="form-group">
            <label for="file">Photo (optional)</label>
            <div class="drop-zone" id="dropZone">
              <input type="file" id="file" name="file" accept="image/*">
              <div class="drop-zone-content">
                <p>Drag & drop or click to upload</p>
                <p class="help-text">JPEG, PNG, GIF, WebP (max 10MB)</p>
              </div>
              <div class="preview-container" id="previewContainer" style="display:none;">
                <img id="imagePreview" alt="Preview">
                <button type="button" id="removeImage" class="btn-remove">&times;</button>
              </div>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" id="submitBtn">
            <span class="btn-text">Submit Report</span>
            <span class="btn-loading" style="display:none;">Submitting...</span>
          </button>
        </form>
      </section>
      <section class="result-section" id="resultSection" style="display:none;">
        <h2>Report Submitted!</h2>
        <div class="result-card">
          <div class="result-header">
            <span class="badge" id="resultDomain"></span>
            <span class="badge" id="resultSeverity"></span>
          </div>
          <div class="result-body">
            <h3>AI Analysis</h3>
            <p id="resultCaption"></p>
            <div id="resultIssues"></div>
            <div class="recommendations" id="resultRecommendations"></div>
          </div>
          <div class="result-footer">
            <p>Share this report:</p>
            <div class="share-row">
              <input type="text" id="shareUrl" readonly>
              <button type="button" id="copyBtn" class="btn btn-secondary">Copy</button>
            </div>
          </div>
        </div>
        <button type="button" id="newReportBtn" class="btn btn-primary">Submit Another Report</button>
      </section>
    </main>
    <footer><p>EcoCity Connect - Supporting SDG 11</p></footer>
  </div>
  <script src="/user.js"></script>
</body>
</html>
```

---

## public/admin.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EcoCity Connect - Admin Dashboard</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <div class="container admin-container">
    <header>
      <h1>EcoCity Connect</h1>
      <p class="subtitle">Authority Dashboard</p>
      <nav>
        <a href="/user.html">Report Issue</a>
        <a href="/admin.html" class="active">Admin Dashboard</a>
      </nav>
    </header>
    <main class="dashboard">
      <section class="kpi-section">
        <div class="kpi-card"><h3>Total Reports</h3><p class="kpi-value" id="totalReports">-</p></div>
        <div class="kpi-card"><h3>Today</h3><p class="kpi-value" id="todayReports">-</p></div>
        <div class="kpi-card"><h3>Flagged</h3><p class="kpi-value" id="flaggedReports">-</p></div>
        <div class="kpi-card"><h3>Top Domain</h3><p class="kpi-value" id="topDomain">-</p></div>
      </section>
      <section class="filters-section">
        <div class="filter-group">
          <label for="windowFilter">Time Window:</label>
          <select id="windowFilter">
            <option value="24h">Last 24 Hours</option>
            <option value="7d" selected>Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="domainFilter">Domain:</label>
          <select id="domainFilter">
            <option value="">All Domains</option>
            <option value="waste">Waste</option>
            <option value="water">Water</option>
            <option value="power">Power</option>
            <option value="roads">Roads</option>
            <option value="traffic">Traffic</option>
          </select>
        </div>
        <button id="refreshBtn" class="btn btn-secondary">Refresh</button>
      </section>
      <section class="charts-section">
        <div class="chart-card"><h3>Reports by Domain</h3><canvas id="chartDomain" height="200"></canvas></div>
        <div class="chart-card"><h3>Reports Over Time</h3><canvas id="chartReportsOverTime" height="200"></canvas></div>
      </section>
      <section class="charts-section">
        <div class="chart-card"><h3>Domain Distribution</h3><canvas id="chartDomainStack" height="200"></canvas></div>
        <div class="chart-card"><h3>Severity Trend</h3><canvas id="chartSeverity" height="200"></canvas></div>
      </section>
      <section class="charts-section">
        <div class="chart-card chart-card-small"><h3>Visibility</h3><canvas id="chartVisibility" height="180"></canvas></div>
        <div class="chart-card"><h3>Hotspot Areas</h3><canvas id="chartHotspotAreas" height="200"></canvas></div>
      </section>
      <section class="recommendations-section">
        <h2>Recommended Actions</h2>
        <div id="recommendationsList" class="recommendations-list"><p class="loading">Loading...</p></div>
      </section>
      <section class="hotspots-section">
        <h2>Hotspots</h2>
        <table class="data-table" id="hotspotsTable">
          <thead><tr><th>Domain</th><th>Issue</th><th>Area</th><th>Count</th><th>Severity</th><th>Actions</th></tr></thead>
          <tbody id="hotspotsBody"><tr><td colspan="6" class="loading">Loading...</td></tr></tbody>
        </table>
      </section>
      <section class="reports-section">
        <h2>Recent Reports</h2>
        <div class="reports-filters">
          <select id="statusFilter">
            <option value="">All Status</option>
            <option value="new">New</option>
            <option value="in_review">In Review</option>
            <option value="actioned">Actioned</option>
          </select>
          <select id="visibilityFilter">
            <option value="">All Visibility</option>
            <option value="public">Public</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <table class="data-table" id="reportsTable">
          <thead><tr><th>ID</th><th>Description</th><th>Location</th><th>Domain</th><th>Severity</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody id="reportsBody"><tr><td colspan="8" class="loading">Loading...</td></tr></tbody>
        </table>
        <div class="pagination" id="pagination"></div>
      </section>
      <div class="modal" id="reportModal" style="display:none;">
        <div class="modal-content">
          <button class="modal-close" id="modalClose">&times;</button>
          <div id="modalBody"></div>
        </div>
      </div>
    </main>
    <footer><p>EcoCity Connect - Supporting SDG 11</p></footer>
  </div>
  <script src="/admin.js"></script>
</body>
</html>
```

---

For the complete source code of all remaining files (user.js, admin.js, styles.css, upload.ts, image.ts, admin.ts, analytics.ts, ai.ts), refer to the working implementation in `/Users/asasikumar/paru_project/city/`.
