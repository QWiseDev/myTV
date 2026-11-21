/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import {
  ConfigSubscriptionFetchError,
  fetchDecodedConfigSubscription,
} from '@/lib/config-subscription';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function POST(request: NextRequest) {
  try {
    // 权限检查：仅站长可以拉取配置订阅
    const auth = requireUser(request);
    if (!auth.authInfo) return auth.response;
    const authInfo = auth.authInfo;

    if (authInfo.username !== process.env.USERNAME) {
      return NextResponse.json(
        { error: '权限不足，只有站长可以拉取配置订阅' },
        { status: 401 },
      );
    }

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: '缺少URL参数' }, { status: 400 });
    }

    const decodedContent = await fetchDecodedConfigSubscription(url);

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
