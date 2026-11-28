'use client';

import LoadingScreen from '@/components/play/LoadingScreen';

export default function PlayLoading() {
  return (
    <LoadingScreen loadingStage='fetching' loadingMessage='正在进入播放页...' />
  );
}
