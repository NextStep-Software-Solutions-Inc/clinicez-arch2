import type { IBlobStorage } from './blobStorage';

export * from './blobStorage';

function resolveBlobStorage(): IBlobStorage {
  // If running in Bun test, web, or non-native environment, fall back to webBlobStorage
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./blobStorage.native').nativeBlobStorage;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./blobStorage.web').webBlobStorage;
  }
}

let cachedStorage: IBlobStorage | null = null;

export const blobStorage: IBlobStorage = new Proxy({} as IBlobStorage, {
  get(_target, prop) {
    if (!cachedStorage) {
      cachedStorage = resolveBlobStorage();
    }
    const val = (cachedStorage as any)[prop];
    return typeof val === 'function' ? val.bind(cachedStorage) : val;
  },
});
