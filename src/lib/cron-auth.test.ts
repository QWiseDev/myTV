import { verifyCronAuth } from './cron-auth';

interface RequestLikeParams {
  url?: string;
  host?: string | null;
  authorization?: string | null;
  cronSecretHeader?: string | null;
}

function buildRequest({
  url = 'http://localhost:3000/api/cron',
  host = 'localhost:3000',
  authorization = null,
  cronSecretHeader = null,
}: RequestLikeParams = {}) {
  const headerMap: Record<string, string> = {};
  if (host !== null) {
    headerMap.host = host;
  }
  if (authorization !== null) {
    headerMap.authorization = authorization;
  }
  if (cronSecretHeader !== null) {
    headerMap['x-cron-secret'] = cronSecretHeader;
  }
  return {
    url,
    headers: { get: (name: string) => headerMap[name.toLowerCase()] ?? null },
  };
}

describe('verifyCronAuth', () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  describe('未配置 CRON_SECRET', () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET;
    });

    it.each(['localhost:3000', '127.0.0.1:3000', '0.0.0.0:3000', '[::1]:3000'])(
      '放行本机 Host 调用: %s',
      (host) => {
        const result = verifyCronAuth(buildRequest({ host }));
        expect(result.ok).toBe(true);
      }
    );

    it('拒绝外部 Host 调用', () => {
      const result = verifyCronAuth(
        buildRequest({ host: 'mytv.example.com' })
      );
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
    });

    it('缺少 Host 头时拒绝', () => {
      const result = verifyCronAuth(buildRequest({ host: null }));
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
    });
  });

  describe('配置了 CRON_SECRET', () => {
    const SECRET = 'test-cron-secret';

    beforeEach(() => {
      process.env.CRON_SECRET = SECRET;
    });

    it('正确的 Bearer 头放行', () => {
      const result = verifyCronAuth(
        buildRequest({
          host: 'mytv.example.com',
          authorization: `Bearer ${SECRET}`,
        })
      );
      expect(result.ok).toBe(true);
    });

    it('正确的 x-cron-secret 头放行', () => {
      const result = verifyCronAuth(
        buildRequest({
          host: 'mytv.example.com',
          cronSecretHeader: SECRET,
        })
      );
      expect(result.ok).toBe(true);
    });

    it('正确的 ?secret= 查询参数放行', () => {
      const result = verifyCronAuth(
        buildRequest({
          url: `http://mytv.example.com/api/cron?secret=${SECRET}`,
          host: 'mytv.example.com',
        })
      );
      expect(result.ok).toBe(true);
    });

    it('错误密钥返回 401', () => {
      const result = verifyCronAuth(
        buildRequest({
          host: 'mytv.example.com',
          authorization: 'Bearer wrong-secret',
        })
      );
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it('未携带任何凭据返回 401', () => {
      const result = verifyCronAuth(
        buildRequest({ host: 'mytv.example.com' })
      );
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });
  });
});
