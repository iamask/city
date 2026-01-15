import type { Env, AISignals, AIRecommendations, AIAnalysisResult } from '../types';

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  waste: ['trash', 'garbage', 'bin', 'dump', 'litter', 'waste', 'rubbish', 'debris', 'refuse'],
  water: ['water', 'leak', 'pipe', 'flood', 'drain', 'sewage', 'puddle', 'drip', 'tap', 'hydrant'],
  power: ['light', 'streetlight', 'lamp', 'electric', 'power', 'wire', 'pole', 'bulb', 'energy'],
  roads: ['pothole', 'road', 'pavement', 'crack', 'asphalt', 'street', 'sidewalk', 'curb'],
  traffic: ['traffic', 'signal', 'congestion', 'jam', 'vehicle', 'car', 'accident'],
};

const ISSUE_TYPES: Record<string, Record<string, string[]>> = {
  waste: {
    overflowing_bin: ['overflow', 'full', 'spill'],
    illegal_dumping: ['dump', 'illegal', 'pile'],
    missed_collection: ['missed', 'uncollected', 'schedule'],
  },
  water: {
    leak: ['leak', 'drip', 'broken'],
    water_wastage: ['waste', 'running', 'open'],
    flooding: ['flood', 'submerge', 'water level'],
  },
  power: {
    streetlight_outage: ['out', 'dark', 'not working', 'broken'],
    streetlight_on_daytime: ['daytime', 'noon', 'day', 'morning', 'afternoon', 'sun'],
    overuse_report: ['overuse', 'excessive', 'waste'],
  },
  roads: {
    pothole: ['pothole', 'hole', 'crater'],
    blocked_road: ['blocked', 'obstruct', 'barrier'],
  },
  traffic: {
    congestion: ['congestion', 'jam', 'slow', 'stuck'],
    signal_fault: ['signal', 'light', 'malfunction'],
  },
};

const SEVERITY_KEYWORDS = {
  moderate: ['urgent', 'severe', 'dangerous', 'hazard', 'emergency', 'critical', 'major', 'overflow', 'flood'],
  mild: ['minor', 'small', 'slight', 'little'],
};

function detectDomain(text: string, labels: string[]): string {
  const combined = `${text} ${labels.join(' ')}`.toLowerCase();
  
  let maxScore = 0;
  let detectedDomain = 'other';
  
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywords.filter(kw => combined.includes(kw)).length;
    if (score > maxScore) {
      maxScore = score;
      detectedDomain = domain;
    }
  }
  
  return detectedDomain;
}

function detectIssueTypes(domain: string, text: string, labels: string[]): string[] {
  const combined = `${text} ${labels.join(' ')}`.toLowerCase();
  const issues: string[] = [];
  
  const domainIssues = ISSUE_TYPES[domain];
  if (!domainIssues) return ['general_report'];
  
  for (const [issueType, keywords] of Object.entries(domainIssues)) {
    if (keywords.some(kw => combined.includes(kw))) {
      issues.push(issueType);
    }
  }
  
  return issues.length > 0 ? issues : ['general_report'];
}

function detectSeverity(text: string, labels: string[]): 'safe' | 'mild' | 'moderate' {
  const combined = `${text} ${labels.join(' ')}`.toLowerCase();
  
  if (SEVERITY_KEYWORDS.moderate.some(kw => combined.includes(kw))) {
    return 'moderate';
  }
  if (SEVERITY_KEYWORDS.mild.some(kw => combined.includes(kw))) {
    return 'mild';
  }
  return 'safe';
}

