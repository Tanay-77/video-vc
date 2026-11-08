import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveMedia, getMediaUrl, getMediaBlob } from '../lib/media';

describe('lib/media.ts', () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn((blob: Blob) => `blob:http://localhost/${Math.random().toString(36).slice(2)}`);
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('saves media file into IndexedDB and returns MediaItem with duration and size', async () => {
    const file = new File(['fake video buffer data 1234567890'], 'sample_drone.mp4', {
      type: 'video/mp4',
    });

    const item = await saveMedia(file);

    expect(item).toBeDefined();
    expect(item.id).toBeDefined();
    expect(item.name).toBe('sample_drone.mp4');
    expect(item.size).toBe(file.size);
    expect(typeof item.duration).toBe('number');
    expect(item.duration).toBeGreaterThan(0);

    // Verify blob retrieval
    const retrievedBlob = await getMediaBlob(item.id);
    expect(retrievedBlob).not.toBeNull();

    // Verify URL creation
    const url = await getMediaUrl(item.id);
    expect(url).toMatch(/^blob:/);
  });

  it('rejects when requesting a non-existent media id', async () => {
    await expect(getMediaUrl('non-existent-media-id')).rejects.toThrow();
  });
});
