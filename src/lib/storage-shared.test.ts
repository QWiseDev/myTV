import { parseLogKeyUsername } from './storage-shared';

describe('parseLogKeyUsername', () => {
  it('解析带用户名的访问日志键', () => {
    expect(parseLogKeyUsername('al:2026-11-22:qiuwei:1772662679313')).toBe(
      'qiuwei',
    );
  });

  it('无用户名的全局日志键返回 null', () => {
    expect(parseLogKeyUsername('al:2026-11-22:1772662679313')).toBeNull();
  });

  it('畸形键返回 null', () => {
    expect(parseLogKeyUsername('al')).toBeNull();
    expect(parseLogKeyUsername('')).toBeNull();
    expect(parseLogKeyUsername('al:2026-11-22')).toBeNull();
  });
});
