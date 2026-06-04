export type StoredFileStatus = 'queued' | 'converting' | 'success' | 'error';

export interface StoredQueueItem {
  id: string;
  name: string;
  type: string;
  lastModified: number;
  outputFormatId: string;
  status: StoredFileStatus;
  progress: number;
  message: string;
  sourceBuffer: ArrayBuffer;
  resultBuffer?: ArrayBuffer;
  resultMime?: string;
  resultFilename?: string;
}

export interface QueueSnapshot {
  nextId: number;
  hasStartedConversion: boolean;
  items: StoredQueueItem[];
}

const DB_NAME = 'ConvertAllLocalConverter';
const DB_VERSION = 1;
const STORE = 'snapshots';
const SNAPSHOT_KEY = 'queue';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Ouverture IndexedDB échouée.'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error('Transaction IndexedDB échouée.'));
        tx.onerror = () => reject(tx.error ?? new Error('Transaction IndexedDB échouée.'));
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function loadQueueSnapshot(): Promise<QueueSnapshot | null> {
  try {
    const data = await runTransaction('readonly', (store) => store.get(SNAPSHOT_KEY));
    if (!data || typeof data !== 'object') return null;
    const snapshot = data as QueueSnapshot;
    if (!Array.isArray(snapshot.items)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export async function saveQueueSnapshot(snapshot: QueueSnapshot): Promise<void> {
  if (snapshot.items.length === 0) {
    await clearQueueStore();
    return;
  }
  try {
    await runTransaction('readwrite', (store) => store.put(snapshot, SNAPSHOT_KEY));
  } catch {
    /* quota ou mode privé : la session reste utilisable sans persistance */
  }
}

export async function clearQueueStore(): Promise<void> {
  try {
    await runTransaction('readwrite', (store) => store.delete(SNAPSHOT_KEY));
  } catch {
    /* ignore */
  }
}
