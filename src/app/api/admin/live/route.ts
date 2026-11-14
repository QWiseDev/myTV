/* eslint-disable no-console,no-case-declarations */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { deleteCachedLiveChannels, refreshLiveChannels, runSpeedTest } from '@/lib/live';
import { resolveSegmentProxy } from '@/lib/live-proxy';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** 返回当前生效的分片代理配置（后台配置优先，环境变量回退），供面板预填 */
export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    const username = authInfo?.username;
    const config = await getConfig();
    if (username !== process.env.USERNAME) {
      const user = config.UserConfig?.Users?.find((u) => u.username === username);
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }
    const proxy = resolveSegmentProxy(config);
    return NextResponse.json(
      {
        baseUrl: proxy?.baseUrl ?? '',
        token: proxy?.token ?? '',
        fromDb: Boolean(config.LiveProxyConfig?.baseUrl),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失败' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 权限检查
    const authInfo = getAuthInfoFromCookie(request);
    const username = authInfo?.username;
    const config = await getConfig();
    if (username !== process.env.USERNAME) {
      // 管理员
      const user = config.UserConfig.Users.find((u) => u.username === username);
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    const body = await request.json();
    const {
      action,
      key,
      name,
      url,
      ua,
      epg,
      direct,
      proxyBaseUrl,
      proxyToken,
    } = body;

    if (!config) {
      return NextResponse.json({ error: '配置不存在' }, { status: 404 });
    }

    // 确保 LiveConfig 存在
    if (!config.LiveConfig) {
      config.LiveConfig = [];
    }

    switch (action) {
      case 'add':
        // 检查是否已存在相同的 key
        if (config.LiveConfig.some((l) => l.key === key)) {
          return NextResponse.json(
            { error: '直播源 key 已存在' },
            { status: 400 },
          );
        }

        const liveInfo = {
          key: key as string,
          name: name as string,
          url: url as string,
          ua: ua || '',
          epg: epg || '',
          direct: direct === true,
          from: 'custom' as 'custom' | 'config',
          channelNumber: 0,
          disabled: false,
        };

        try {
          const nums = await refreshLiveChannels(liveInfo);
          liveInfo.channelNumber = nums;
        } catch (error) {
          console.error('刷新直播源失败:', error);
          liveInfo.channelNumber = 0;
        }

        // 添加新的直播源
        config.LiveConfig.push(liveInfo);
        break;

      case 'delete':
        // 删除直播源
        const deleteIndex = config.LiveConfig.findIndex((l) => l.key === key);
        if (deleteIndex === -1) {
          return NextResponse.json({ error: '直播源不存在' }, { status: 404 });
        }

        const liveSource = config.LiveConfig[deleteIndex];
        if (liveSource.from === 'config') {
          return NextResponse.json(
            { error: '不能删除配置文件中的直播源' },
            { status: 400 },
          );
        }

        deleteCachedLiveChannels(key);

        config.LiveConfig.splice(deleteIndex, 1);
        break;

      case 'enable':
        // 启用直播源
        const enableSource = config.LiveConfig.find((l) => l.key === key);
        if (!enableSource) {
          return NextResponse.json({ error: '直播源不存在' }, { status: 404 });
        }
        enableSource.disabled = false;
        break;

      case 'disable':
        // 禁用直播源
        const disableSource = config.LiveConfig.find((l) => l.key === key);
        if (!disableSource) {
          return NextResponse.json({ error: '直播源不存在' }, { status: 404 });
        }
        disableSource.disabled = true;
        break;

      case 'edit':
        // 编辑直播源
        const editSource = config.LiveConfig.find((l) => l.key === key);
        if (!editSource) {
          return NextResponse.json({ error: '直播源不存在' }, { status: 404 });
        }

        // 配置文件中的直播源不允许编辑
        if (editSource.from === 'config') {
          return NextResponse.json(
            { error: '不能编辑配置文件中的直播源' },
            { status: 400 },
          );
        }

        // 更新字段（除了 key 和 from）
        editSource.name = name as string;
        editSource.url = url as string;
        editSource.ua = ua || '';
        editSource.epg = epg || '';
        editSource.direct = direct === true;

        // 刷新频道数
        try {
          const nums = await refreshLiveChannels(editSource);
          editSource.channelNumber = nums;
        } catch (error) {
          console.error('刷新直播源失败:', error);
          editSource.channelNumber = 0;
        }
        break;

      case 'sort':
        // 排序直播源
        const { order } = body;
        if (!Array.isArray(order)) {
          return NextResponse.json(
            { error: '排序数据格式错误' },
            { status: 400 },
          );
        }

        // 创建新的排序后的数组
        const sortedLiveConfig: typeof config.LiveConfig = [];
        order.forEach((key) => {
          const source = config.LiveConfig?.find((l) => l.key === key);
          if (source) {
            sortedLiveConfig.push(source);
          }
        });

        // 添加未在排序列表中的直播源（保持原有顺序）
        config.LiveConfig.forEach((source) => {
          if (!order.includes(source.key)) {
            sortedLiveConfig.push(source);
          }
        });

        config.LiveConfig = sortedLiveConfig;
        break;

      case 'setproxy':
        // 配置独立分片代理（清空 baseUrl 表示停用，回落环境变量/内置代理）
        if (
          typeof proxyBaseUrl !== 'string' ||
          typeof proxyToken !== 'string'
        ) {
          return NextResponse.json({ error: '参数不完整' }, { status: 400 });
        }
        const trimmedBase = proxyBaseUrl.trim();
        if (trimmedBase) {
          try {
            const parsed = new URL(trimmedBase);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              return NextResponse.json(
                { error: '代理地址仅支持 http/https' },
                { status: 400 },
              );
            }
          } catch {
            return NextResponse.json(
              { error: '代理地址格式无效' },
              { status: 400 },
            );
          }
          config.LiveProxyConfig = {
            baseUrl: trimmedBase.replace(/\/+$/, ''),
            token: proxyToken.trim(),
          };
        } else {
          config.LiveProxyConfig = { baseUrl: '', token: '' };
        }
        break;

      case 'speedtest': {
        // 全量测速：剔除死链与慢源，返回测速报告
        const summary = await runSpeedTest(key as string);
        if (!summary) {
          return NextResponse.json(
            { error: '直播源不存在或无频道' },
            { status: 404 },
          );
        }
        return NextResponse.json(
          { success: true, summary },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }

    // 保存配置
    await db.saveAdminConfig(config);

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失败' },
      { status: 500 },
    );
  }
}
