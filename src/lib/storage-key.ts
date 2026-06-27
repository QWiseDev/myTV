const STORAGE_KEY_SEPARATOR = '+';

export interface StorageKeyParts {
  source: string;
  id: string;
}

export function generateStorageKey(source: string, id: string): string {
  return `${source}${STORAGE_KEY_SEPARATOR}${id}`;
}

export function parseStorageKey(key: string): StorageKeyParts | null {
  const separatorIndex = key.indexOf(STORAGE_KEY_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return null;
  }

  return {
    source: key.slice(0, separatorIndex),
    id: key.slice(separatorIndex + 1),
  };
}
