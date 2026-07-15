'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { logAccess } from '@/lib/access-log';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import type { HomeData } from '@/lib/home-data-types';
import { useAiRecommendStatus } from '@/hooks/useAiRecommendStatus';
import { useAnnouncementVisibility } from '@/hooks/useAnnouncementVisibility';
import { useFavoriteItems } from '@/hooks/useFavoriteItems';
import { useHomeData } from '@/hooks/useHomeData';
import { usePlayRecordActions } from '@/hooks/usePlayRecordActions';

import AIRecommendButton from '@/components/AIRecommendButton';
import AnnouncementModal from '@/components/AnnouncementModal';
import CapsuleSwitch from '@/components/CapsuleSwitch';
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
const TelegramWelcomeModal = lazy(() =>
  import('@/components/TelegramWelcomeModal').then((mod) => ({
    default: mod.TelegramWelcomeModal,
  })),
);

const HOME_TABS = [
  { label: '首页', value: 'home' },
  { label: '收藏夹', value: 'favorites' },
] as const;

type HomeTab = (typeof HOME_TABS)[number]['value'];

function isHomeTab(value: string): value is HomeTab {
  return HOME_TABS.some((tab) => tab.value === value);
}

function HomeContent({ initialHomeData }: { initialHomeData?: HomeData }) {
  const [activeTab, setActiveTab] = useState<HomeTab>('home');
  const [showAIRecommendModal, setShowAIRecommendModal] = useState(false);

  const {
    playRecords,
    setPlayRecords,
    watchingUpdates,
    hasMorePlayRecords,
    loadingMorePlayRecords,
    loadingPlayRecords,
    loadingWatchingUpdates,
    loadMorePlayRecords,
    markAllPlayRecordsDeleted,
    markPlayRecordDeleted,
    refreshWatchingUpdates,
  } = usePlaybackData();

  const { favoriteItems, favoriteLoadError, loadingFavorites, clearFavorites } =
    useFavoriteItems(activeTab);
  const { homeData, loading: homeLoading } = useHomeData({
    activeTab,
    refreshWatchingUpdates,
    initialData: initialHomeData,
  });

  const { announcement } = useSite();
  const { showAnnouncement, closeAnnouncement } =
    useAnnouncementVisibility(announcement);
  const aiEnabled = useAiRecommendStatus();
  const { deletePlayRecord, clearAllPlayRecords } = usePlayRecordActions({
    markAllPlayRecordsDeleted,
    markPlayRecordDeleted,
    setPlayRecords,
  });

  const continueWatching = useMemo<HomeContinueWatchingState>(
    () => ({
      playRecords: playRecords ?? {},
      watchingUpdates: watchingUpdates ?? null,
      loading: loadingPlayRecords || loadingWatchingUpdates,
      loadingMore: loadingMorePlayRecords,
      hasMore: hasMorePlayRecords,
      onDeleteRecord: deletePlayRecord,
      onClearAll: clearAllPlayRecords,
      onLoadMore: loadMorePlayRecords,
    }),
    [
      playRecords,
      watchingUpdates,
      loadingPlayRecords,
      loadingWatchingUpdates,
      loadingMorePlayRecords,
      hasMorePlayRecords,
      deletePlayRecord,
      clearAllPlayRecords,
      loadMorePlayRecords,
    ],
  );

  useEffect(() => {
    const authInfo = getAuthInfoFromBrowserCookie();
    logAccess('homepage', {
      tab: 'home',
      username: authInfo?.username || 'anonymous',
    });
  }, []);

  const handleTabChange = useCallback((value: string) => {
    if (isHomeTab(value)) {
      setActiveTab(value);
    }
  }, []);

  return (
    <PageLayout>
      <Suspense fallback={null}>
        <TelegramWelcomeModal />
      </Suspense>

      {/* 布局容器交给 PageLayout，避免多层 padding 叠加 */}
      <div className='overflow-visible'>
        <div className='mb-4 flex flex-col sm:flex-row items-center justify-center gap-4'>
          <CapsuleSwitch
            options={HOME_TABS}
            active={activeTab}
            onChange={handleTabChange}
          />

          {aiEnabled && (
            <AIRecommendButton onClick={() => setShowAIRecommendModal(true)} />
          )}
        </div>

        {activeTab === 'favorites' ? (
          <Suspense fallback={null}>
            <FavoritesSection
              favoriteItems={favoriteItems}
              loadError={favoriteLoadError}
              loading={loadingFavorites}
              onClearAll={clearFavorites}
            />
          </Suspense>
        ) : (
          <HomeTabContent
            continueWatching={continueWatching}
            homeData={homeData}
            loading={homeLoading}
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
