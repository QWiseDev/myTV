'use client';

import { useSearchParams } from 'next/navigation';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

import { logAccess } from '@/lib/access-log';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import type { HomeData } from '@/lib/home-data-types';
import { useAiRecommendStatus } from '@/hooks/useAiRecommendStatus';
import { useAnnouncementVisibility } from '@/hooks/useAnnouncementVisibility';
import { useFavoriteItems } from '@/hooks/useFavoriteItems';
import { useHomeData } from '@/hooks/useHomeData';

import AIRecommendButton from '@/components/AIRecommendButton';
import AnnouncementModal from '@/components/AnnouncementModal';
import HomeTabContent, {
  type HomeContinueWatchingState,
} from '@/components/HomeTabContent';
import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';

import {
  PlaybackDataProvider,
  usePlaybackData,
} from '@/contexts/PlayPageContext';

const AIRecommendModal = lazy(() => import('@/components/AIRecommendModal'));
const FavoritesSection = lazy(() => import('@/components/FavoritesSection'));
const SlotMachineFloatButton = lazy(
  () => import('@/components/SlotMachineFloatButton'),
);

type HomeTab = 'home' | 'favorites';

function HomeContent({ initialHomeData }: { initialHomeData?: HomeData }) {
  // Tab 状态由 URL ?tab= 派生（顶栏收藏夹入口跳转 /?tab=favorites）
  const searchParams = useSearchParams();
  const activeTab: HomeTab =
    searchParams.get('tab') === 'favorites' ? 'favorites' : 'home';
  const [showAIRecommendModal, setShowAIRecommendModal] = useState(false);

  const {
    playRecords,
    watchingUpdates,
    hasMorePlayRecords,
    loadingMorePlayRecords,
    loadingPlayRecords,
    loadMorePlayRecords,
    deleteRecord,
    clearAll,
    playRecordsLoadError,
    refreshWatchingUpdates,
    retryPlayRecords,
  } = usePlaybackData();

  const {
    favoriteItems,
    favoriteLoadError,
    loadingFavorites,
    retryFavorites,
    clearFavorites,
  } = useFavoriteItems(activeTab);
  const {
    errors: homeErrors,
    homeData,
    loading: homeLoading,
    retrySection,
  } = useHomeData({
    activeTab,
    refreshWatchingUpdates,
    initialData: initialHomeData,
  });

  const { announcement } = useSite();
  const { showAnnouncement, closeAnnouncement } =
    useAnnouncementVisibility(announcement);
  const aiEnabled = useAiRecommendStatus();

  // 继续观看与 Hero 的骨架 loading 仅由播放首屏加载决定，追更补齐不重新置 true（方案 5.1）
  const continueWatching = useMemo<HomeContinueWatchingState>(
    () => ({
      playRecords: playRecords ?? {},
      watchingUpdates: watchingUpdates ?? null,
      loading: loadingPlayRecords,
      loadingMore: loadingMorePlayRecords,
      hasMore: hasMorePlayRecords,
      loadError: playRecordsLoadError,
      onDeleteRecord: deleteRecord,
      onClearAll: clearAll,
      onLoadMore: loadMorePlayRecords,
      onRetry: retryPlayRecords,
    }),
    [
      playRecords,
      watchingUpdates,
      loadingPlayRecords,
      loadingMorePlayRecords,
      hasMorePlayRecords,
      playRecordsLoadError,
      deleteRecord,
      clearAll,
      loadMorePlayRecords,
      retryPlayRecords,
    ],
  );

  useEffect(() => {
    const authInfo = getAuthInfoFromBrowserCookie();
    logAccess('homepage', {
      tab: activeTab,
      username: authInfo?.username || 'anonymous',
    });
  }, [activeTab]);

  return (
    <PageLayout initialLoggedIn>
      {/* 布局容器交给 PageLayout，避免多层 padding 叠加 */}
      <div className='overflow-visible'>
        {aiEnabled && (
          <div className='mb-4 flex justify-end'>
            <AIRecommendButton onClick={() => setShowAIRecommendModal(true)} />
          </div>
        )}

        {activeTab === 'favorites' ? (
          <Suspense fallback={null}>
            <FavoritesSection
              favoriteItems={favoriteItems}
              loadError={favoriteLoadError}
              loading={loadingFavorites}
              onClearAll={clearFavorites}
              onRetry={retryFavorites}
            />
          </Suspense>
        ) : (
          <HomeTabContent
            continueWatching={continueWatching}
            errors={homeErrors}
            homeData={homeData}
            loading={homeLoading}
            retrySection={retrySection}
          />
        )}
      </div>

      <AnnouncementModal
        announcement={announcement || ''}
        isOpen={showAnnouncement}
        onClose={closeAnnouncement}
      />

      {showAIRecommendModal && (
        <Suspense fallback={null}>
          <AIRecommendModal
            isOpen={showAIRecommendModal}
            onClose={() => setShowAIRecommendModal(false)}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <SlotMachineFloatButton />
      </Suspense>
    </PageLayout>
  );
}

export default function HomeClient({
  initialHomeData,
}: {
  initialHomeData?: HomeData;
}) {
  return (
    <PlaybackDataProvider>
      <HomeContent initialHomeData={initialHomeData} />
    </PlaybackDataProvider>
  );
}
