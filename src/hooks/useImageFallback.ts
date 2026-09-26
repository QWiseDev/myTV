'use client';

import { useEffect, useMemo, useState } from 'react';

import { getImageFallbackUrls, processImageUrl } from '@/lib/utils';

/**
 * 图片多级兜底：第三方 CDN 链依次尝试，全部失败后 imageSrc 变为 null
 * （由调用方决定隐藏元素）。src 变化时自动重置兜底进度。
 */
export function useImageFallback(src: string) {
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const normalizedSrc = src.replace(/^http:/, 'https:');
  const fallbackUrls = useMemo(
    () => getImageFallbackUrls(normalizedSrc),
    [normalizedSrc],
  );
  const resolvedSrc =
    fallbackUrls[fallbackIndex] || processImageUrl(normalizedSrc);

  useEffect(() => {
    setFallbackIndex(0);
    setFailed(false);
  }, [normalizedSrc]);

  const handleError = () => {
    if (fallbackIndex < fallbackUrls.length - 1) {
      setFallbackIndex((index) => index + 1);
      return;
    }
    setFailed(true);
  };

  return { imageSrc: failed ? null : resolvedSrc, handleError };
}
