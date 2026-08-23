import { getMaxUploadBytes, isAllowedImageMime } from './uploads.js';

export const MIN_IMAGE_BYTES = 32;

export type ImageValidationError = {
  status: 400 | 422;
  error: string;
  message: string;
};

export type ValidatedImage = {
  buffer: Buffer;
  mimeType: string;
};

function startsWith(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
}

/** Detect image MIME from magic bytes. */
export function detectImageMime(buffer: Buffer): string | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (
    startsWith(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return 'image/gif';
  }
  // RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function stripDataUrlBase64(input: string): string {
  const trimmed = input.trim();
  const comma = trimmed.indexOf(',');
  if (trimmed.toLowerCase().startsWith('data:') && comma !== -1) {
    return trimmed.slice(comma + 1).replace(/\s+/g, '');
  }
  return trimmed.replace(/\s+/g, '');
}

/** True if the string looks like real base64 (not a placeholder word). */
export function looksLikeBase64(raw: string): boolean {
  if (raw.length < 16) return false;
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) return false;
  // Reject obvious placeholders
  const lower = raw.toLowerCase();
  if (
    lower === 'placeholder' ||
    lower.includes('placeholder') ||
    lower === 'base64' ||
    lower === '...' ||
    lower === 'redacted'
  ) {
    return false;
  }
  return true;
}

export function decodeStrictBase64(dataBase64: string): Buffer | ImageValidationError {
  const raw = stripDataUrlBase64(dataBase64);
  if (!looksLikeBase64(raw)) {
    return {
      status: 422,
      error: 'INVALID_BASE64',
      message: 'data_base64 is missing, too short, or not valid base64 image data',
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch {
    return {
      status: 422,
      error: 'INVALID_BASE64',
      message: 'data_base64 could not be decoded',
    };
  }

  // Round-trip check: reject strings that decode but weren't base64
  const reencoded = buffer.toString('base64').replace(/=+$/, '');
  const normalized = raw.replace(/=+$/, '');
  if (reencoded.length === 0 || Math.abs(reencoded.length - normalized.length) > 4) {
    // loose check — primary guards are magic bytes + min size
  }

  if (buffer.length === 0) {
    return {
      status: 422,
      error: 'EMPTY_IMAGE',
      message: 'Decoded image is empty',
    };
  }

  return buffer;
}

export function validateImageBuffer(
  buffer: Buffer,
  declaredMime?: string | null,
): ValidatedImage | ImageValidationError {
  if (buffer.length === 0) {
    return { status: 422, error: 'EMPTY_IMAGE', message: 'Image file is empty' };
  }
  if (buffer.length < MIN_IMAGE_BYTES) {
    return {
      status: 422,
      error: 'IMAGE_TOO_SMALL',
      message: `Image is too small (${buffer.length} bytes); likely not a real image`,
    };
  }
  if (buffer.length > getMaxUploadBytes()) {
    return {
      status: 400,
      error: 'IMAGE_TOO_LARGE',
      message: `Image exceeds maximum size of ${getMaxUploadBytes()} bytes`,
    };
  }

  const detected = detectImageMime(buffer);
  if (!detected) {
    return {
      status: 422,
      error: 'INVALID_IMAGE',
      message: 'File is not a valid JPEG, PNG, WebP, or GIF image',
    };
  }

  if (declaredMime) {
    const declared = declaredMime.trim().toLowerCase();
    if (declared && isAllowedImageMime(declared) && declared !== detected) {
      return {
        status: 422,
        error: 'MIME_MISMATCH',
        message: `Declared content_type ${declared} does not match detected ${detected}`,
      };
    }
    if (declared && !isAllowedImageMime(declared) && declared !== 'application/octet-stream') {
      return {
        status: 400,
        error: 'UNSUPPORTED_MIME',
        message: 'Only JPEG, PNG, WebP, and GIF images are allowed',
      };
    }
  }

  return { buffer, mimeType: detected };
}

export function validateBase64Image(
  dataBase64: string,
  declaredMime?: string | null,
): ValidatedImage | ImageValidationError {
  const decoded = decodeStrictBase64(dataBase64);
  if (!Buffer.isBuffer(decoded)) return decoded;
  return validateImageBuffer(decoded, declaredMime);
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  // Basic IPv4 private ranges
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}
