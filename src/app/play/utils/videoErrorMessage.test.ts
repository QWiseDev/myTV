import { getVideoErrorMessage } from './videoErrorMessage';

function mediaError(code: number, message = '') {
  return { code, message } as MediaError;
}

describe('videoErrorMessage', () => {
  test('maps standard media error codes to user-facing messages', () => {
    expect(getVideoErrorMessage(mediaError(1))).toBe('视频播放被中止');
    expect(getVideoErrorMessage(mediaError(2, 'timeout'))).toBe(
      '网络错误 - timeout',
    );
    expect(getVideoErrorMessage(mediaError(3))).toBe(
      '视频解码错误 - 视频文件损坏或不兼容',
    );
    expect(getVideoErrorMessage(mediaError(4))).toBe(
      '视频格式不支持或地址无效',
    );
  });

  test('maps unknown media error code with original code', () => {
    expect(getVideoErrorMessage(mediaError(99))).toBe('未知错误 (代码: 99)');
  });
});
