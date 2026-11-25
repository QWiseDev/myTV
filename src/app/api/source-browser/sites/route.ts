import { NextRequest, NextResponse } from 'next/server';

import { resolveRequestUser } from '@/lib/auth';
import { getAdultApiSites, getAvailableApiSites } from '@/lib/config';
import { checkGuestRateLimit, getGuestSource } from '@/lib/guest-source';
import {
  type SourceCategoryItem,
  fetchSourceCategories,
} from '@/lib/source-browser.server';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  try {
    const includeCategories =
      request.nextUrl.searchParams.get('includeCategories') === '1';
    const user = await resolveRequestUser(request);
    if (!user) {
      // 访客：仅返回访客源，缺失时返回空列表
      const rateLimited = checkGuestRateLimit(request, 'sites');
      if (rateLimited) return rateLimited;

      const guestSource = await getGuestSource();
      const sources = guestSource
        ? [
            {
              key: guestSource.key,
              name: guestSource.name,
              api: guestSource.api,
            },
          ]
        : [];
      let initialCategories: SourceCategoryItem[] | undefined;
      if (includeCategories && guestSource) {
        try {
          initialCategories = await fetchSourceCategories(guestSource);
        } catch {
          // 预取分类失败不阻塞 sites 返回，由客户端回退请求 categories
        }
      }
      return NextResponse.json({
        sources,
        ...(initialCategories ? { initialCategories } : {}),
      });
    }

    // 黄果模块：group=adult 时仅返回成人源（登录用户可用，访客已在上方拦截）
    const group = request.nextUrl.searchParams.get('group');
    const availableSites =
      group === 'adult'
        ? await getAdultApiSites(user.username)
        : await getAvailableApiSites(user.username);
    const sources = availableSites
      .filter((s) => Boolean(s.api?.trim()))
      .map((s) => ({ key: s.key, name: s.name, api: s.api }));

    return NextResponse.json({ sources });
  } catch (error) {
    return NextResponse.json({ error: '获取源列表失败' }, { status: 500 });
  }
}
