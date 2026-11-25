import { NextRequest, NextResponse } from 'next/server';

import { resolveRequestUser } from '@/lib/auth';
import {
  type ApiSite,
  getAdultApiSites,
  getAvailableApiSites,
} from '@/lib/config';
import { checkGuestRateLimit, getGuestSource } from '@/lib/guest-source';
import {
  fetchSourceCategories,
  fetchSourceVideoList,
} from '@/lib/source-browser.server';
import {
  type SourceCategoryItem,
  type SourceSiteItem,
  type SourceVideoListResult,
  pickDefaultSourceCategory,
} from '@/lib/source-browser-shared';

export const runtime = 'nodejs';

async function buildSitesPayload(options: {
  availableSites: ApiSite[];
  isAdultModule: boolean;
  includeCategories: boolean;
  includeList: boolean;
}) {
  const validSites = options.availableSites.filter((s) =>
    Boolean(s.api?.trim()),
  );
  const sources: SourceSiteItem[] = validSites.map((s) => ({
    key: s.key,
    name: s.name,
    api: s.api,
  }));

  const firstSite = validSites[0];
  let initialCategories: SourceCategoryItem[] | undefined;
  let initialCategory: string | number | undefined;
  let initialList: SourceVideoListResult | undefined;

  if (options.includeCategories && firstSite) {
    try {
      initialCategories = await fetchSourceCategories(firstSite);
      const picked = pickDefaultSourceCategory(
        initialCategories,
        options.isAdultModule,
      );
      if (picked) {
        initialCategory = picked.type_id;
        if (options.includeList) {
          initialList = await fetchSourceVideoList(
            firstSite,
            String(picked.type_id),
            1,
          );
        }
      }
    } catch {
      // 预取分类或列表失败不阻塞 sites 返回，由客户端回退请求对应接口
    }
  }

  return {
    sources,
    ...(initialCategories ? { initialCategories } : {}),
    ...(initialCategory !== undefined ? { initialCategory } : {}),
    ...(initialList ? { initialList } : {}),
  };
}

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  try {
    const includeCategories =
      request.nextUrl.searchParams.get('includeCategories') === '1';
    const includeList = request.nextUrl.searchParams.get('includeList') === '1';
    const user = await resolveRequestUser(request);

    if (!user) {
      // 访客：仅返回访客源，缺失时返回空列表
      const rateLimited = checkGuestRateLimit(request, 'sites');
      if (rateLimited) return rateLimited;

      const guestSource = await getGuestSource();
      const payload = await buildSitesPayload({
        availableSites: guestSource ? [guestSource] : [],
        isAdultModule: false,
        includeCategories,
        includeList,
      });
      return NextResponse.json(payload);
    }

    // 黄果模块：group=adult 时仅返回成人源（登录用户可用，访客已在上方拦截）
    const group = request.nextUrl.searchParams.get('group');
    const isAdultModule = group === 'adult';
    const availableSites = isAdultModule
      ? await getAdultApiSites(user.username)
      : await getAvailableApiSites(user.username);

    const payload = await buildSitesPayload({
      availableSites,
      isAdultModule,
      includeCategories,
      includeList,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: '获取源列表失败' }, { status: 500 });
  }
}
