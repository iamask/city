import { Hono } from 'hono';
import type { Env, DashboardStats, Hotspot } from '../types';

const analytics = new Hono<{ Bindings: Env }>();

analytics.get('/stats', async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [totalResult, todayResult, statusResult, visibilityResult, severityResult, domainResult] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM images').first<{ count: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM images WHERE date(created_at) = ?").bind(today).first<{ count: number }>(),
      c.env.DB.prepare('SELECT status, COUNT(*) as count FROM images GROUP BY status').all(),
      c.env.DB.prepare('SELECT visibility, COUNT(*) as count FROM images GROUP BY visibility').all(),
      c.env.DB.prepare('SELECT ai_severity, COUNT(*) as count FROM images GROUP BY ai_severity').all(),
      c.env.DB.prepare("SELECT json_extract(ai_signals_json, '$.domain') as domain, COUNT(*) as count FROM images GROUP BY domain ORDER BY count DESC LIMIT 1").first<{ domain: string; count: number }>(),
    ]);
    
    const byStatus: Record<string, number> = {};
    (statusResult.results || []).forEach((row: Record<string, unknown>) => {
      byStatus[row.status as string] = row.count as number;
    });
    
    const byVisibility: Record<string, number> = {};
    (visibilityResult.results || []).forEach((row: Record<string, unknown>) => {
      byVisibility[row.visibility as string] = row.count as number;
    });
    
    const bySeverity: Record<string, number> = {};
    (severityResult.results || []).forEach((row: Record<string, unknown>) => {
      const severity = (row.ai_severity as string) || 'unknown';
      bySeverity[severity] = row.count as number;
    });
    
    const stats: DashboardStats = {
      total: totalResult?.count || 0,
      today: todayResult?.count || 0,
      flagged: byVisibility['blocked'] || 0,
      topDomain: domainResult?.domain || null,
      byStatus,
      byVisibility,
      bySeverity,
    };
    
    return c.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

