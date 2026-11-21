import { shouldRestorePlayRecordTime } from './usePlayRecordSync';

describe('shouldRestorePlayRecordTime', () => {
  test('restores same episode progress during initial episode bootstrap', () => {
    expect(
      shouldRestorePlayRecordTime({
        targetTime: 120,
        isRestoringFromRecord: false,
        isEpisodeChanging: true,
        isSourceChanging: false,
        isSameEpisodeRecord: true,
      }),
    ).toBe(true);
  });

  test('keeps explicit record restoration behavior while source is switching', () => {
    expect(
      shouldRestorePlayRecordTime({
        targetTime: 120,
        isRestoringFromRecord: true,
        isEpisodeChanging: false,
        isSourceChanging: true,
        isSameEpisodeRecord: true,
      }),
    ).toBe(true);
  });

  test('does not restore same-episode progress during normal source switching', () => {
    expect(
      shouldRestorePlayRecordTime({
        targetTime: 120,
        isRestoringFromRecord: false,
        isEpisodeChanging: false,
        isSourceChanging: true,
        isSameEpisodeRecord: true,
      }),
    ).toBe(false);
  });

  test('ignores empty or invalid progress', () => {
    expect(
      shouldRestorePlayRecordTime({
        targetTime: 0,
        isRestoringFromRecord: true,
        isEpisodeChanging: false,
        isSourceChanging: false,
        isSameEpisodeRecord: true,
      }),
    ).toBe(false);
  });
});
