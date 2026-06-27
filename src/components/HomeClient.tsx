'use client';

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

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
import HomeTabContent from '@/components/HomeTabContent';
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
    loadingPlayRecords,
    loadingWatchingUpdates,
    refreshPlayRecords,
    refreshWatchingUpdates,
  } = usePlaybackData();

  const { favoriteItems, clearFavorites } = useFavoriteItems(activeTab);
  const {
    hotMovies,
    hotTvShows,
    hotVarietyShows,
    bangumiCalendarData,
    criticalLoading,
    secondaryLoading,
    tertiaryLoading,
  } = useHomeData({
    activeTab,
    refreshWatchingUpdates,
    initialData: initialHomeData,
  });

  const { announcement } = useSite();
  const { showAnnouncement, closeAnnouncement } =
    useAnnouncementVisibility(announcement);
  const aiEnabled = useAiRecommendStatus();
  const { deletePlayRecord, clearAllPlayRecords } = usePlayRecordActions({
    refreshPlayRecords,
    setPlayRecords,
  });

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

      <div className='px-2 sm:px-10 py-2 sm:py-4 overflow-visible'>
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

        <div className='w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          {activeTab === 'favorites' ? (
            <Suspense fallback={null}>
              <FavoritesSection
                favoriteItems={favoriteItems}
                onClearAll={clearFavorites}
              />
            </Suspense>
          ) : (
            <HomeTabContent
              playRecords={playRecords ?? {}}
              watchingUpdates={watchingUpdates ?? null}
              loadingPlayRecords={loadingPlayRecords}
              loadingWatchingUpdates={loadingWatchingUpdates}
              onDeleteRecord={deletePlayRecord}
              onClearAll={clearAllPlayRecords}
              hotMovies={hotMovies}
              hotTvShows={hotTvShows}
              hotVarietyShows={hotVarietyShows}
              bangumiCalendarData={bangumiCalendarData}
              criticalLoading={criticalLoading}
              secondaryLoading={secondaryLoading}
              tertiaryLoading={tertiaryLoading}
            />
          )}
        </div>
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
    <Suspense fallback={null}>
      <PlaybackDataProvider>
        <HomeContent initialHomeData={initialHomeData} />
      </PlaybackDataProvider>
    </Suspense>
  );
}
