/** @jest-environment node */

import type { NextRequest } from 'next/server';

const mockRequireAdmin = jest.fn();
const mockSaveAdminConfig = jest.fn();
const mockClearConfigCache = jest.fn();

jest.mock('@/lib/admin-auth', () => ({
  requireAdmin: mockRequireAdmin,
}));

jest.mock('@/lib/db', () => ({
  db: {
    saveAdminConfig: mockSaveAdminConfig,
  },
}));

jest.mock('@/lib/config', () => ({
  clearConfigCache: mockClearConfigCache,
}));

const primitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
);

let POST: typeof import('./route').POST;

function createJsonRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/admin/danmu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeAll(async () => {
  global.Headers = primitives.Headers;
  global.Request = primitives.Request;
  global.Response = primitives.Response;
  ({ POST } = await import('./route'));
});

beforeEach(() => {
  mockRequireAdmin.mockReset().mockResolvedValue({
    username: 'admin',
    config: { DanmuConfig: { apiBaseUrl: '' } },
  });
  mockSaveAdminConfig.mockReset().mockResolvedValue(undefined);
  mockClearConfigCache.mockReset();
});

it.each([
  ['回环 IP', 'http://127.0.0.1:9321'],
  ['本机域名', 'http://localhost:9321'],
  ['内网地址', 'http://192.168.1.10:9321'],
  ['内嵌凭证', 'https://user:pass@danmu.example'],
  ['携带查询参数', 'https://danmu.example?token=secret'],
  ['携带锚点', 'https://danmu.example#hash'],
])('拒绝不安全或格式受限的弹幕 API 地址 (%s)', async (_label, apiBaseUrl) => {
  const response = await POST(createJsonRequest({ apiBaseUrl }));
  expect(response?.status).toBe(400);
  expect(mockSaveAdminConfig).not.toHaveBeenCalled();
  expect(mockClearConfigCache).not.toHaveBeenCalled();
});

it('拒绝非字符串的 apiBaseUrl', async () => {
  const response = await POST(createJsonRequest({ apiBaseUrl: 12345 }));
  expect(response?.status).toBe(400);
  expect(mockSaveAdminConfig).not.toHaveBeenCalled();
});

it('保存合法的公开地址并规范化尾部斜杠，支持清空配置', async () => {
  const saveResponse = await POST(
    createJsonRequest({ apiBaseUrl: '  https://danmu.example///  ' }),
  );
  expect(saveResponse?.status).toBe(200);
  expect(mockSaveAdminConfig).toHaveBeenCalledWith({
    DanmuConfig: { apiBaseUrl: 'https://danmu.example' },
  });
  expect(mockClearConfigCache).toHaveBeenCalledTimes(1);

  const clearResponse = await POST(createJsonRequest({ apiBaseUrl: '   ' }));
  expect(clearResponse?.status).toBe(200);
  expect(mockSaveAdminConfig).toHaveBeenLastCalledWith({
    DanmuConfig: { apiBaseUrl: '' },
  });
  expect(mockClearConfigCache).toHaveBeenCalledTimes(2);
});
