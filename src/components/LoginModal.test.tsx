import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';

import LoginModal from './LoginModal';

const mockUsePathname = jest.fn(() => '/');

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn();

function renderAndOpen() {
  render(<LoginModal />);
  act(() => {
    window.dispatchEvent(new CustomEvent('open-login-modal'));
  });
}

function fillLoginFields() {
  fireEvent.change(screen.getByPlaceholderText('请输入用户名'), {
    target: { value: '测试用户' },
  });
  fireEvent.change(screen.getByPlaceholderText('请输入密码'), {
    target: { value: 'test12345678' },
  });
}

function fillRegisterFields() {
  fireEvent.change(screen.getByPlaceholderText('3-20位字母数字下划线'), {
    target: { value: '测试用户' },
  });
  fireEvent.change(screen.getByPlaceholderText('至少8位字符'), {
    target: { value: 'test12345678' },
  });
  fireEvent.change(screen.getByPlaceholderText('再次输入密码'), {
    target: { value: 'test12345678' },
  });
}

describe('LoginModal', () => {
  // jsdom 16 的 location.reload 是只读属性，整体替换 window.location 才能断言刷新
  const reloadMock = jest.fn();

  beforeAll(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
    delete (window as unknown as { location?: Location }).location;
    (
      window as unknown as {
        location: Partial<Location> & { reload: jest.Mock };
      }
    ).location = { reload: reloadMock };
  });

  beforeEach(() => {
    mockFetch.mockReset();
    reloadMock.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    mockUsePathname.mockReturnValue('/');
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('默认隐藏，收到事件后弹出登录表单', () => {
    render(<LoginModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('open-login-modal'));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入用户名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入密码')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '立即登录' }),
    ).toBeInTheDocument();
  });

  test('登录成功后记录登入时间并整页刷新', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

    renderAndOpen();
    fillLoginFields();
    fireEvent.click(screen.getByRole('button', { name: '立即登录' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/login',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/user/my-stats',
        expect.objectContaining({ method: 'PUT' }),
      );
      expect(localStorage.getItem('lastRecordedLogin')).toBeTruthy();
    });
    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalled();
    });
  });

  test('登录失败展示错误信息且不刷新页面', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: '密码错误' }),
    });

    renderAndOpen();
    fillLoginFields();
    fireEvent.click(screen.getByRole('button', { name: '立即登录' }));

    await waitFor(() => {
      expect(screen.getByText('密码错误')).toBeInTheDocument();
    });
    expect(reloadMock).not.toHaveBeenCalled();
  });

  test('切换注册 tab 后注册成功自动刷新', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    renderAndOpen();
    fireEvent.click(screen.getByRole('button', { name: '注册' }));
    expect(screen.getByPlaceholderText('再次输入密码')).toBeInTheDocument();

    fillRegisterFields();
    fireEvent.click(screen.getByRole('button', { name: '立即注册' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/register',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(screen.getByText('注册成功，已自动登录')).toBeInTheDocument();
    });

    // 成功提示展示 1.2s 后整页刷新
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1300));
    });
    expect(reloadMock).toHaveBeenCalled();
  }, 10000);

  test('注册两次密码不一致时提示且不发请求', () => {
    renderAndOpen();
    fireEvent.click(screen.getByRole('button', { name: '注册' }));
    fillRegisterFields();
    fireEvent.change(screen.getByPlaceholderText('再次输入密码'), {
      target: { value: 'different123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '立即注册' }));

    expect(screen.getByText('两次输入的密码不一致')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('Esc 键与点击遮罩可关闭弹窗', () => {
    renderAndOpen();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('open-login-modal'));
    });
    fireEvent.click(screen.getByRole('presentation'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('登录页与注册页不渲染弹窗', () => {
    mockUsePathname.mockReturnValue('/login');
    renderAndOpen();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    mockUsePathname.mockReturnValue('/register');
    act(() => {
      window.dispatchEvent(new CustomEvent('open-login-modal'));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
