/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';
import { promisify } from 'util';
import { gunzip } from 'zlib';

import { requireAdmin } from '@/lib/admin-auth';
import { configSelfCheck, setCachedConfig } from '@/lib/config';
import { SimpleCrypto } from '@/lib/crypto';
import { db } from '@/lib/db';
import { parseStorageKey } from '@/lib/storage-key';
import { Favorite, PlayRecord } from '@/lib/types';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
const gunzipAsync = promisify(gunzip);
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req, {
      ownerOnly: true,
      forbiddenMessage: '权限不足，只有站长可以导入数据',
    });
    if ('response' in admin) return admin.response;

    // 解析表单数据
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const password = formData.get('password') as string | null;

    if (!file) {
      return NextResponse.json({ error: '请选择备份文件' }, { status: 400 });
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json(
        { error: '备份文件过大（最大 50MB）' },
        { status: 400 },
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '请提供解密密码' }, { status: 400 });
    }

    // 读取文件内容
    const encryptedData = await file.text();

    // 解密与解压数据（所有解析校验必须在 clearAllData 之前完成）
    let decryptedData: string;
    try {
      decryptedData = SimpleCrypto.decrypt(encryptedData, password);
    } catch {
      return NextResponse.json(
        { error: '解密失败，请检查密码是否正确' },
        { status: 400 },
      );
    }

    let decompressedData: string;
    try {
      const compressedBuffer = Buffer.from(decryptedData, 'base64');
      const decompressedBuffer = await gunzipAsync(compressedBuffer, {
        maxOutputLength: MAX_IMPORT_BYTES,
      });
      decompressedData = decompressedBuffer.toString();
    } catch {
      return NextResponse.json(
        { error: '备份文件解压失败或数据损坏' },
        { status: 400 },
      );
    }

    // 解析JSON数据
    let importData: any;
    try {
      importData = JSON.parse(decompressedData);
    } catch {
      return NextResponse.json({ error: '备份文件格式错误' }, { status: 400 });
    }

    // 严格校验结构，避免误删现有库后中断
    if (
      !importData ||
      typeof importData !== 'object' ||
      !importData.data ||
      typeof importData.data.adminConfig !== 'object' ||
      importData.data.adminConfig === null ||
      !importData.data.userData ||
      typeof importData.data.userData !== 'object' ||
      Array.isArray(importData.data.userData)
    ) {
      return NextResponse.json({ error: '备份文件格式无效' }, { status: 400 });
    }

    // 所有校验通过后，先清空现有数据
    await db.clearAllData();

    // 先导入用户与用户业务数据（确保后续 configSelfCheck 能读取到完整的 db.getAllUsers）
    const userData = importData.data.userData as Record<string, any>;
    for (const [username, user] of Object.entries(userData)) {
      if (!username || !user || typeof user !== 'object') {
        continue;
      }

      if (typeof user.password === 'string' && user.password) {
        await db.setUserPasswordRaw(username, user.password);
      }

      if (user.playRecords && typeof user.playRecords === 'object') {
        for (const [key, record] of Object.entries(user.playRecords)) {
          await db.setPlayRecordByKey(username, key, record as PlayRecord);
        }
      }

      if (user.favorites && typeof user.favorites === 'object') {
        for (const [key, favorite] of Object.entries(user.favorites)) {
          await db.setFavoriteByKey(username, key, favorite as Favorite);
        }
      }

      if (user.searchHistory && Array.isArray(user.searchHistory)) {
        for (const keyword of [...user.searchHistory].reverse()) {
          if (typeof keyword === 'string' && keyword) {
            await db.addSearchHistory(username, keyword);
          }
        }
      }

      if (user.skipConfigs && typeof user.skipConfigs === 'object') {
        for (const [key, skipConfig] of Object.entries(user.skipConfigs)) {
          const parsedKey = parseStorageKey(key);
          if (parsedKey) {
            await db.setSkipConfig(
              username,
              parsedKey.source,
              parsedKey.id,
              skipConfig as any,
            );
          }
        }
      }
    }

    // 再校准并保存管理员配置（必须 await configSelfCheck）
    const checkedConfig = await configSelfCheck(importData.data.adminConfig);
    await db.saveAdminConfig(checkedConfig);
    await setCachedConfig(checkedConfig);

    return NextResponse.json({
      message: '数据导入成功',
      importedUsers: Object.keys(userData).length,
      timestamp: importData.timestamp,
      serverVersion:
        typeof importData.serverVersion === 'string'
          ? importData.serverVersion
          : '未知版本',
    });
  } catch (error) {
    console.error('数据导入失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导入失败' },
      { status: 500 },
    );
  }
}
