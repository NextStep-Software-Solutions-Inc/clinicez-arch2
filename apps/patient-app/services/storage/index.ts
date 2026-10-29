import type { IBlobStorage } from './blobStorage';

export * from './blobStorage';

function resolveBlobStorage(): IBlobStorage {
  // If running in Bun test, web, or non-native environment, fall back to webBlobStorage
  if (
    typeof window !== 'undefined' ||
    (typeof process !== 'undefined' && Boolean((process as { versions?: { bun?: string } }).versions?.bun))
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./blobStorage.web').webBlobStorage;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    if (require('react-native').Platform?.OS === 'web') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./blobStorage.web').webBlobStorage;
    }
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
