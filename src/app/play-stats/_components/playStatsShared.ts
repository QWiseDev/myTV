'use client';

export interface UserLevel {
  level: number;
  name: string;
  icon: string;
  minLogins: number;
  maxLogins: number;
  description: string;
  gradient: string;
}

export const USER_LEVELS: UserLevel[] = [
  {
    level: 1,
    name: '新星观众',
    icon: '🌟',
    minLogins: 1,
    maxLogins: 9,
    description: '刚刚开启观影之旅',
    gradient: 'from-slate-400 to-slate-600',
  },
  {
    level: 2,
    name: '常客影迷',
    icon: '🎬',
    minLogins: 10,
    maxLogins: 49,
    description: '热爱电影的观众',
    gradient: 'from-blue-400 to-blue-600',
  },
  {
    level: 3,
    name: '资深观众',
    icon: '📺',
    minLogins: 50,
    maxLogins: 199,
    description: '对剧集有独特品味',
    gradient: 'from-emerald-400 to-emerald-600',
  },
  {
    level: 4,
    name: '影院达人',
    icon: '🎭',
    minLogins: 200,
    maxLogins: 499,
    description: '深度电影爱好者',
    gradient: 'from-violet-400 to-violet-600',
  },
  {
    level: 5,
    name: '观影专家',
    icon: '🏆',
    minLogins: 500,
    maxLogins: 999,
    description: '拥有丰富观影经验',
    gradient: 'from-amber-400 to-amber-600',
  },
  {
    level: 6,
    name: '传奇影神',
    icon: '👑',
    minLogins: 1000,
    maxLogins: 2999,
    description: '影视界的传奇人物',
    gradient: 'from-red-400 via-red-500 to-red-600',
  },
  {
    level: 7,
    name: '殿堂影帝',
    icon: '💎',
    minLogins: 3000,
    maxLogins: 9999,
    description: '影视殿堂的至尊',
    gradient: 'from-pink-400 via-pink-500 to-pink-600',
  },
  {
    level: 8,
    name: '永恒之光',
    icon: '✨',
    minLogins: 10000,
    maxLogins: Infinity,
    description: '永恒闪耀的观影之光',
    gradient: 'from-indigo-400 via-purple-500 to-pink-500',
  },
];

export const calculateUserLevel = (loginCount: number): UserLevel => {
  if (loginCount === 0) {
    return {
      level: 0,
      name: '待激活',
      icon: '💤',
      minLogins: 0,
      maxLogins: 0,
      description: '尚未开始观影之旅',
      gradient: 'from-gray-400 to-gray-500',
    };
  }

  for (const level of USER_LEVELS) {
    if (loginCount >= level.minLogins && loginCount <= level.maxLogins) {
      return level;
    }
  }

  return USER_LEVELS[USER_LEVELS.length - 1];
};

export const formatLoginDisplay = (loginCount: number) => {
  const userLevel = calculateUserLevel(loginCount);

  return {
    isSimple: false,
    level: userLevel,
    displayCount:
      loginCount === 0
        ? '0'
        : loginCount > 10000
        ? '10000+'
        : loginCount > 1000
        ? `${Math.floor(loginCount / 1000)}k+`
        : loginCount.toString(),
  };
};

export const formatTime = (seconds: number): string => {
  if (seconds === 0) return '00:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (hours === 0) {
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
      .toString()
      .padStart(2, '0')}`;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export const formatDateTime = (timestamp: number): string => {
  if (!timestamp) return '未知时间';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '时间格式错误';

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });
};

export const formatLastUpdate = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));

  if (minutes < 1) return '刚刚更新';
  if (minutes < 60) return `${minutes}分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;

  const days = Math.floor(hours / 24);
  return `${days}天前`;
};

export const getProgressPercentage = (
  playTime: number,
  totalTime: number
): number => {
  if (!totalTime) return 0;
  return Math.min(Math.round((playTime / totalTime) * 100), 100);
};
