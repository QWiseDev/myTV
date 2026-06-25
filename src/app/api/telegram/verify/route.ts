import crypto from 'crypto';
import { NextResponse } from 'next/server';

import { clearConfigCache } from '@/lib/config';
import { db } from '@/lib/db';
import {
  getTelegramToken,
  verifyAndConsumeTelegramToken,
} from '@/lib/telegram-tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 生成随机密码
function generatePassword(length = 8): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}

// 生成签名
async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function GET(request: Request) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const confirm = searchParams.get('confirm'); // 新增：确认参数


    if (!token) {
      return new NextResponse(
        `<html><body><h1>无效的登录链接</h1><p>缺少 token 参数</p></body></html>`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    // 如果没有 confirm 参数，先验证 token 是否有效（但不删除），然后显示确认页面
    if (!confirm) {
      const tokenData = await getTelegramToken(token);

      if (!tokenData) {
        return new NextResponse(
          `<html><body><h1>登录链接无效</h1><p>链接可能已过期或已被使用</p></body></html>`,
          {
            status: 401,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }
        );
      }

      // 返回确认页面（防止 Telegram 链接预览消费 token）
      return new NextResponse(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>确认登录</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
      margin: 1rem;
    }
    h1 {
      color: #333;
      margin-bottom: 1rem;
      font-size: 1.5rem;
    }
    p {
      color: #666;
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }
    .btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 1rem 2rem;
      font-size: 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }
    .btn:active {
      transform: translateY(0);
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔐</div>
    <h1>Telegram 登录确认</h1>
    <p>点击下方按钮完成登录到 ${tokenData.baseUrl || 'LunaTV'}</p>
    <a href="/api/telegram/verify?token=${token}&confirm=1" class="btn">
      确认登录
    </a>
  </div>
</body>
</html>`,
        {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    // 有 confirm 参数，真正消费 token 并登录
    const tokenData = await verifyAndConsumeTelegramToken(token);

    if (!tokenData) {
      return new NextResponse(
        `<html><body><h1>登录链接无效</h1><p>链接可能已过期或已被使用</p></body></html>`,
        {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    const { telegramUsername } = tokenData;


    // 获取管理员配置
    const config = await db.getAdminConfig();
    const telegramConfig = config?.TelegramAuthConfig;

    if (!telegramConfig?.enabled) {
      return new NextResponse(
        `<html><body><h1>Telegram 登录未启用</h1></body></html>`,
        {
          status: 403,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    // 构建用户名（格式：tg_username）
    const username = `tg_${telegramUsername}`;

    // 检查用户是否已存在
    let isNewUser = false;
    let initialPassword = '';
    const userExists = await db.checkUserExist(username);

    if (!userExists) {
      // 自动注册新用户
      if (telegramConfig.autoRegister) {
        initialPassword = generatePassword();

        await db.registerUser(username, initialPassword);

        // 验证用户是否真的被创建
        const _verifyExists = await db.checkUserExist(username);

        // 清除配置缓存，强制下次getConfig()时重新从数据库读取最新用户列表
        clearConfigCache();

        isNewUser = true;
      } else {
        return new NextResponse(
          `<html><body><h1>用户不存在</h1><p>请先注册或联系管理员</p></body></html>`,
          {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }
        );
      }
    }

    // 准备认证数据

    // 生成认证数据对象（不手动编码，让 Next.js 自动处理）
    const authData: Record<string, unknown> = { role: 'user' };
    if (username && process.env.PASSWORD) {
      authData.username = username;
      const signature = await generateSignature(username, process.env.PASSWORD);
      authData.signature = signature;
      authData.timestamp = Date.now();
      authData.loginTime = Date.now();
    }
    const authDataString = JSON.stringify(authData);

    const expires = new Date();
    expires.setDate(expires.getDate() + 7); // 7天过期

    // 获取当前域名和协议
    const url = new URL(request.url);
    const isSecure = url.protocol === 'https:';

    // 记录登入时间 - 直接调用 db 而不是通过 API
    try {
      await db.updateUserLoginStats(username, Date.now(), isNewUser);
    } catch (error) {
      // 不影响登录流程
    }


    // Create HTML response that sets cookies and redirects
    // This ensures cookies are set before navigation happens
    const newUserData =
      isNewUser && initialPassword
        ? JSON.stringify({ username, password: initialPassword })
        : '';
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>登录成功</title>
</head>
<body>
  <script>
    // 立即跳转到首页
    window.location.replace('/');
  </script>
</body>
</html>`;

    const response = new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

    // Set auth cookie - 直接使用 JSON 字符串，Next.js 会自动 URL 编码

    response.cookies.set('user_auth', authDataString, {
      path: '/',
      expires: expires,
      sameSite: 'lax',
      secure: isSecure,
      httpOnly: false,
    });


    // Set new user cookie if needed
    if (isNewUser && initialPassword) {
      const newUserExpires = new Date();
      newUserExpires.setSeconds(newUserExpires.getSeconds() + 60);
      response.cookies.set('telegram_new_user', newUserData, {
        path: '/',
        expires: newUserExpires,
        sameSite: 'lax',
        secure: isSecure,
        httpOnly: false,
      });
    }

    return response;
  } catch (error) {
    console.error(`[Verify ${requestId}] ERROR:`, error);
    return new NextResponse(
      `<html><body><h1>登录失败</h1><p>服务器错误，请稍后重试</p></body></html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
}
