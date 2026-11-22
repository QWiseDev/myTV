import { NextRequest, NextResponse } from 'next/server';

import { resolveRequestUser } from '@/lib/auth';
import { API_CONFIG } from '@/lib/config';
import {
  checkGuestRateLimit,
  isSourceAllowedForRequest,
} from '@/lib/guest-source';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  const user = await resolveRequestUser(request);
  if (!user) {
    const rateLimited = checkGuestRateLimit(request, 'categories');
    if (rateLimited) return rateLimited;
  }

  const { searchParams } = new URL(request.url);
  const sourceKey = searchParams.get('source');

  if (!sourceKey) {
    return NextResponse.json({ error: '缺少 source 参数' }, { status: 400 });
  }

  try {
    const source = await isSourceAllowedForRequest(
      user?.username ?? null,
      sourceKey,
    );
    if (!source) {
      return NextResponse.json(
        { error: user ? '你没有权限访问该资源源' : '访客仅可访问指定片源' },
        { status: 403 },
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const url = `${source.api}?ac=list`;
    const res = await fetch(url, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return NextResponse.json(
        { error: `上游返回错误: ${res.status}` },
        { status: res.status },
      );
    }
    type AppleCMSClass = {
      type_id?: string | number;
      typeid?: string | number;
      id?: string | number;
      type_name?: string;
      typename?: string;
      name?: string;
    };
    const data = (await res.json()) as { class?: AppleCMSClass[] };
    const classes: AppleCMSClass[] = Array.isArray(data.class)
      ? data.class
      : [];
    const categories = classes
      .map((c) => ({
        type_id: c.type_id ?? c.typeid ?? c.id,
        type_name: c.type_name ?? c.typename ?? c.name,
      }))
      .filter((c): c is { type_id: string | number; type_name: string } =>
        Boolean(c.type_id && c.type_name),
      );

    return NextResponse.json({ categories });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: '请求超时' }, { status: 408 });
    }
    return NextResponse.json({ error: '获取分类失败' }, { status: 500 });
  }
}
