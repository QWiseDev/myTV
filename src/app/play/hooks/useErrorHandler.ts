/**
 * 错误处理 Hook
 * 提供统一的错误处理和重试机制
 */

import { useCallback,useState } from 'react';

import { PlayError, PlayErrorCode, reportError } from '../utils/errors';

interface ErrorState {
  error: PlayError | null;
  hasError: boolean;
  errorCount: number;
}

export interface UseErrorHandlerReturn {
  error: PlayError | null;
  hasError: boolean;
  errorCount: number;
  handleError: (error: unknown) => PlayError;
  clearError: () => void;
  retry: <T>(
    fn: () => Promise<T>,
    maxRetries?: number,
    delay?: number
  ) => Promise<T>;
}

export const useErrorHandler = (): UseErrorHandlerReturn => {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    hasError: false,
    errorCount: 0,
  });

  /**
   * 处理错误
   */
  const handleError = useCallback((error: unknown): PlayError => {
    let playError: PlayError;

    // 转换为 PlayError
    if (error instanceof PlayError) {
      playError = error;
    } else if (error instanceof Error) {
      playError = new PlayError(
        PlayErrorCode.UNKNOWN_ERROR,
        error.message,
        error
      );
    } else {
      playError = new PlayError(
        PlayErrorCode.UNKNOWN_ERROR,
        String(error),
        error
      );
    }

    // 更新错误状态
    setErrorState((prev) => ({
      error: playError,
      hasError: true,
      errorCount: prev.errorCount + 1,
    }));

    // 控制台输出详细错误信息（开发环境）
    if (process.env.NODE_ENV === 'development') {
      console.error(
        `[${playError.code}] ${playError.message}`,
        playError.details
      );
    }

    // 错误上报
    if (playError.shouldReport()) {
      reportError(playError);
    }

    return playError;
  }, []);

  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      hasError: false,
      errorCount: 0,
    });
  }, []);

  /**
   * 重试机制
   * @param fn 要执行的异步函数
   * @param maxRetries 最大重试次数（默认3次）
   * @param delay 重试延迟（默认1000ms，每次重试会递增）
   */
  const retry = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      maxRetries = 3,
      delay = 1000
    ): Promise<T> => {
      let lastError: unknown;

      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error;

          // 如果还有重试机会，等待后重试
          if (i < maxRetries - 1) {
            const retryDelay = delay * (i + 1);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      // 所有重试都失败，抛出最后的错误
      throw lastError;
    },
    []
  );

  return {
    error: errorState.error,
    hasError: errorState.hasError,
    errorCount: errorState.errorCount,
    handleError,
    clearError,
    retry,
  };
};
