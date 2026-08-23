import {
  validateImageBuffer,
  type ImageValidationError,
  type ValidatedImage,
} from './imageValidation.js';

export type OpenAIFileRef = {
  name?: string;
  id?: string;
  mime_type?: string;
  download_link?: string;
};

export function parseOpenAIFileIdRefs(body: Record<string, unknown>): OpenAIFileRef[] {
  const raw = body.openaiFileIdRefs;
  if (!raw || !Array.isArray(raw)) return [];

  const refs: OpenAIFileRef[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      try {
        const parsed = JSON.parse(item) as OpenAIFileRef;
        if (parsed.download_link) refs.push(parsed);
      } catch {
        // ignore malformed entries
      }
      continue;
    }
    if (item && typeof item === 'object' && 'download_link' in item) {
      refs.push(item as OpenAIFileRef);
    }
  }
  return refs;
}

function isAllowedFetchHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'files.oaiusercontent.com' || host.endsWith('.oaiusercontent.com')) {
    return true;
  }
  if (host === 'localhost' || host === '127.0.0.1') return false;
  if (host.endsWith('.local') || host.endsWith('.internal')) return false;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) {
      return false;
    }
  }
  return true;
}

export async function fetchRemoteImageUrl(
  fileUrl: string,
): Promise<ValidatedImage | ImageValidationError> {
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return {
      status: 400,
      error: 'INVALID_URL',
      message: 'file_url is not a valid URL',
    };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      status: 400,
      error: 'INVALID_URL',
      message: 'file_url must be http or https',
    };
  }
  if (!isAllowedFetchHost(url.hostname)) {
    return {
      status: 400,
      error: 'URL_NOT_ALLOWED',
      message: 'file_url host is not allowed',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*' },
    });
    if (!res.ok) {
      return {
        status: 400,
        error: 'URL_FETCH_FAILED',
        message: `Could not download image (HTTP ${res.status})`,
      };
    }
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return validateImageBuffer(buffer, contentType);
  } catch {
    return {
      status: 400,
      error: 'URL_FETCH_FAILED',
      message: 'Could not download image',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOpenAIFileRef(
  ref: OpenAIFileRef,
): Promise<ValidatedImage | ImageValidationError> {
  const link = ref.download_link?.trim();
  if (!link) {
    return {
      status: 400,
      error: 'MISSING_DOWNLOAD_LINK',
      message: 'openaiFileIdRefs entry has no download_link',
    };
  }
  const fetched = await fetchRemoteImageUrl(link);
  if ('error' in fetched) return fetched;
  // Prefer mime from ref when buffer detection agrees or ref is image/*
  if (ref.mime_type?.startsWith('image/')) {
    const validated = validateImageBuffer(fetched.buffer, ref.mime_type);
    if (!('error' in validated)) return validated;
  }
  return fetched;
}
