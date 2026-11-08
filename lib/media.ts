import { MediaItem } from './types';

const DB_NAME = 'video-vc-db';
const DB_VERSION = 1;
const STORE_NAME = 'media';

interface StoredMediaRecord {
  id: string;
  name: string;
  size: number;
  duration: number;
  type: string;
  blob: Blob | File | ArrayBuffer;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Reads the duration from a hidden video or audio element via loadedmetadata
 */
export function readMediaDuration(file: File | Blob, fileName?: string): Promise<number> {
  return new Promise((resolve) => {
    if (
      typeof document === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return resolve(10);
    }

    try {
      const name = (fileName || (file instanceof File ? file.name : '')).toLowerCase();
      const isAudio =
        name.endsWith('.mp3') ||
        name.endsWith('.wav') ||
        ('type' in file && typeof file.type === 'string' && file.type.startsWith('audio/'));

      const mediaEl = document.createElement(isAudio ? 'audio' : 'video');
      mediaEl.preload = 'metadata';

      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        try {
          if (mediaEl.src && mediaEl.src.startsWith('blob:')) {
            URL.revokeObjectURL(mediaEl.src);
          }
          mediaEl.src = '';
        } catch {}
      };

      // Timeout fallback for headless or non-standard environments
      const timer = setTimeout(() => {
        cleanup();
        resolve(10);
      }, 600);

      mediaEl.onloadedmetadata = () => {
        clearTimeout(timer);
        const dur = mediaEl.duration;
        cleanup();
        resolve(Number.isFinite(dur) && dur > 0 ? dur : 10);
      };

      mediaEl.onerror = () => {
        clearTimeout(timer);
        cleanup();
        resolve(10);
      };

      mediaEl.src = URL.createObjectURL(file);
    } catch {
      resolve(10);
    }
  });
}

// Backward-compatible alias
export const extractVideoDuration = readMediaDuration;

export async function saveMedia(file: File, explicitDuration?: number): Promise<MediaItem> {
  const db = await openDB();
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  let duration = explicitDuration && explicitDuration > 0
    ? explicitDuration
    : await readMediaDuration(file, file.name);

  if (duration <= 0) {
    duration = 10;
  }

  const record: StoredMediaRecord = {
    id,
    name: file.name,
    size: file.size,
    duration,
    type: file.type || (file.name.endsWith('.mp3') ? 'audio/mpeg' : file.name.endsWith('.wav') ? 'audio/wav' : 'video/mp4'),
    blob: file,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => {
      resolve({
        id,
        name: record.name,
        duration: record.duration,
        size: record.size,
      });
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to save media in IndexedDB'));
    };
  });
}

export async function getMediaUrl(id: string): Promise<string> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as StoredMediaRecord | undefined;
      if (!record) {
        return reject(new Error(`Media with id "${id}" not found in IndexedDB`));
      }
      if (typeof URL === 'undefined' || !URL.createObjectURL) {
        return reject(new Error('URL.createObjectURL is not available'));
      }

      let blob: Blob;
      if (record.blob instanceof Blob) {
        blob = record.blob;
      } else {
        blob = new Blob([record.blob as any], { type: record.type || 'video/mp4' });
      }

      const url = URL.createObjectURL(blob);
      resolve(url);
    };

    request.onerror = () => {
      reject(request.error || new Error(`Error reading media "${id}" from IndexedDB`));
    };
  });
}

export async function getMediaBlob(id: string): Promise<Blob | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as StoredMediaRecord | undefined;
      if (!record || !record.blob) {
        return resolve(null);
      }
      if (record.blob instanceof Blob) {
        return resolve(record.blob);
      }
      return resolve(new Blob([record.blob as any], { type: record.type }));
    };

    request.onerror = () => {
      reject(request.error || new Error(`Error reading media "${id}"`));
    };
  });
}
