#!/usr/bin/env node
/**
 * 独立直播分片代理（零依赖，Node >= 18）。
 *
 * 与 myTV 内置的 /api/proxy/segment 语义一致，但可部署在离直播源更近的
 * 服务器上（如国内机器），播放器直接从这里拉分片，主站只负责改写播放列表。
 *
 * 端点（均仅支持 GET）：
 *   /segment?url=<enc>&ua=<enc>&token=<enc>
 *     分片透传：按 ua 请求上游，流式回传，附 CORS 头（播放器跨域直连用）。
 *   /fetch?url=<enc>&ua=<enc>&token=<enc>
 *     原始抓取：供 myTV 主站代取直播播放列表（服务器对服务器）。
 *     响应透传上游状态码与头，并附加 X-Final-Url（跟随重定向后的最终地址，
 *     用于主站解析播放列表内相对路径）。
 *
 * 环境变量：
 *   PORT           监听端口（默认 8100，建议只监听 127.0.0.1 由 nginx 收 TLS）
 *   PROXY_TOKEN    若设置，所有请求必须携带相同的 token 参数（防公网滥用）
 *   FETCH_TIMEOUT  建连+响应头超时毫秒数（默认 30000）
 *
 * 安全：
 *   - 仅允许 http/https 目标；拒绝回环/内网/链路本地地址（SSRF 防护）
 *   - 建议设置 PROXY_TOKEN；由 nginx 前置 TLS 与限流
 */

import { createServer } from 'node:http';
import { Readable } from 'node:stream';

const PORT = parseInt(process.env.PORT || '8100', 10);
const PROXY_TOKEN = process.env.PROXY_TOKEN || '';
const FETCH_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT || '30000', 10);
const DEFAULT_UA = 'AptvPlayer/1.4.10';

/* ---------- SSRF 防护：拒绝内网/回环/链路本地目标 ---------- */

function isForbiddenHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // 链路本地（含云元数据 169.254.169.254）
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (h.includes(':')) {
    if (h === '::' || h === '::1') return true;
    if (/^f[cd]/.test(h)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link local
    return false;
  }
  return false;
}

function parseRequest(req) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const target = searchParams.get('url');
  if (!target) {
    return { error: { status: 400, message: 'Missing url' } };
  }
  if (PROXY_TOKEN && searchParams.get('token') !== PROXY_TOKEN) {
    return { error: { status: 403, message: 'Invalid token' } };
  }

  let decoded;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return { error: { status: 400, message: 'Malformed url encoding' } };
  }

  let parsed;
  try {
    parsed = new URL(decoded);
  } catch {
    return { error: { status: 400, message: 'Malformed url' } };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: { status: 400, message: 'Only http/https supported' } };
  }
  if (isForbiddenHost(parsed.hostname)) {
    return { error: { status: 403, message: 'Forbidden target host' } };
  }

  return { target: parsed, ua: searchParams.get('ua') || DEFAULT_UA };
}

/* ---------- 上游请求与流式回传 ---------- */

function pipeWebStream(res, webStream, onDone) {
  const nodeStream = Readable.fromWeb(webStream);
  nodeStream.on('error', () => res.destroy());
  nodeStream.pipe(res);
  res.on('close', () => {
    nodeStream.destroy();
    if (onDone) onDone();
  });
}

async function handleRequest(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const { error, target, ua } = parseRequest(req);
  if (error) {
    res.writeHead(error.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
    return;
  }

  const controller = new AbortController();
  // 超时仅覆盖建连+响应头；body 由客户端消费背压自然调节
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  // 客户端提前断开时终止上游连接
  res.on('close', () => controller.abort());

  const isFetchEndpoint = req.url.startsWith('/fetch');
  try {
    const upstream = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': ua,
        Accept: isFetchEndpoint
          ? 'application/vnd.apple.mpegurl, application/x-mpegurl, application/octet-stream, */*'
          : 'video/mp2t, video/*, */*',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      res.writeHead(upstream.status >= 500 ? 502 : upstream.status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(
        JSON.stringify({ error: `Upstream error: ${upstream.status} ${upstream.statusText}` })
      );
      return;
    }

    const headers = { 'Access-Control-Allow-Origin': '*' };

    if (isFetchEndpoint) {
      // 供主站代取播放列表：透传状态/头 + 最终地址（重定向后）
      headers['X-Final-Url'] = encodeURI(upstream.url);
      headers['Cache-Control'] = 'no-store';
      for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
        const value = upstream.headers.get(name);
        if (value) headers[name] = value;
      }
      res.writeHead(upstream.status, headers);
      if (req.method === 'HEAD' || !upstream.body) {
        res.end();
        return;
      }
      pipeWebStream(res, upstream.body);
      return;
    }

    // 分片透传：与 myTV 内置 /api/proxy/segment 响应头保持一致
    headers['Content-Type'] = upstream.headers.get('Content-Type') || 'video/mp2t';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, HEAD';
    headers['Access-Control-Allow-Headers'] =
      'Content-Type, Range, Origin, Accept, User-Agent';
    headers['Accept-Ranges'] = 'bytes';
    headers['Access-Control-Expose-Headers'] =
      'Content-Length, Content-Range, Content-Type, Accept-Ranges';
    headers['Cache-Control'] = 'public, max-age=300';
    for (const name of ['Content-Length', 'Content-Range', 'Last-Modified', 'ETag']) {
      const value = upstream.headers.get(name);
      if (value) headers[name] = value;
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD' || !upstream.body) {
      res.end();
      return;
    }
    pipeWebStream(res, upstream.body);
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (err.name === 'AbortError') {
      res.writeHead(408, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream request timeout' }));
      return;
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Network connection failed' }));
      return;
    }
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch upstream' }));
  } finally {
    clearTimeout(timeoutId);
  }
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  handleRequest(req, res).catch(() => res.destroy());
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[segment-proxy] listening on 127.0.0.1:${PORT}`);
});
