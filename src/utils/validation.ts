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

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
  
  // Check for HEIC/HEIF (ftyp box)
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