analytics.get('/flagged', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  
  try {
    const results = await c.env.DB.prepare(`
      SELECT 
        id, content_type, size_bytes, original_filename,
        created_at, observed_at, text, place_text, place_area, lat, lng,
        status, visibility,
        ai_caption, ai_category, ai_severity, ai_confidence, ai_labels,
        ai_signals_json, ai_recommendations_json
      FROM images 
      WHERE visibility = 'blocked' OR ai_severity IN ('mild', 'moderate')
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(limit).all();
    
    const flagged = (results.results || []).map((row: Record<string, unknown>) => ({
      ...row,
      ai_labels: row.ai_labels ? JSON.parse(row.ai_labels as string) : [],
      ai_signals: row.ai_signals_json ? JSON.parse(row.ai_signals_json as string) : null,
      hasImage: (row.size_bytes as number) > 0,
      imageUrl: row.size_bytes ? `/api/image/${row.id}` : null,
    }));
    
    flagged.forEach((f: Record<string, unknown>) => {
      delete f.ai_signals_json;
      delete f.ai_recommendations_json;
    });
    
    return c.json({ flagged });
  } catch (error) {
    console.error('Flagged error:', error);
    return c.json({ error: 'Failed to fetch flagged content' }, 500);
  }
});

analytics.get('/categories', async (c) => {
  try {
    const results = await c.env.DB.prepare(`
      SELECT ai_category as category, COUNT(*) as count 
      FROM images 
      GROUP BY ai_category 
      ORDER BY count DESC
    `).all();
    
    const categories = (results.results || []).map((row: Record<string, unknown>) => ({
      category: row.category || 'unknown',
      count: row.count,
    }));
    
    return c.json({ categories });
  } catch (error) {
    console.error('Categories error:', error);
    return c.json({ error: 'Failed to fetch categories' }, 500);
  }
});

analytics.get('/domains', async (c) => {
  try {
    const results = await c.env.DB.prepare(`
      SELECT json_extract(ai_signals_json, '$.domain') as domain, COUNT(*) as count 
      FROM images 
      GROUP BY domain 
      ORDER BY count DESC
    `).all();
    
    const domains = (results.results || []).map((row: Record<string, unknown>) => ({
      domain: row.domain || 'other',
      count: row.count,
    }));
    
    return c.json({ domains });
  } catch (error) {
    console.error('Domains error:', error);
    return c.json({ error: 'Failed to fetch domains' }, 500);
  }
});

analytics.get('/hotspots', async (c) => {
  const window = c.req.query('window') || '7d';
  const domain = c.req.query('domain');
  
  let days = 7;
  if (window === '24h') days = 1;
  else if (window === '30d') days = 30;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString();
  
  try {
    let query = `
      SELECT 
        json_extract(ai_signals_json, '$.domain') as domain,
        json_extract(ai_signals_json, '$.issue_types') as issue_types,
        COALESCE(place_area, json_extract(ai_signals_json, '$.area_key')) as area_key,
        place_text,
        ai_severity,
        id
      FROM images 
      WHERE created_at >= ?
    `;
    const params: string[] = [cutoff];
    
    if (domain) {
      query += " AND json_extract(ai_signals_json, '$.domain') = ?";
      params.push(domain);
    }
    
    const results = await c.env.DB.prepare(query).bind(...params).all();
    
    const hotspotMap = new Map<string, {
      domain: string;
      issue_type: string;
      area_key: string;
      count: number;
      severities: string[];
      places: string[];
      ids: string[];
    }>();
    
    for (const row of results.results || []) {
      const r = row as Record<string, unknown>;
      const dom = (r.domain as string) || 'other';
      const issueTypesStr = r.issue_types as string;
      const issueTypes: string[] = issueTypesStr ? JSON.parse(issueTypesStr) : ['general_report'];
      const areaKey = (r.area_key as string) || 'unknown';
      const placeText = r.place_text as string;
      const severity = r.ai_severity as string;
      const id = r.id as string;
      
      for (const issueType of issueTypes) {
        const key = `${dom}:${issueType}:${areaKey}`;
        
        if (!hotspotMap.has(key)) {
          hotspotMap.set(key, {
            domain: dom,
            issue_type: issueType,
            area_key: areaKey,
            count: 0,
            severities: [],
            places: [],
            ids: [],
          });
        }
        
        const hotspot = hotspotMap.get(key)!;
        hotspot.count++;
        hotspot.severities.push(severity);
        if (placeText && !hotspot.places.includes(placeText)) {
          hotspot.places.push(placeText);
        }
        if (hotspot.ids.length < 5) {
          hotspot.ids.push(id);
        }
      }
    }
    
    const severityScore: Record<string, number> = { safe: 0.3, mild: 0.6, moderate: 0.9 };
    
    const hotspots: Hotspot[] = Array.from(hotspotMap.values())
      .map(h => ({
        domain: h.domain,
        issue_type: h.issue_type,
        area_key: h.area_key,
        count: h.count,
        avg_severity: h.severities.reduce((sum, s) => sum + (severityScore[s] || 0.5), 0) / h.severities.length,
        top_places: h.places.slice(0, 3),
        sample_ids: h.ids,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    return c.json({ window, hotspots });
  } catch (error) {
    console.error('Hotspots error:', error);
    return c.json({ error: 'Failed to fetch hotspots' }, 500);
  }
});

analytics.get('/recommendations', async (c) => {
  const window = c.req.query('window') || '7d';
  
  let days = 7;
  if (window === '24h') days = 1;
  else if (window === '30d') days = 30;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString();
  
  try {
    const results = await c.env.DB.prepare(`
      SELECT 
        json_extract(ai_signals_json, '$.domain') as domain,
        json_extract(ai_signals_json, '$.issue_types') as issue_types,
        COALESCE(place_area, json_extract(ai_signals_json, '$.area_key')) as area_key,
        COUNT(*) as count
      FROM images 
      WHERE created_at >= ?
      GROUP BY domain, area_key
      ORDER BY count DESC
      LIMIT 10
    `).bind(cutoff).all();
    
    const recommendations = (results.results || []).map((row: Record<string, unknown>) => {
      const dom = (row.domain as string) || 'other';
      const areaKey = (row.area_key as string) || 'unknown';
      const count = row.count as number;
      
      let priority: 'high' | 'medium' | 'low' = 'medium';
      if (count >= 10) priority = 'high';
      else if (count <= 2) priority = 'low';
      
      const titleMap: Record<string, string> = {
        waste: 'Increase waste management attention',
        water: 'Address water infrastructure issues',
        power: 'Review power/lighting infrastructure',
        roads: 'Schedule road maintenance',
        traffic: 'Improve traffic management',
        other: 'Review reported issues',
      };
      
      return {
        domain: dom,
        area_key: areaKey,
        priority,
        title: `${titleMap[dom] || titleMap.other} in ${areaKey}`,
        rationale: `${count} reports in the last ${window}`,
        supporting_hotspot: {
          issue_type: 'multiple',
          count,
        },
      };
    });
    
    return c.json({ window, recommendations });
  } catch (error) {
    console.error('Recommendations error:', error);
    return c.json({ error: 'Failed to fetch recommendations' }, 500);
  }
});

analytics.get('/timeseries', async (c) => {
  const window = c.req.query('window') || '30d';
  const bucket = c.req.query('bucket') || 'day';
  const domain = c.req.query('domain');
  
  let days = 30;
  if (window === '7d') days = 7;
  else if (window === '24h') days = 1;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString();
  
  try {
    let query = `
      SELECT 
        date(created_at) as t,
        COUNT(*) as count
      FROM images 
      WHERE created_at >= ?
    `;
    const params: string[] = [cutoff];
    
    if (domain) {
      query += " AND json_extract(ai_signals_json, '$.domain') = ?";
      params.push(domain);
    }
    
    query += ' GROUP BY t ORDER BY t ASC';
    
    const results = await c.env.DB.prepare(query).bind(...params).all();
    
    const series = (results.results || []).map((row: Record<string, unknown>) => ({
      t: row.t,
      count: row.count,
    }));
    
    return c.json({ window, bucket, series });
  } catch (error) {
    console.error('Timeseries error:', error);
    return c.json({ error: 'Failed to fetch timeseries' }, 500);
  }
});

analytics.get('/domain-timeseries', async (c) => {
  const window = c.req.query('window') || '30d';
  
  let days = 30;
  if (window === '7d') days = 7;
  else if (window === '24h') days = 1;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString();
  
  try {
    const results = await c.env.DB.prepare(`
      SELECT 
        date(created_at) as t,
        json_extract(ai_signals_json, '$.domain') as domain,
        COUNT(*) as count
      FROM images 
      WHERE created_at >= ?
      GROUP BY t, domain
      ORDER BY t ASC
    `).bind(cutoff).all();
    
    const seriesMap = new Map<string, Record<string, number>>();
    
    for (const row of results.results || []) {
      const r = row as Record<string, unknown>;
      const t = r.t as string;
      const domain = (r.domain as string) || 'other';
      const count = r.count as number;
      
      if (!seriesMap.has(t)) {
        seriesMap.set(t, { waste: 0, water: 0, power: 0, roads: 0, traffic: 0, other: 0 });
      }
      
      const entry = seriesMap.get(t)!;
      entry[domain] = (entry[domain] || 0) + count;
    }
    
    const series = Array.from(seriesMap.entries()).map(([t, counts]) => ({
      t,
      ...counts,
    }));
    
    return c.json({ window, bucket: 'day', series });
  } catch (error) {
    console.error('Domain timeseries error:', error);
    return c.json({ error: 'Failed to fetch domain timeseries' }, 500);
  }
});

analytics.get('/severity-timeseries', async (c) => {
  const window = c.req.query('window') || '30d';
  
  let days = 30;
  if (window === '7d') days = 7;
  else if (window === '24h') days = 1;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString();
  
  try {
    const results = await c.env.DB.prepare(`
      SELECT 
        date(created_at) as t,
        ai_severity as severity,
        COUNT(*) as count
      FROM images 
      WHERE created_at >= ?
      GROUP BY t, severity
      ORDER BY t ASC
    `).bind(cutoff).all();
    
    const seriesMap = new Map<string, Record<string, number>>();
    
    for (const row of results.results || []) {
      const r = row as Record<string, unknown>;
      const t = r.t as string;
      const severity = (r.severity as string) || 'unknown';
      const count = r.count as number;
      
      if (!seriesMap.has(t)) {
        seriesMap.set(t, { safe: 0, mild: 0, moderate: 0 });
      }
      
      const entry = seriesMap.get(t)!;
      entry[severity] = (entry[severity] || 0) + count;
    }
    
    const series = Array.from(seriesMap.entries()).map(([t, counts]) => ({
      t,
      ...counts,
    }));
    
    return c.json({ window, bucket: 'day', series });
  } catch (error) {
    console.error('Severity timeseries error:', error);
    return c.json({ error: 'Failed to fetch severity timeseries' }, 500);
  }
});

export default analytics;
