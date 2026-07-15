import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';

import {
  EpisodeSkipConfig,
  getSkipConfig,
  saveSkipConfig,
} from '@/lib/db.client';

import SkipController, { getEndingBatchTimeValues } from './SkipController';

jest.mock('@/lib/db.client', () => ({
  deleteSkipConfig: jest.fn(),
  getSkipConfig: jest.fn(),
  saveSkipConfig: jest.fn(),
}));

const mockGetSkipConfig = getSkipConfig as jest.MockedFunction<
  typeof getSkipConfig
>;
const mockSaveSkipConfig = saveSkipConfig as jest.MockedFunction<
  typeof saveSkipConfig
>;

function createAbsoluteConfig(
  source: string,
  id: string,
  start: number,
  end: number,
): EpisodeSkipConfig {
  return {
    source,
    id,
    title: `${source}-${id}`,
    updated_time: 1,
    segments: [
      {
        type: 'ending',
        start,
        end,
        mode: 'absolute',
        autoSkip: false,
        autoNextEpisode: true,
      },
    ],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createPlayerRef() {
  return {
    current: {
      currentTime: 0,
      isReady: true,
      on: jest.fn(),
      off: jest.fn(),
      once: jest.fn(),
    },
  };
}

function openAdvancedSettings() {
  fireEvent.click(screen.getByRole('button', { name: '展开高级设置' }));
}

function getEndingInputs(): [HTMLInputElement, HTMLInputElement] {
  const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
  return [inputs[2], inputs[3]];
}

describe('SkipController', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetSkipConfig.mockReset();
    mockSaveSkipConfig.mockReset();
    jest.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('absolute ending settings derive start and end without duration inversion', () => {
    const config = createAbsoluteConfig('source-a', 'id-a', 610, 1180);
    expect(getEndingBatchTimeValues(config.segments[0], 1200)).toEqual({
      mode: 'absolute',
      startSeconds: 610,
      endSeconds: 1180,
    });
  });

  test('an old source request cannot overwrite the current source config', async () => {
    const sourceARequest = createDeferred<EpisodeSkipConfig | null>();
    const sourceBRequest = createDeferred<EpisodeSkipConfig | null>();
    mockGetSkipConfig.mockImplementation((source) =>
      source === 'source-a' ? sourceARequest.promise : sourceBRequest.promise,
    );

    const playerRef = createPlayerRef();
    const { rerender } = render(
      <SkipController
        source='source-a'
        id='id-a'
        title='A'
        duration={1200}
        artPlayerRef={playerRef}
        isSettingMode
      />,
    );
    await waitFor(() =>
      expect(mockGetSkipConfig).toHaveBeenCalledWith('source-a', 'id-a'),
    );

    rerender(
      <SkipController
        source='source-b'
        id='id-b'
        title='B'
        duration={1200}
        artPlayerRef={playerRef}
        isSettingMode
      />,
    );
    await waitFor(() =>
      expect(mockGetSkipConfig).toHaveBeenCalledWith('source-b', 'id-b'),
    );

    await act(async () => {
      sourceBRequest.resolve(
        createAbsoluteConfig('source-b', 'id-b', 800, 1000),
      );
    });
    openAdvancedSettings();
    await waitFor(() => {
      const [endingStart, endingEnd] = getEndingInputs();
      expect(endingStart.value).toBe('13:20');
      expect(endingEnd.value).toBe('16:40');
    });

    await act(async () => {
      sourceARequest.resolve(
        createAbsoluteConfig('source-a', 'id-a', 100, 200),
      );
    });
    await waitFor(() => {
      const [endingStart, endingEnd] = getEndingInputs();
      expect(endingStart.value).toBe('13:20');
      expect(endingEnd.value).toBe('16:40');
    });
  });

  test('switching source clears the previous config while the new one loads', async () => {
    const sourceBRequest = createDeferred<EpisodeSkipConfig | null>();
    mockGetSkipConfig.mockImplementation((source) =>
      source === 'source-a'
        ? Promise.resolve(createAbsoluteConfig('source-a', 'id-a', 600, 900))
        : sourceBRequest.promise,
    );

    const playerRef = createPlayerRef();
    const { rerender } = render(
      <SkipController
        source='source-a'
        id='id-a'
        title='A'
        duration={1200}
        artPlayerRef={playerRef}
        isSettingMode
      />,
    );
    openAdvancedSettings();
    await waitFor(() => expect(getEndingInputs()[0].value).toBe('10:00'));

    rerender(
      <SkipController
        source='source-b'
        id='id-b'
        title='B'
        duration={1200}
        artPlayerRef={playerRef}
        isSettingMode
      />,
    );
    await waitFor(() => expect(getEndingInputs()[0].value).toBe('2:00'));

    await act(async () => {
      sourceBRequest.resolve(null);
    });
  });

  test('closing and reopening restores the saved config instead of defaults or edits', async () => {
    mockGetSkipConfig.mockResolvedValue(
      createAbsoluteConfig('source-a', 'id-a', 610, 1180),
    );

    function Harness() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <>
          <button type='button' onClick={() => setIsOpen(true)}>
            打开设置
          </button>
          <SkipController
            source='source-a'
            id='id-a'
            title='A'
            duration={1200}
            artPlayerRef={createPlayerRef()}
            isSettingMode={isOpen}
            onSettingModeChange={setIsOpen}
          />
        </>
      );
    }

    render(<Harness />);
    openAdvancedSettings();
    await waitFor(() => expect(getEndingInputs()[0].value).toBe('10:10'));

    fireEvent.change(getEndingInputs()[0], { target: { value: '1:23' } });
    expect(getEndingInputs()[0].value).toBe('1:23');
    fireEvent.click(screen.getByTitle('关闭 (ESC)'));
    fireEvent.click(screen.getByRole('button', { name: '打开设置' }));

    await waitFor(() => {
      const [endingStart, endingEnd] = getEndingInputs();
      expect(endingStart.value).toBe('10:10');
      expect(endingEnd.value).toBe('19:40');
    });

    fireEvent.change(getEndingInputs()[1], { target: { value: '19:30' } });
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    await waitFor(() => expect(mockSaveSkipConfig).toHaveBeenCalledTimes(1));
    const savedConfig = mockSaveSkipConfig.mock.calls[0][2];
    expect(
      savedConfig.segments.find((segment) => segment.type === 'ending'),
    ).toEqual(
      expect.objectContaining({
        start: 610,
        end: 1170,
        mode: 'absolute',
      }),
    );
  });
});
