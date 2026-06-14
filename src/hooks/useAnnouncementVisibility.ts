import { useCallback, useEffect, useState } from 'react';

const ANNOUNCEMENT_SEEN_KEY = 'hasSeenAnnouncement';

export function useAnnouncementVisibility(announcement?: string | null) {
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!announcement) {
      setShowAnnouncement(false);
      return;
    }

    const hasSeenAnnouncement = localStorage.getItem(ANNOUNCEMENT_SEEN_KEY);
    setShowAnnouncement(hasSeenAnnouncement !== announcement);
  }, [announcement]);

  const closeAnnouncement = useCallback((announcementText: string) => {
    setShowAnnouncement(false);
    localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, announcementText);
  }, []);

  return {
    showAnnouncement,
    closeAnnouncement,
  };
}
