import net from 'net';
import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { clearConfigCache } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('response' in admin) return admin.response;

  try {
    const tvboxSecurityConfig = await request.json();

    // 验证配置数据
    if (typeof tvboxSecurityConfig.enableAuth !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid enableAuth value' },
        { status: 400 },
      );
    }

    if (typeof tvboxSecurityConfig.enableIpWhitelist !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid enableIpWhitelist value' },
        { status: 400 },
      );
    }

    if (typeof tvboxSecurityConfig.enableRateLimit !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid enableRateLimit value' },
        { status: 400 },
      );
    }

    // 验证Token
    if (tvboxSecurityConfig.enableAuth) {
      if (
        !tvboxSecurityConfig.token ||
        typeof tvboxSecurityConfig.token !== 'string'
      ) {
        return NextResponse.json({ error: 'Token不能为空' }, { status: 400 });
      }
      if (tvboxSecurityConfig.token.length < 8) {
        return NextResponse.json(
          { error: 'Token长度至少8位' },
          { status: 400 },
        );
      }
    }

    // 验证IP白名单
    if (tvboxSecurityConfig.enableIpWhitelist) {
      if (!Array.isArray(tvboxSecurityConfig.allowedIPs)) {
        return NextResponse.json(
          { error: 'allowedIPs必须是数组' },
          { status: 400 },
        );
      }

      // 验证每个IP格式
      for (const ip of tvboxSecurityConfig.allowedIPs) {
        if (typeof ip !== 'string' || !isValidIPOrCIDR(ip.trim())) {
          return NextResponse.json(
            { error: `无效的IP地址格式: ${ip}` },
            { status: 400 },
          );
        }
      }
    }

    // 验证频率限制
    if (tvboxSecurityConfig.enableRateLimit) {
      const rateLimit = tvboxSecurityConfig.rateLimit;
      if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 1000) {
        return NextResponse.json(
          { error: '频率限制应在1-1000之间' },
          { status: 400 },
        );
      }
    }

    const adminConfig = admin.config;

    // 更新TVBox安全配置
    adminConfig.TVBoxSecurityConfig = {
      enableAuth: tvboxSecurityConfig.enableAuth,
      token: tvboxSecurityConfig.token?.trim() || '',
      enableIpWhitelist: tvboxSecurityConfig.enableIpWhitelist,
      allowedIPs: tvboxSecurityConfig.allowedIPs || [],
      enableRateLimit: tvboxSecurityConfig.enableRateLimit,
      rateLimit: tvboxSecurityConfig.rateLimit || 60,
    };

    // 保存配置到数据库
    await db.saveAdminConfig(adminConfig);

    // 清除配置缓存，强制下次重新从数据库读取
    clearConfigCache();

    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Cache-Control': 'no-store', // 不缓存结果
        },
      },
    );
  } catch (error) {
    console.error('Save TVBox security config error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}

// 验证IP地址或CIDR格式的辅助函数（兼容 IPv4 与 IPv6）
function isValidIPOrCIDR(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;

  const trimmed = ip.trim();
  if (!trimmed) return false;
  if (trimmed === '*') return true;

  const [ipPart, maskPart, ...extra] = trimmed.split('/');
  if (extra.length > 0) return false;

  const ipVersion = net.isIP(ipPart);
  if (ipVersion === 0) return false;

  if (maskPart !== undefined) {
    if (!/^\d{1,3}$/.test(maskPart)) return false;
    const mask = parseInt(maskPart, 10);
    const maxPrefix = ipVersion === 6 ? 128 : 32;
    if (Number.isNaN(mask) || mask < 0 || mask > maxPrefix) {
      return false;
    }
  }

  return true;
}
