import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  return NextResponse.json(
    { error: '旧播放记录迁移接口已停用，当前版本只使用 Redis Hash 新结构' },
    { status: 410 }
  );
}
