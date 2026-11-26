/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import {
  ConfigSubscriptionFetchError,
  fetchDecodedConfigSubscription,
} from '@/lib/config-subscription';
import { resolveAndValidateRemoteUrl } from '@/lib/url-safety';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function POST(request: NextRequest) {
  try {
    // 权限检查：仅站长可以拉取配置订阅
    const admin = await requireAdmin(request, {
      ownerOnly: true,
      forbiddenMessage: '权限不足，只有站长可以拉取配置订阅',
    });
    if ('response' in admin) return admin.response;

    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '缺少URL参数' }, { status: 400 });
    }

    try {
      await resolveAndValidateRemoteUrl(url.trim(), { allowHttp: true });
    } catch (validationError) {
      return NextResponse.json(
        {
          error:
            validationError instanceof Error
              ? validationError.message
              : '非法的订阅 URL',
        },
        { status: 400 },
      );
    }

    const decodedContent = await fetchDecodedConfigSubscription(url.trim());

    return NextResponse.json({
      success: true,
      configContent: decodedContent,
      message: '配置拉取成功',
    });
  } catch (error) {
    console.error('拉取配置失败:', error);
    if (error instanceof ConfigSubscriptionFetchError && error.status) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: '拉取配置失败' }, { status: 500 });
  }
}
