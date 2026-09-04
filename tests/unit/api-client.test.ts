import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeApiBaseUrl, buildApiUrl, getBaseUrl, ApiError } from '../../src/lib/api-client';

describe('api-client URL construction', () => {
  const originalWindow = (global as any).window;

  beforeEach(() => {
    (global as any).window = {
      __API_BASE_URL__: undefined,
    };
  });

  afterEach(() => {
    (global as any).window = originalWindow;
  });

  describe('normalizeApiBaseUrl', () => {
    it('defaults to /api/v1 when undefined or empty', () => {
      expect(normalizeApiBaseUrl(undefined)).toBe('/api/v1');
      expect(normalizeApiBaseUrl('')).toBe('/api/v1');
      expect(normalizeApiBaseUrl('   ')).toBe('/api/v1');
    });

    it('handles relative paths properly', () => {
      expect(normalizeApiBaseUrl('/api')).toBe('/api/v1');
      expect(normalizeApiBaseUrl('/api/v1')).toBe('/api/v1');
      expect(normalizeApiBaseUrl('/custom')).toBe('/custom/api/v1');
    });

    it('handles absolute URLs properly', () => {
      expect(normalizeApiBaseUrl('https://api.jami.ai')).toBe('https://api.jami.ai/api/v1');
      expect(normalizeApiBaseUrl('https://api.jami.ai/')).toBe('https://api.jami.ai/api/v1');
      expect(normalizeApiBaseUrl('https://api.jami.ai/api/v1')).toBe('https://api.jami.ai/api/v1');
      expect(normalizeApiBaseUrl('https://api.jami.ai/api/v1/')).toBe('https://api.jami.ai/api/v1');
    });
  });

  describe('buildApiUrl dynamic resolution', () => {
    it('builds correct relative paths with default base', () => {
      (global as any).window.__API_BASE_URL__ = undefined;
      expect(buildApiUrl('/materials/books/upload')).toBe('/api/v1/materials/books/upload');
      expect(buildApiUrl('materials/books/upload')).toBe('/api/v1/materials/books/upload');
      expect(buildApiUrl('/meta/version')).toBe('/api/v1/meta/version');
    });

    it('does not duplicate /api/v1 if path already contains /api/v1', () => {
      (global as any).window.__API_BASE_URL__ = undefined;
      expect(buildApiUrl('/api/v1/materials/books/upload')).toBe('/api/v1/materials/books/upload');
    });

    it('dynamically reacts when window.__API_BASE_URL__ changes', () => {
      (global as any).window.__API_BASE_URL__ = 'https://backend.jami.internal';
      expect(getBaseUrl()).toBe('https://backend.jami.internal/api/v1');
      expect(buildApiUrl('/materials/books/upload')).toBe('https://backend.jami.internal/api/v1/materials/books/upload');

      // Change at runtime
      (global as any).window.__API_BASE_URL__ = 'https://staging.jami.internal/api/v1';
      expect(getBaseUrl()).toBe('https://staging.jami.internal/api/v1');
      expect(buildApiUrl('/meta/version')).toBe('https://staging.jami.internal/api/v1/meta/version');
    });
  });

  describe('ApiError', () => {
    it('properly constructs ApiError with status, data, and code', () => {
      const error = new ApiError('Not found', 404, { detail: 'Book not found' }, 'NOT_FOUND');
      expect(error.name).toBe('ApiError');
      expect(error.message).toBe('Not found');
      expect(error.status).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.data).toEqual({ detail: 'Book not found' });
    });
  });
});
