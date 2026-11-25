import { getGuestSource } from '@/lib/guest-source';
import {
  fetchSourceCategories,
  fetchSourceVideoList,
} from '@/lib/source-browser.server';
import {
  type GuestHomeInitialData,
  pickDefaultSourceCategory,
} from '@/lib/source-browser-shared';

/**
 * 访客首页 SSR 预取软超时（毫秒）：
 * 超时不阻断 HTML 返回，未完成的上游请求会在后台继续填满 SWR 缓存，供客户端回退秒接。
 */
const GUEST_HOME_SSR_DEADLINE_MS = 1500;

function withSoftDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
  fallback: T,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }),
    new Promise<T>((resolve) => {
      timeoutId = setTimeout(() => resolve(fallback), deadlineMs);
    }),
  ]);
}

/**
 * 获取未登录访客首页的 SSR 预缓存首屏数据（仅命中访客限定源）。
 * 缓存命中时可直接随 HTML 直出分类和第 1 页列表，避免客户端串行等待。
 */
export async function getServerInitialGuestHomeData(): Promise<
  GuestHomeInitialData | undefined
> {
  const deadlineAt = Date.now() + GUEST_HOME_SSR_DEADLINE_MS;
  const remainingMs = () => Math.max(0, deadlineAt - Date.now());

  try {
    const guestSource = await withSoftDeadline(
      getGuestSource().catch(() => null),
      remainingMs(),
      null,
    );
    if (!guestSource || !guestSource.api?.trim()) {
      return undefined;
    }

    const categories = await withSoftDeadline(
      fetchSourceCategories(guestSource).catch(() => []),
      remainingMs(),
      [],
    );

    const source = {
      key: guestSource.key,
      name: guestSource.name,
      api: guestSource.api,
    };

    if (categories.length === 0) {
      return {
        source,
        categories: [],
        initialCategory: '',
      };
    }

    const defaultCategory = pickDefaultSourceCategory(categories, false);
    const initialCategory = defaultCategory ? defaultCategory.type_id : '';
    if (!initialCategory || remainingMs() === 0) {
      return {
        source,
        categories,
        initialCategory,
      };
    }

    const initialList = await withSoftDeadline(
      fetchSourceVideoList(guestSource, String(initialCategory), 1).catch(
        () => undefined,
      ),
      remainingMs(),
      undefined,
    );

    return {
      source,
      categories,
      initialCategory,
      ...(initialList ? { initialList } : {}),
    };
  } catch {
    return undefined;
  }
}
