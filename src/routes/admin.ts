import { Hono } from 'hono';
import type { Env, Report } from '../types';

const admin = new Hono<{ Bindings: Env }>();

admin.get('/uploads', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);
  const visibility = c.req.query('visibility');
  const status = c.req.query('status');
  const domain = c.req.query('domain');
  
  const offset = (page - 1) * pageSize;
  
  let whereClause = '1=1';
  const params: (string | number)[] = [];
  
  if (visibility) {
    whereClause += ' AND visibility = ?';
    params.push(visibility);
  }
  
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  
  if (domain) {
    whereClause += " AND json_extract(ai_signals_json, '$.domain') = ?";
    params.push(domain);
  }
  
  try {
    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM images WHERE ${whereClause}`
    ).bind(...params).first<{ count: number }>();
    
    const total = countResult?.count || 0;
    
    const results = await c.env.DB.prepare(`
      SELECT 
        id, content_type, size_bytes, original_filename,
        created_at, observed_at, text, place_text, place_area, lat, lng,
        status, visibility,
        ai_caption, ai_category, ai_severity, ai_confidence, ai_labels,
        ai_signals_json, ai_recommendations_json
      FROM images 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, offset).all();
    
    const uploads = (results.results || []).map((row: Record<string, unknown>) => ({
      ...row,
      ai_labels: row.ai_labels ? JSON.parse(row.ai_labels as string) : [],
      ai_signals: row.ai_signals_json ? JSON.parse(row.ai_signals_json as string) : null,
      ai_recommendations: row.ai_recommendations_json ? JSON.parse(row.ai_recommendations_json as string) : null,
      hasImage: (row.size_bytes as number) > 0,
      imageUrl: row.size_bytes ? `/api/image/${row.id}` : null,
    }));
    
    uploads.forEach((u: Record<string, unknown>) => {
      delete u.ai_signals_json;
      delete u.ai_recommendations_json;
    });
    
    return c.json({
      uploads,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Admin uploads error:', error);
    return c.json({ error: 'Failed to fetch uploads' }, 500);
  }
});

admin.get('/uploads/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const result = await c.env.DB.prepare(`
      SELECT 
        id, content_type, size_bytes, sha256, original_filename,
        created_at, observed_at, uploader_ip, text, place_text, place_area, lat, lng,
        status, visibility,
        ai_caption, ai_category, ai_severity, ai_confidence, ai_labels,
        ai_signals_json, ai_recommendations_json
      FROM images WHERE id = ?
    `).bind(id).first<Omit<Report, 'image_data'>>();
    
    if (!result) {
      return c.json({ error: 'Upload not found' }, 404);
    }
    
    const response = {
      ...result,
      ai_labels: result.ai_labels ? JSON.parse(result.ai_labels) : [],
      ai_signals: result.ai_signals_json ? JSON.parse(result.ai_signals_json) : null,
      ai_recommendations: result.ai_recommendations_json ? JSON.parse(result.ai_recommendations_json) : null,
      hasImage: result.size_bytes !== null && result.size_bytes > 0,
      imageUrl: result.size_bytes ? `/api/image/${id}` : null,
    };
    
    delete (response as Record<string, unknown>).ai_signals_json;
    delete (response as Record<string, unknown>).ai_recommendations_json;
    
    return c.json(response);
  } catch (error) {
    console.error('Admin upload detail error:', error);
    return c.json({ error: 'Failed to fetch upload' }, 500);
  }
});

admin.post('/uploads/:id/block', async (c) => {
  const id = c.req.param('id');
  
  try {
    const result = await c.env.DB.prepare(
      "UPDATE images SET visibility = 'blocked' WHERE id = ?"
    ).bind(id).run();
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Upload not found' }, 404);
    }
    
    return c.json({ success: true, message: 'Upload blocked' });
  } catch (error) {
    console.error('Block error:', error);
    return c.json({ error: 'Failed to block upload' }, 500);
  }
});

admin.post('/uploads/:id/unblock', async (c) => {
  const id = c.req.param('id');
  
  try {
    const result = await c.env.DB.prepare(
      "UPDATE images SET visibility = 'public' WHERE id = ?"
    ).bind(id).run();
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Upload not found' }, 404);
    }
    
    return c.json({ success: true, message: 'Upload unblocked' });
  } catch (error) {
    console.error('Unblock error:', error);
    return c.json({ error: 'Failed to unblock upload' }, 500);
  }
});

admin.post('/uploads/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ status: string }>();
  
  const validStatuses = ['new', 'in_review', 'actioned'];
  if (!validStatuses.includes(body.status)) {
    return c.json({ error: 'Invalid status. Must be: new, in_review, or actioned' }, 400);
  }
  
  try {
    const result = await c.env.DB.prepare(
      'UPDATE images SET status = ? WHERE id = ?'
    ).bind(body.status, id).run();
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Upload not found' }, 404);
    }
    
    return c.json({ success: true, message: `Status updated to ${body.status}` });
  } catch (error) {
    console.error('Status update error:', error);
    return c.json({ error: 'Failed to update status' }, 500);
  }
});

admin.delete('/uploads/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const result = await c.env.DB.prepare(
      'DELETE FROM images WHERE id = ?'
    ).bind(id).run();
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Upload not found' }, 404);
    }
    
    return c.json({ success: true, message: 'Upload deleted' });
  } catch (error) {
    console.error('Delete error:', error);
    return c.json({ error: 'Failed to delete upload' }, 500);
  }
});

export default admin;
