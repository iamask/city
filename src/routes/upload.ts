import { Hono } from 'hono';
import type { Env, UploadResponse } from '../types';
import {
  validateMimeType,
  validateMagicBytes,
  validateFileSize,
  computeSha256,
  generateId,
  sanitizeFilename,
  clampLatitude,
  clampLongitude,
  parseCoordinate,
} from '../utils/validation';
import { analyzeImage } from '../utils/ai';

const upload = new Hono<{ Bindings: Env }>();

upload.post('/', async (c) => {
  try {
    const formData = await c.req.formData();
    
    const text = formData.get('text') as string;
    const placeText = formData.get('place_text') as string;
    const observedAt = formData.get('observed_at') as string;
    const file = formData.get('file') as File | null;
    const latStr = formData.get('lat') as string | null;
    const lngStr = formData.get('lng') as string | null;
    const placeArea = formData.get('place_area') as string | null;
    
    if (!text || !placeText || !observedAt) {
      return c.json({ error: 'Missing required fields: text, place_text, observed_at' }, 400);
    }
    
    let imageBuffer: ArrayBuffer | null = null;
    let contentType: string | null = null;
    let sizeBytes: number | null = null;
    let sha256: string | null = null;
    let originalFilename: string | null = null;
    
    if (file && file.size > 0) {
      if (!validateFileSize(file.size)) {
        return c.json({ error: 'File too large. Maximum size is 10MB.' }, 400);
      }
      
      if (!validateMimeType(file.type)) {
        return c.json({ error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, HEIC' }, 400);
      }
      
      imageBuffer = await file.arrayBuffer();
      
      const detectedType = validateMagicBytes(imageBuffer);
      if (!detectedType) {
        return c.json({ error: 'Invalid image file' }, 400);
      }
      
      contentType = detectedType;
      sizeBytes = file.size;
      sha256 = await computeSha256(imageBuffer);
      originalFilename = sanitizeFilename(file.name);
    }
    
    let lat = parseCoordinate(latStr || undefined);
    let lng = parseCoordinate(lngStr || undefined);
    
    if (lat !== null) lat = clampLatitude(lat);
    if (lng !== null) lng = clampLongitude(lng);
    
    const aiResult = await analyzeImage(
      c.env,
      imageBuffer,
      text,
      placeText,
      placeArea,
      lat,
      lng
    );
    
    const id = generateId();
    const uploaderIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null;
    
    await c.env.DB.prepare(`
      INSERT INTO images (
        id, image_data, content_type, size_bytes, sha256, original_filename,
        observed_at, uploader_ip, text, place_text, place_area, lat, lng,
        status, visibility,
        ai_caption, ai_category, ai_severity, ai_confidence, ai_labels,
        ai_signals_json, ai_recommendations_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      imageBuffer,
      contentType,
      sizeBytes,
      sha256,
      originalFilename,
      observedAt,
      uploaderIp,
      text,
      placeText,
      placeArea,
      lat,
      lng,
      'new',
      'public',
      aiResult.caption,
      aiResult.category,
      aiResult.severity,
      aiResult.confidence,
      JSON.stringify(aiResult.labels),
      JSON.stringify(aiResult.signals),
      JSON.stringify(aiResult.recommendations)
    ).run();
    
    const response: UploadResponse = {
      id,
      viewUrl: `/i/${id}`,
      ai: {
        caption: aiResult.caption,
        domain: aiResult.signals.domain,
        issue_types: aiResult.signals.issue_types,
        severity: aiResult.severity,
        confidence: aiResult.confidence,
        recommended_actions: aiResult.recommendations.recommended_actions,
      },
    };
    
    return c.json(response, 201);
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

export default upload;
