import { generateStorageKey, parseStorageKey } from './storage-key';

describe('storage key helpers', () => {
  it('generates the existing source plus id key format', () => {
    expect(generateStorageKey('source-a', '123')).toBe('source-a+123');
  });

  it('parses keys with plus signs inside ids', () => {
    expect(parseStorageKey('source-a+id+with+plus')).toEqual({
      source: 'source-a',
      id: 'id+with+plus',
    });
  });

  it('rejects malformed keys', () => {
    expect(parseStorageKey('source-only')).toBeNull();
    expect(parseStorageKey('+id')).toBeNull();
    expect(parseStorageKey('source+')).toBeNull();
  });
});
