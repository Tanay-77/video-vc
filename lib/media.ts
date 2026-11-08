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

export function extractVideoDuration(file: File | Blob): Promise<number> {
  return new Promise((resolve) => {
    if (
      typeof document === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return resolve(0);
    }

    try {
      const video = document.createElement('video');
      video.preload = 'metadata';

      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        try {
          if (video.src && video.src.startsWith('blob:')) {
            URL.revokeObjectURL(video.src);
          }
          video.src = '';
        } catch {}
      };

      // In test/headless environments (e.g. jsdom), media events do not fire
      const timer = setTimeout(() => {
        cleanup();
        resolve(0);
      }, 300);

      video.onloadedmetadata = () => {
        clearTimeout(timer);
        const dur = video.duration;
        cleanup();
        resolve(Number.isFinite(dur) && dur > 0 ? dur : 0);
      };

      video.onerror = () => {
        clearTimeout(timer);
        cleanup();
        resolve(0);
      };

      video.src = URL.createObjectURL(file);
    } catch {
      resolve(0);
    }
  });
}

export async function saveMedia(file: File): Promise<MediaItem> {
  const db = await openDB();
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  let duration = await extractVideoDuration(file);
  // Default to 10s if duration cannot be parsed (e.g. mock/audio/unsupported container/headless)
  if (duration <= 0) {
    duration = 10;
  }

  const record: StoredMediaRecord = {
    id,
    name: file.name,
    size: file.size,
    duration,
    type: file.type || 'video/mp4',
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
