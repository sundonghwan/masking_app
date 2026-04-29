const DEFAULT_DB_NAME = "masking-app-project-store";
const DB_VERSION = 1;
const PROJECT_KEY = "current";
const SNAPSHOT_STORE = "projectSnapshots";
const IMAGE_BLOB_STORE = "imageBlobs";
const MASK_BLOB_STORE = "maskBlobs";

const STORE_NAMES = [SNAPSHOT_STORE, IMAGE_BLOB_STORE, MASK_BLOB_STORE];

export function createProjectStore(options = {}) {
  const backend = shouldUseIndexedDB(options) ? createIndexedDBBackend(options) : createMemoryBackend();

  return {
    saveProjectSnapshot(snapshot) {
      return backend.saveProjectSnapshot(normalizeSnapshot(snapshot));
    },
    loadProjectSnapshot() {
      return backend.loadProjectSnapshot();
    },
    clearProject() {
      return backend.clearProject();
    },
    saveImageBlob(imageId, blob) {
      return backend.saveImageBlob(normalizeImageId(imageId), normalizeBlobValue(blob, "image blob"));
    },
    loadImageBlob(imageId) {
      return backend.loadImageBlob(normalizeImageId(imageId));
    },
    saveMaskBlob(imageId, blob) {
      return backend.saveMaskBlob(normalizeImageId(imageId), normalizeBlobValue(blob, "mask blob"));
    },
    loadMaskBlob(imageId) {
      return backend.loadMaskBlob(normalizeImageId(imageId));
    },
  };
}

const defaultStore = createProjectStore();

export function saveProjectSnapshot(snapshot) {
  return defaultStore.saveProjectSnapshot(snapshot);
}

export function loadProjectSnapshot() {
  return defaultStore.loadProjectSnapshot();
}

export function clearProject() {
  return defaultStore.clearProject();
}

export function saveImageBlob(imageId, blob) {
  return defaultStore.saveImageBlob(imageId, blob);
}

export function loadImageBlob(imageId) {
  return defaultStore.loadImageBlob(imageId);
}

export function saveMaskBlob(imageId, blob) {
  return defaultStore.saveMaskBlob(imageId, blob);
}

export function loadMaskBlob(imageId) {
  return defaultStore.loadMaskBlob(imageId);
}

function shouldUseIndexedDB(options) {
  if (options.forceMemory) return false;
  return Boolean(options.indexedDB || globalThis.indexedDB);
}

function createMemoryBackend() {
  let projectSnapshot = null;
  const imageBlobs = new Map();
  const maskBlobs = new Map();

  return {
    async saveProjectSnapshot(snapshot) {
      projectSnapshot = cloneSnapshot(snapshot);
    },
    async loadProjectSnapshot() {
      return projectSnapshot ? cloneSnapshot(projectSnapshot) : null;
    },
    async clearProject() {
      projectSnapshot = null;
      imageBlobs.clear();
      maskBlobs.clear();
    },
    async saveImageBlob(imageId, blob) {
      imageBlobs.set(imageId, await cloneBlobValue(blob));
    },
    async loadImageBlob(imageId) {
      const blob = imageBlobs.get(imageId);
      return blob ? cloneBlobValue(blob) : null;
    },
    async saveMaskBlob(imageId, blob) {
      maskBlobs.set(imageId, await cloneBlobValue(blob));
    },
    async loadMaskBlob(imageId) {
      const blob = maskBlobs.get(imageId);
      return blob ? cloneBlobValue(blob) : null;
    },
  };
}

