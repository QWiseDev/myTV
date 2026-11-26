import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { resolveAndValidateRemoteUrl, safeFetch } from '@/lib/url-safety';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('response' in admin) return admin.response;

  try {
    const { apiBaseUrl } = await request.json();
    if (typeof apiBaseUrl !== 'string' || !apiBaseUrl.trim()) {
      return NextResponse.json(
        { error: '请先填写弹幕 API 地址' },
        { status: 400 },
      );
    }

    const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/, '');
    const targetUrl = `${normalizedBaseUrl}/api/config`;
    try {
      // 管理端配置的弹幕服务允许走 docker 内网（如 danmu-api）。
      await resolveAndValidateRemoteUrl(targetUrl, {
        allowHttp: true,
        allowPrivateNetwork: true,
      });
    } catch (validationError) {
      return NextResponse.json(
        {
          error:
            validationError instanceof Error
              ? validationError.message
              : '弹幕 API 地址不合法或指向受限网络',
        },
        { status: 400 },
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await safeFetch(targetUrl, {
        signal: controller.signal,
        allowPrivateNetwork: true,
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `弹幕 API 连接失败: HTTP ${response.status}` },
          { status: 400 },
        );
      }

      const data = await response.json();
      return NextResponse.json({
        success: true,
        message: '弹幕 API 连接正常',
        version: data?.version,
        repository: data?.repository,
        hasAdminToken: data?.hasAdminToken,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? '弹幕 API 连接超时'
        : error instanceof Error
          ? error.message
          : '弹幕 API 连接测试失败';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
