import { NextRequest, NextResponse } from 'next/server';

import { clearAuthCookiesOnResponse } from '@/lib/auth';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function POST(request: NextRequest) {
  return clearAuthCookiesOnResponse(NextResponse.json({ ok: true }), request);
}
