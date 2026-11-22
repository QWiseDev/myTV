/**
 * @jest-environment node
 */

const mockGetAdminConfig = jest.fn();
const mockGetAllUsers = jest.fn();

jest.mock('@/lib/db', () => ({
  db: {
    getAdminConfig: (...args: unknown[]) => mockGetAdminConfig(...args),
    getAllUsers: (...args: unknown[]) => mockGetAllUsers(...args),
    saveAdminConfig: jest.fn().mockResolvedValue(undefined),
  },
}));

import { AdminConfig } from './admin.types';
import {
  clearConfigCache,
  getAdultApiSites,
  getAvailableApiSites,
  refineConfig,
} from './config';

const buildConfig = (overrides?: Partial<AdminConfig>): AdminConfig => ({
  ConfigFile: '',
  ConfigSubscribtion: { URL: '', AutoUpdate: false, LastCheck: '' },
  SiteConfig: {} as AdminConfig['SiteConfig'],
  UserConfig: { AllowRegister: true, Users: [] },
  SourceConfig: [
    {
      key: 'normal1',
      name: '常规源',
      api: 'https://n1.example.com/',
      from: 'custom',
      disabled: false,
    },
    {
      key: 'disabled1',
      name: '禁用源',
      api: 'https://n2.example.com/',
      from: 'custom',
      disabled: true,
    },
    {
      key: 'jp98.vip',
      name: '黄果',
      api: 'https://jp98.vip/api.php/provide/vod/',
      from: 'config',
      disabled: false,
      adult: true,
    },
  ],
  CustomCategories: [],
  ...overrides,
});

describe('adult source filtering (黄果模块)', () => {
  beforeEach(() => {
    mockGetAdminConfig.mockReset();
    mockGetAllUsers.mockReset();
    mockGetAdminConfig.mockResolvedValue(buildConfig());
    mockGetAllUsers.mockResolvedValue([]);
    clearConfigCache();
  });

  describe('getAvailableApiSites', () => {
    it('excludes adult and disabled sources', async () => {
      const sites = await getAvailableApiSites();
      expect(sites.map((s) => s.key)).toEqual(['normal1']);
    });

    it('still applies per-user enabledApis filtering', async () => {
      mockGetAdminConfig.mockResolvedValue(
        buildConfig({
          UserConfig: {
            AllowRegister: true,
            Users: [
              {
                username: 'alice',
                role: 'user',
                banned: false,
                enabledApis: ['normal1', 'jp98.vip'],
              },
            ],
          },
        }),
      );
      // configSelfCheck 会按 getAllUsers 重建用户列表，需包含 alice
      mockGetAllUsers.mockResolvedValue(['alice']);
      clearConfigCache();

      // enabledApis 含成人源 key 时，常规列表仍不含成人源
      const sites = await getAvailableApiSites('alice');
      expect(sites.map((s) => s.key)).toEqual(['normal1']);
    });
  });

  describe('getAdultApiSites', () => {
    it('returns only enabled adult sources', async () => {
      const sites = await getAdultApiSites();
      expect(sites.map((s) => s.key)).toEqual(['jp98.vip']);
    });

    it('honors per-user enabledApis within adult sources', async () => {
      mockGetAdminConfig.mockResolvedValue(
        buildConfig({
          UserConfig: {
            AllowRegister: true,
            Users: [
              {
                username: 'alice',
                role: 'user',
                banned: false,
                enabledApis: ['normal1'],
              },
            ],
          },
        }),
      );
      mockGetAllUsers.mockResolvedValue(['alice']);
      clearConfigCache();

      const sites = await getAdultApiSites('alice');
      expect(sites).toEqual([]);
    });
  });

  describe('refineConfig built-in adult source', () => {
    it('re-seeds the built-in adult source when missing', () => {
      const config = buildConfig({
        SourceConfig: [
          {
            key: 'normal1',
            name: '常规源',
            api: 'https://n1.example.com/',
            from: 'custom',
            disabled: false,
          },
        ],
      });

      const refined = refineConfig(config);
      const jp98 = refined.SourceConfig.find((s) => s.key === 'jp98.vip');
      expect(jp98).toBeDefined();
      expect(jp98?.adult).toBe(true);
      expect(jp98?.from).toBe('config');
    });

    it('forces adult flag on the built-in entry even when stored without it', () => {
      const config = buildConfig({
        SourceConfig: [
          {
            key: 'jp98.vip',
            name: '黄果',
            api: 'https://jp98.vip/api.php/provide/vod/',
            from: 'custom',
            disabled: false,
          },
        ],
      });

      const refined = refineConfig(config);
      const jp98 = refined.SourceConfig.find((s) => s.key === 'jp98.vip');
      expect(jp98?.adult).toBe(true);
      expect(jp98?.from).toBe('config');
    });
  });
});

export {};
