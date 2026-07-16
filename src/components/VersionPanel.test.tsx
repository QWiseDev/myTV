import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { CURRENT_VERSION } from '@/lib/version';

import { VersionPanel } from './VersionPanel';

describe('VersionPanel', () => {
  beforeEach(() => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'scroll';
  });

  it('renders the local version and changelog without remote update content', async () => {
    const onClose = jest.fn();

    render(<VersionPanel isOpen onClose={onClose} />);

    expect(
      await screen.findByRole('heading', { name: '版本信息' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(`v${CURRENT_VERSION}`).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText('当前为最新版本')).toBeInTheDocument();
    expect(screen.getByText('当前版本由管理员维护')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '变更日志' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('有新版本可用')).not.toBeInTheDocument();
    expect(screen.queryByText('远程更新内容')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks page scrolling while open and restores the previous styles', async () => {
    const { rerender } = render(<VersionPanel isOpen onClose={jest.fn()} />);

    await screen.findByRole('heading', { name: '版本信息' });
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    rerender(<VersionPanel isOpen={false} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: '版本信息' }),
      ).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('auto');
      expect(document.documentElement.style.overflow).toBe('scroll');
    });
  });
});
