import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  detectImageMime,
  looksLikeBase64,
  validateBase64Image,
  validateImageBuffer,
} from './imageValidation.js';

// Minimal valid 1x1 PNG
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// Minimal JPEG (very small but with SOI marker) — use real tiny jpeg base64
const JPEG_TINY = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z',
  'base64',
);

describe('detectImageMime', () => {
  it('detects PNG', () => {
    assert.equal(detectImageMime(PNG_1X1), 'image/png');
  });

  it('detects JPEG', () => {
    assert.equal(detectImageMime(JPEG_TINY), 'image/jpeg');
  });

  it('rejects plain text', () => {
    assert.equal(detectImageMime(Buffer.from('PLACEHOLDER')), null);
  });
});

describe('looksLikeBase64', () => {
  it('rejects placeholder', () => {
    assert.equal(looksLikeBase64('PLACEHOLDER'), false);
  });

  it('accepts real png base64', () => {
    assert.equal(looksLikeBase64(PNG_1X1.toString('base64')), true);
  });
});

describe('validateImageBuffer', () => {
  it('accepts valid PNG', () => {
    const result = validateImageBuffer(PNG_1X1, 'image/png');
    assert.ok(!('error' in result));
    assert.equal(result.mimeType, 'image/png');
  });

  it('accepts valid JPEG', () => {
    const result = validateImageBuffer(JPEG_TINY, 'image/jpeg');
    assert.ok(!('error' in result));
    assert.equal(result.mimeType, 'image/jpeg');
  });

  it('rejects zero-byte file', () => {
    const result = validateImageBuffer(Buffer.alloc(0));
    assert.ok('error' in result);
    assert.equal(result.error, 'EMPTY_IMAGE');
  });

  it('rejects tiny invalid payload', () => {
    const result = validateImageBuffer(Buffer.from('PLACEHOLDER'));
    assert.ok('error' in result);
  });

  it('rejects MIME mismatch', () => {
    const result = validateImageBuffer(PNG_1X1, 'image/jpeg');
    assert.ok('error' in result);
    assert.equal(result.error, 'MIME_MISMATCH');
  });

  it('rejects oversized image', () => {
    const prev = process.env.MAX_UPLOAD_BYTES;
    process.env.MAX_UPLOAD_BYTES = '10';
    try {
      const result = validateImageBuffer(PNG_1X1);
      assert.ok('error' in result);
      assert.equal(result.error, 'IMAGE_TOO_LARGE');
    } finally {
      if (prev === undefined) delete process.env.MAX_UPLOAD_BYTES;
      else process.env.MAX_UPLOAD_BYTES = prev;
    }
  });
});

describe('validateBase64Image', () => {
  it('accepts valid PNG base64', () => {
    const result = validateBase64Image(PNG_1X1.toString('base64'), 'image/png');
    assert.ok(!('error' in result));
  });

  it('rejects invalid base64 / placeholder', () => {
    const result = validateBase64Image('PLACEHOLDER', 'image/jpeg');
    assert.ok('error' in result);
    assert.equal(result.error, 'INVALID_BASE64');
  });

  it('rejects plain text encoded as base64', () => {
    const fake = Buffer.from('this is not an image file at all').toString('base64');
    const result = validateBase64Image(fake, 'image/jpeg');
    assert.ok('error' in result);
    assert.equal(result.error, 'INVALID_IMAGE');
  });

  it('accepts data URL prefix', () => {
    const dataUrl = `data:image/png;base64,${PNG_1X1.toString('base64')}`;
    const result = validateBase64Image(dataUrl, 'image/png');
    assert.ok(!('error' in result));
  });
});

describe('fixture file if present', () => {
  it('can load package.json as non-image', () => {
    const buf = readFileSync(new URL('../../package.json', import.meta.url));
    const result = validateImageBuffer(buf, 'image/png');
    assert.ok('error' in result);
  });
});