function createIndexedDBBackend(options) {
  const indexedDB = options.indexedDB || globalThis.indexedDB;
  const dbName = options.dbName || DEFAULT_DB_NAME;
  let openPromise = null;

  return {
    async saveProjectSnapshot(snapshot) {
      const db = await openDatabase();
      await putRecord(db, SNAPSHOT_STORE, { key: PROJECT_KEY, snapshot });
    },
    async loadProjectSnapshot() {
      const db = await openDatabase();
      const record = await getRecord(db, SNAPSHOT_STORE, PROJECT_KEY);
      return record?.snapshot ? cloneSnapshot(record.snapshot) : null;
    },
    async clearProject() {
      const db = await openDatabase();
      await Promise.all(STORE_NAMES.map((storeName) => clearStore(db, storeName)));
    },
    async saveImageBlob(imageId, blob) {
      const db = await openDatabase();
      await putRecord(db, IMAGE_BLOB_STORE, { imageId, blob: await cloneBlobValue(blob) });
    },
    async loadImageBlob(imageId) {
      const db = await openDatabase();
      const record = await getRecord(db, IMAGE_BLOB_STORE, imageId);
      return record?.blob ? cloneBlobValue(record.blob) : null;
    },
    async saveMaskBlob(imageId, blob) {
      const db = await openDatabase();
      await putRecord(db, MASK_BLOB_STORE, { imageId, blob: await cloneBlobValue(blob) });
    },
    async loadMaskBlob(imageId) {
      const db = await openDatabase();
      const record = await getRecord(db, MASK_BLOB_STORE, imageId);
      return record?.blob ? cloneBlobValue(record.blob) : null;
    },
  };

  function openDatabase() {
    if (!openPromise) {
      openPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          createObjectStore(db, SNAPSHOT_STORE, { keyPath: "key" });
          createObjectStore(db, IMAGE_BLOB_STORE, { keyPath: "imageId" });
          createObjectStore(db, MASK_BLOB_STORE, { keyPath: "imageId" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Failed to open project store"));
        request.onblocked = () => reject(new Error("Project store upgrade was blocked"));
      });
    }

    return openPromise;
  }
}

function createObjectStore(db, storeName, options) {
  if (!db.objectStoreNames.contains(storeName)) {
    db.createObjectStore(storeName, options);
  }
}

function putRecord(db, storeName, value) {
  return runStoreRequest(db, storeName, "readwrite", (store) => store.put(value));
}

function getRecord(db, storeName, key) {
  return runStoreRequest(db, storeName, "readonly", (store) => store.get(key));
}

function clearStore(db, storeName) {
  return runStoreRequest(db, storeName, "readwrite", (store) => store.clear());
}

function runStoreRequest(db, storeName, mode, createRequest) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = createRequest(store);
    let result;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error || new Error(`Project store request failed: ${storeName}`));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error(`Project store transaction failed: ${storeName}`));
    transaction.onabort = () => reject(transaction.error || new Error(`Project store transaction aborted: ${storeName}`));
  });
}

function normalizeSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw new TypeError("Project snapshot must be a plain object");
  }

  return cloneSerializable(snapshot, "snapshot");
}

function cloneSnapshot(snapshot) {
  return cloneSerializable(snapshot, "snapshot");
}

function cloneSerializable(value, path) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneSerializable(item, `${path}[${index}]`));
  }
  if (isBlobLike(value)) {
    throw new TypeError(`Project snapshot cannot contain Blob/File values; store binary data separately (${path})`);
  }
  if (!isPlainObject(value)) {
    throw new TypeError(`Project snapshot contains a non-serializable value at ${path}`);
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    output[key] = cloneSerializable(item, `${path}.${key}`);
  }
  return output;
}

function normalizeImageId(imageId) {
  const normalized = String(imageId ?? "").trim();
  if (!normalized) {
    throw new TypeError("imageId is required");
  }
  return normalized;
}

function normalizeBlobValue(value, label) {
  if (isBlobLike(value) || isDataUrl(value)) {
    return value;
  }
  throw new TypeError(`${label} must be a Blob or data URL string`);
}

async function cloneBlobValue(value) {
  if (typeof value === "string") return value;
  const BlobCtor = value.constructor || globalThis.Blob;
  const buffer = await value.arrayBuffer();
  return new BlobCtor([buffer], { type: value.type || "" });
}

function isBlobLike(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.size === "number" &&
    typeof value.type === "string",
  );
}

function isDataUrl(value) {
  return typeof value === "string" && /^data:[^,]*,/.test(value);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}
