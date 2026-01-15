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
