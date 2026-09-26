import { renderHook } from '@testing-library/react';
import { act } from 'react';

import { useCustomAdFilterCode } from './useCustomAdFilterCode';

const CODE_CACHE_KEY = 'custom_ad_filter_code_cache';
const VERSION_CACHE_KEY = 'custom_ad_filter_version_cache';

const fetchMock = jest.fn<Promise<Response>, [string]>();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

async function renderAndSettle() {
  const { result } = renderHook(() => useCustomAdFilterCode());
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

function jsonResponse(payload: unknown, ok = true): Response {
  return {
    ok,
    json: async () => payload,
  } as unknown as Response;
}

test('reads cached code immediately and skips refetch when version is unchanged', async () => {
  localStorage.setItem(CODE_CACHE_KEY, 'const rule = 1;');
  localStorage.setItem(VERSION_CACHE_KEY, '3');
  fetchMock.mockResolvedValue(jsonResponse({ version: 3 }));

  const result = await renderAndSettle();

  expect(result.current.current).toBe('const rule = 1;');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('/api/ad-filter');
});

test('refetches and stores the full rule when the version changes', async () => {
  localStorage.setItem(CODE_CACHE_KEY, 'const old = 1;');
  localStorage.setItem(VERSION_CACHE_KEY, '1');
  fetchMock.mockImplementation(async (url) =>
    url === '/api/ad-filter'
      ? jsonResponse({ version: 2 })
      : jsonResponse({ code: 'const fresh = 2;' }),
  );

  const result = await renderAndSettle();

  expect(result.current.current).toBe('const fresh = 2;');
  expect(localStorage.getItem(CODE_CACHE_KEY)).toBe('const fresh = 2;');
  expect(localStorage.getItem(VERSION_CACHE_KEY)).toBe('2');
});

test('clears the cached rule when the server reports no custom code', async () => {
  localStorage.setItem(CODE_CACHE_KEY, 'const stale = 1;');
  localStorage.setItem(VERSION_CACHE_KEY, '9');
  fetchMock.mockResolvedValue(jsonResponse({ version: 0 }));

  const result = await renderAndSettle();

  expect(result.current.current).toBe('');
  expect(localStorage.getItem(CODE_CACHE_KEY)).toBeNull();
  expect(localStorage.getItem(VERSION_CACHE_KEY)).toBeNull();
});

test('keeps the cached rule when the version check fails', async () => {
  localStorage.setItem(CODE_CACHE_KEY, 'const cached = 1;');
  fetchMock.mockRejectedValue(new Error('network down'));

  const result = await renderAndSettle();

  expect(result.current.current).toBe('const cached = 1;');
});
