import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import uploadRoutes from './routes/upload';
import imageRoutes from './routes/image';
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.get('/', (c) => {
  return c.redirect('/user');
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.route('/api/upload', uploadRoutes);
app.route('/api/image', imageRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/analytics', analyticsRoutes);

app.get('/i/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const result = await c.env.DB.prepare(`
      SELECT 
        id, content_type, size_bytes, original_filename,
        created_at, observed_at, text, place_text, place_area, lat, lng,
        status, visibility,
        ai_caption, ai_category, ai_severity, ai_confidence, ai_labels,
        ai_signals_json, ai_recommendations_json
      FROM images WHERE id = ?
    `).bind(id).first();
    
    if (!result) {
      return c.html(`<!DOCTYPE html>
<html><head><title>Not Found</title></head>
<body><h1>Report not found</h1></body></html>`, 404);
    }
    
    if (result.visibility === 'blocked') {
      return c.html(`<!DOCTYPE html>
<html><head><title>Blocked</title></head>
<body><h1>This report has been blocked</h1></body></html>`, 403);
    }
    
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
    <header>
      <h1>EcoCity Connect</h1>
      <p class="subtitle">Citizen Report</p>
    </header>
    
    <main class="report-view">
      ${hasImage ? `<div class="report-image">
        <img src="/api/image/${id}" alt="Report image">
      </div>` : ''}
      
      <div class="report-details">
        <div class="report-meta">
          <span class="badge badge-${signals?.domain || 'other'}">${signals?.domain || 'Report'}</span>
          <span class="badge badge-severity-${result.ai_severity}">${result.ai_severity}</span>
          <time>${new Date(result.created_at as string).toLocaleString()}</time>
        </div>
        
        <h2>${result.place_text}</h2>
        <p class="report-text">${result.text}</p>
        
        ${result.ai_caption ? `<div class="ai-analysis">
          <h3>AI Analysis</h3>
          <p>${result.ai_caption}</p>
          ${signals?.issue_types ? `<p><strong>Issues:</strong> ${signals.issue_types.join(', ')}</p>` : ''}
        </div>` : ''}
        
        ${recommendations?.recommended_actions?.length ? `<div class="recommendations">
          <h3>Recommended Actions</h3>
          <ul>
            ${recommendations.recommended_actions.map((r: { title: string; priority: string }) => 
              `<li><span class="priority-${r.priority}">${r.priority}</span> ${r.title}</li>`
            ).join('')}
          </ul>
        </div>` : ''}
        
        ${result.lat && result.lng ? `<p class="location">
          <strong>Location:</strong> ${result.lat}, ${result.lng}
        </p>` : ''}
      </div>
    </main>
    
    <footer>
      <a href="/user">Submit a Report</a>
    </footer>
  </div>
</body>
</html>`);
  } catch (error) {
    console.error('View error:', error);
    return c.html(`<!DOCTYPE html>
<html><head><title>Error</title></head>
<body><h1>Error loading report</h1></body></html>`, 500);
  }
});

export default app;
