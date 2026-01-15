import { Hono } from 'hono';
import type { Env, Report } from '../types';

const image = new Hono<{ Bindings: Env }>();

image.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const result = await c.env.DB.prepare(
      'SELECT image_data, content_type, visibility FROM images WHERE id = ?'
    ).bind(id).first<{ image_data: ArrayBuffer; content_type: string; visibility: string }>();
    
    if (!result) {
      return c.json({ error: 'Image not found' }, 404);
    }
    
    if (result.visibility === 'blocked') {
      return c.json({ error: 'Image is blocked' }, 403);
    }
    
    if (!result.image_data) {
      return c.json({ error: 'No image attached to this report' }, 404);
    }
    
    return new Response(result.image_data, {
      headers: {
        'Content-Type': result.content_type || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Image fetch error:', error);
    return c.json({ error: 'Failed to fetch image' }, 500);
  }
});

image.get('/:id/meta', async (c) => {
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
    `).bind(id).first<Omit<Report, 'image_data' | 'sha256' | 'uploader_ip'>>();
    
    if (!result) {
      return c.json({ error: 'Report not found' }, 404);
    }
    
    if (result.visibility === 'blocked') {
      return c.json({ error: 'Report is blocked' }, 403);
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
    console.error('Metadata fetch error:', error);
    return c.json({ error: 'Failed to fetch metadata' }, 500);
  }
});

export default image;