function generateRecommendations(domain: string, issueTypes: string[], placeText: string): AIRecommendations {
  const actions: AIRecommendations['recommended_actions'] = [];
  
  const recommendationMap: Record<string, Record<string, { title: string; detail: string; priority: 'high' | 'medium' | 'low' }>> = {
    waste: {
      overflowing_bin: { title: 'Increase waste collection frequency', detail: `Bin overflow reported at ${placeText}`, priority: 'high' },
      illegal_dumping: { title: 'Investigate illegal dumping site', detail: `Illegal dumping reported at ${placeText}`, priority: 'high' },
      missed_collection: { title: 'Reschedule waste collection', detail: `Missed collection at ${placeText}`, priority: 'medium' },
      general_report: { title: 'Review waste management', detail: `Waste issue reported at ${placeText}`, priority: 'medium' },
    },
    water: {
      leak: { title: 'Dispatch maintenance for pipe repair', detail: `Water leak reported at ${placeText}`, priority: 'high' },
      water_wastage: { title: 'Inspect water infrastructure', detail: `Water wastage reported at ${placeText}`, priority: 'medium' },
      flooding: { title: 'Emergency drainage response', detail: `Flooding reported at ${placeText}`, priority: 'high' },
      general_report: { title: 'Review water infrastructure', detail: `Water issue reported at ${placeText}`, priority: 'medium' },
    },
    power: {
      streetlight_outage: { title: 'Repair streetlight', detail: `Streetlight outage at ${placeText}`, priority: 'medium' },
      streetlight_on_daytime: { title: 'Inspect streetlight timer/photocell', detail: `Streetlight on during daytime at ${placeText}`, priority: 'low' },
      overuse_report: { title: 'Audit power consumption', detail: `Power overuse reported at ${placeText}`, priority: 'medium' },
      general_report: { title: 'Review power infrastructure', detail: `Power issue reported at ${placeText}`, priority: 'medium' },
    },
    roads: {
      pothole: { title: 'Schedule road repair', detail: `Pothole reported at ${placeText}`, priority: 'medium' },
      blocked_road: { title: 'Clear road obstruction', detail: `Road blocked at ${placeText}`, priority: 'high' },
      general_report: { title: 'Inspect road condition', detail: `Road issue reported at ${placeText}`, priority: 'medium' },
    },
    traffic: {
      congestion: { title: 'Review traffic flow', detail: `Congestion reported at ${placeText}`, priority: 'medium' },
      signal_fault: { title: 'Repair traffic signal', detail: `Signal fault at ${placeText}`, priority: 'high' },
      general_report: { title: 'Review traffic management', detail: `Traffic issue reported at ${placeText}`, priority: 'medium' },
    },
  };
  
  const domainRecs = recommendationMap[domain];
  if (domainRecs) {
    for (const issueType of issueTypes) {
      const rec = domainRecs[issueType] || domainRecs['general_report'];
      if (rec && !actions.find(a => a.title === rec.title)) {
        actions.push(rec);
      }
    }
  }
  
  if (actions.length === 0) {
    actions.push({
      title: 'Review reported issue',
      detail: `Issue reported at ${placeText}`,
      priority: 'medium',
    });
  }
  
  return { recommended_actions: actions };
}

function deriveAreaKey(placeArea: string | null, lat: number | null, lng: number | null): string | null {
  if (placeArea) {
    return `area:${placeArea.toLowerCase().replace(/\s+/g, '_')}`;
  }
  if (lat !== null && lng !== null) {
    const gridLat = Math.round(lat * 100) / 100;
    const gridLng = Math.round(lng * 100) / 100;
    return `grid:${gridLat}:${gridLng}`;
  }
  return null;
}

export async function analyzeImage(
  env: Env,
  imageBuffer: ArrayBuffer | null,
  text: string,
  placeText: string,
  placeArea: string | null,
  lat: number | null,
  lng: number | null
): Promise<AIAnalysisResult> {
  let caption = '';
  let labels: string[] = [];
  let confidence = 0.5;
  
  if (imageBuffer && imageBuffer.byteLength > 0) {
    try {
      const [captionResult, classificationResult] = await Promise.all([
        env.AI.run('@cf/unum/uform-gen2-qwen-500m', {
          image: [...new Uint8Array(imageBuffer)],
          prompt: 'Describe this image in detail, focusing on any urban infrastructure issues like waste, water leaks, road damage, or lighting problems.',
          max_tokens: 256,
        }),
        env.AI.run('@cf/microsoft/resnet-50', {
          image: [...new Uint8Array(imageBuffer)],
        }),
      ]);
      
      caption = (captionResult as { description?: string }).description || '';
      
      const classResults = classificationResult as Array<{ label: string; score: number }>;
      if (Array.isArray(classResults)) {
        labels = classResults.slice(0, 5).map(r => r.label);
        confidence = classResults[0]?.score || 0.5;
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      caption = 'Image analysis unavailable';
    }
  } else {
    caption = `Report: ${text.slice(0, 100)}`;
  }
  
  const combinedText = `${text} ${caption}`;
  const domain = detectDomain(combinedText, labels) as AISignals['domain'];
  const issueTypes = detectIssueTypes(domain, combinedText, labels);
  const severity = detectSeverity(combinedText, labels);
  const recommendations = generateRecommendations(domain, issueTypes, placeText);
  const areaKey = deriveAreaKey(placeArea, lat, lng);
  
  const signals: AISignals = {
    domain,
    issue_types: issueTypes,
    severity,
    confidence,
    location_quality: lat !== null && lng !== null ? 'gps' : placeText ? 'text' : 'unknown',
    area_key: areaKey,
    evidence: {
      has_photo: imageBuffer !== null && imageBuffer.byteLength > 0,
      image_labels: labels,
      caption: caption || null,
    },
  };
  
  let category = 'report';
  if (labels.some(l => l.toLowerCase().includes('screen') || l.toLowerCase().includes('monitor'))) {
    category = 'screenshot';
  } else if (labels.some(l => l.toLowerCase().includes('document') || l.toLowerCase().includes('paper'))) {
    category = 'document';
  } else if (imageBuffer) {
    category = 'photo';
  }
  
  return {
    caption,
    category,
    severity,
    confidence,
    labels,
    signals,
    recommendations,
  };
}
