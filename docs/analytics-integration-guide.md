# Microsoft Clarity Analytics 集成指南

本项目已集成 Microsoft Clarity 用于用户行为分析和性能监控。本文档介绍如何使用各种埋点功能。

## 目录

1. [快速开始](#快速开始)
2. [视频相关埋点](#视频相关埋点)
3. [用户行为埋点](#用户行为埋点)
4. [性能监控埋点](#性能监控埋点)
5. [搜索行为分析](#搜索行为分析)
6. [错误监控](#错误监控)
7. [最佳实践](#最佳实践)

## 快速开始

### 1. 基础使用

```tsx
import { useAnalytics } from '@/hooks/useAnalytics';

function MyComponent() {
  const { trackPageView, trackFeatureUsage } = useAnalytics();

  useEffect(() => {
    // 追踪页面访问
    trackPageView('my_page', '我的页面');
  }, []);

  const handleButtonClick = () => {
    // 追踪按钮点击
    trackFeatureUsage('button_click', true, {
      button_name: 'submit_button'
    });
  };

  return <button onClick={handleButtonClick}>提交</button>;
}
```

### 2. 设置用户信息

```tsx
import { useAnalytics } from '@/hooks/useAnalytics';

function UserComponent({ userId, userType }) {
  const { setUserId, setUserType } = useAnalytics();

  useEffect(() => {
    // 设置用户ID和类型
    setUserId(userId);
    setUserType(userType); // 'guest' | 'registered' | 'premium'
  }, [userId, userType]);

  // 组件内容...
}
```

## 视频相关埋点

### 1. 基础视频追踪

```tsx
import { useVideoAnalytics } from '@/hooks/useVideoAnalytics';

function VideoPlayer({ video }) {
  const {
    trackPlay,
    trackPause,
    trackComplete,
    trackFavorite,
    trackShare,
    trackProgress
  } = useVideoAnalytics({
    videoId: video.id,
    videoTitle: video.title,
    videoType: 'movie', // 'movie' | 'tv' | 'episode' | 'live'
    source: 'main_source',
    duration: video.duration
  });

  const handlePlay = () => {
    trackPlay(0, '720p'); // position, quality
  };

  const handlePause = () => {
    trackPause(currentTime);
  };

  const handleTimeUpdate = (currentTime) => {
    trackProgress(currentTime); // 自动检测播放完成
  };

  const handleFavorite = () => {
    trackFavorite();
  };

  const handleShare = (platform) => {
    trackShare(platform); // 'wechat' | 'weibo' | 'qq' | 'link' | 'other'
  };

  return (
    <div>
      {/* 视频播放器组件 */}
      <button onClick={handlePlay}>播放</button>
      <button onClick={handlePause}>暂停</button>
      <button onClick={handleFavorite}>收藏</button>
      <button onClick={() => handleShare('wechat')}>分享到微信</button>
    </div>
  );
}
```

### 2. 视频质量分析

```tsx
import { useVideoQualityAnalytics } from '@/hooks/useVideoAnalytics';

function VideoQualityControl({ videoId, videoTitle }) {
  const { trackQualityChange, trackQualityIssue } = useVideoQualityAnalytics(videoId, videoTitle);

  const handleQualityChange = (newQuality) => {
    trackQualityChange(currentQuality, newQuality, false); // 手动切换
  };

  const handleQualityProblem = (issue) => {
    trackQualityIssue('720p', issue);
  };

  return (
    <div>
      <select onChange={(e) => handleQualityChange(e.target.value)}>
        <option value="360p">360p</option>
        <option value="720p">720p</option>
        <option value="1080p">1080p</option>
      </select>
    </div>
  );
}
```

### 3. 弹幕分析

```tsx
import { useDanmuAnalytics } from '@/hooks/useVideoAnalytics';

function DanmuSystem({ videoId, videoTitle }) {
  const { trackDanmuSend, trackDanmuToggle, trackDanmuSearch } = useDanmuAnalytics(videoId, videoTitle);

  const sendDanmu = (content, position) => {
    trackDanmuSend(content, position);
    // 发送弹幕逻辑...
  };

  const toggleDanmu = (enabled) => {
    trackDanmuToggle(enabled);
    // 切换弹幕显示逻辑...
  };

  const searchDanmu = (keyword) => {
    trackDanmuSearch(keyword);
    // 搜索弹幕逻辑...
  };

  return (
    <div>
      <input type="text" placeholder="发送弹幕" onSend={sendDanmu} />
      <button onClick={() => toggleDanmu(true)}>显示弹幕</button>
      <input type="text" placeholder="搜索弹幕" onSearch={searchDanmu} />
    </div>
  );
}
```

## 用户行为埋点

### 1. 用户认证追踪

```tsx
import { useUserBehaviorAnalytics } from '@/hooks/useUserBehaviorAnalytics';

function LoginForm() {
  const { trackRegistration, trackLogin, trackUserError } = useUserBehaviorAnalytics();

  const handleLogin = async (credentials) => {
    try {
      await login(credentials);
      trackLogin('email', { login_method: 'email_form' });
    } catch (error) {
      trackUserError('login_failed', error.message, { login_method: 'email' });
    }
  };

  const handleRegister = async (userData) => {
    try {
      await register(userData);
      trackRegistration('email', { registration_source: 'signup_form' });
    } catch (error) {
      trackUserError('registration_failed', error.message, { registration_method: 'email' });
    }
  };

  return (
    <form>
      {/* 登录表单 */}
      <button onClick={handleLogin}>登录</button>
      <button onClick={handleRegister}>注册</button>
    </form>
  );
}
```

### 2. 搜索行为分析

```tsx
import { useSearchAnalytics } from '@/hooks/useUserBehaviorAnalytics';

function SearchBar() {
  const { trackSearchQuery, trackSearchFilter } = useSearchAnalytics();

  const handleSearch = async (query, filters) => {
    const startTime = performance.now();

    try {
      const results = await searchAPI(query, filters);
      const searchTime = performance.now() - startTime;

      trackSearchQuery(query, results.length, searchTime, {
        category: 'all',
        filters: filters,
        searchType: 'general'
      });

      return results;
    } catch (error) {
      const searchTime = performance.now() - startTime;
      trackSearchQuery(query, 0, searchTime, {
        category: 'all',
        searchType: 'general'
      });
      throw error;
    }
  };

  const handleFilterChange = (filterType, filterValue) => {
    trackSearchFilter(filterType, filterValue);
  };

  return (
    <div>
      <input type="text" onSearch={handleSearch} />
      <select onChange={(e) => handleFilterChange('category', e.target.value)}>
        <option value="all">全部</option>
        <option value="movie">电影</option>
        <option value="tv">电视剧</option>
      </select>
    </div>
  );
}
```

### 3. 用户路径分析

```tsx
import { useUserJourneyAnalytics } from '@/hooks/useUserBehaviorAnalytics';

function SignupFlow() {
  const { trackJourneyStep, trackJourneyComplete } = useUserJourneyAnalytics();

  useEffect(() => {
    // 开始注册流程
    trackJourneyStep('signup_start', { source: 'homepage' });
  }, []);

  const handleStep1Complete = () => {
    trackJourneyStep('email_entered', { step: 1 });
  };

  const handleStep2Complete = () => {
    trackJourneyStep('password_entered', { step: 2 });
  };

  const handleSignupComplete = () => {
    trackJourneyComplete('user_signup', true);
  };

  return (
    <div>
      <input onBlur={handleStep1Complete} placeholder="邮箱" />
      <input onBlur={handleStep2Complete} placeholder="密码" />
      <button onClick={handleSignupComplete}>完成注册</button>
    </div>
  );
}
```

## 性能监控埋点

### 1. 自动性能监控

```tsx
import { useAutoPerformanceMonitoring } from '@/hooks/usePerformanceAnalytics';

function App() {
  const { startInteractionTiming, endInteractionTiming } = useAutoPerformanceMonitoring();

  const handleComplexOperation = async () => {
    const interactionId = 'complex_operation';
    startInteractionTiming(interactionId);

    try {
      await performComplexOperation();
    } finally {
      endInteractionTiming(interactionId, 'complex_operation', 'main_button');
    }
  };

  return <button onClick={handleComplexOperation}>执行复杂操作</button>;
}
```

### 2. 手动性能追踪

```tsx
import { usePerformanceAnalytics } from '@/hooks/usePerformanceAnalytics';

function DataComponent() {
  const { trackApiRequest, trackResourceLoad } = usePerformanceAnalytics();

  const fetchData = async () => {
    const startTime = performance.now();

    try {
      const response = await fetch('/api/data');
      const endTime = performance.now();

      trackApiRequest('/api/data', startTime, endTime, response.status);
      return response.json();
    } catch (error) {
      const endTime = performance.now();
      trackApiRequest('/api/data', startTime, endTime, 0, error.message);
      throw error;
    }
  };

  const loadResource = (resourceType, url) => {
    const startTime = performance.now();

    fetch(url)
      .then(response => {
        const endTime = performance.now();
        trackResourceLoad(resourceType, url, endTime - startTime, response.ok);
      })
      .catch(error => {
        const endTime = performance.now();
        trackResourceLoad(resourceType, url, endTime - startTime, false);
      });
  };

  return (
    <div>
      <button onClick={fetchData}>加载数据</button>
      <button onClick={() => loadResource('image', '/api/image')}>加载图片</button>
    </div>
  );
}
```

## 错误监控

### 1. JavaScript 错误监控

```tsx
import { useErrorMonitoring } from '@/hooks/useAnalytics';

function App() {
  useErrorMonitoring(); // 自动监控全局错误

  const handleRiskyOperation = () => {
    try {
      // 可能出错的操作
      riskyOperation();
    } catch (error) {
      // 手动报告错误
      analytics.trackError('manual_error', error.message, {
        operation: 'risky_operation',
        user_action: 'button_click'
      });
    }
  };

  return <button onClick={handleRiskyOperation}>执行操作</button>;
}
```

### 2. API 错误监控

```tsx
function ApiComponent() {
  const { trackError } = useAnalytics();

  const callApi = async () => {
    try {
      const response = await fetch('/api/data');

      if (!response.ok) {
        trackError('api_error', `API request failed: ${response.status}`, {
          endpoint: '/api/data',
          status_code: response.status,
          method: 'GET'
        });
      }

      return response.json();
    } catch (error) {
      trackError('api_network_error', error.message, {
        endpoint: '/api/data',
        error_type: 'network'
      });
      throw error;
    }
  };

  return <button onClick={callApi}>调用API</button>;
}
```

## 最佳实践

### 1. 命名规范

- 事件名称使用下划线分隔的小写字母（如：`video_play`, `user_login`）
- 属性名称使用下划线分隔的小写字母（如：`video_id`, `user_type`）
- 保持命名的一致性和可读性

### 2. 时机选择

- 在用户操作发生时立即埋点
- 异步操作在成功或失败时埋点
- 页面访问在组件加载时埋点

### 3. 数据准确性

- 确保关键数据的准确性（如视频ID、用户ID）
- 避免发送敏感信息（如密码、令牌）
- 使用适当的数值类型和单位

### 4. 性能考虑

- 避免在高频事件中过度埋点
- 使用批量发送或防抖/节流
- 监控埋点对应用性能的影响

### 5. 隐私合规

- 只收集必要的用户数据
- 提供数据清除选项
- 遵守相关隐私法规（如GDPR、CCPA）

## 常见问题

### Q: 如何检查埋点是否正常工作？

A: 可以在浏览器控制台查看日志，所有埋点事件都会打印详细信息。也可以在 Microsoft Clarity 控制台中查看实时数据。

### Q: 如何在生产环境中禁用埋点？

A: 通过环境变量 `NEXT_PUBLIC_ENABLE_CLARITY=false` 可以禁用埋点。

### Q: 埋点数据多久能在 Clarity 中看到？

A: 大部分数据会在几分钟内出现在 Clarity 控制台中，某些统计数据可能需要更长时间。

### Q: 如何处理用户离线时的埋点？

A: 当前实现在离线时埋点会丢失。如果需要离线支持，可以考虑使用本地存储缓存，待网络恢复后发送。

## 技术支持

如有问题，请联系开发团队或查看 [Microsoft Clarity 官方文档](https://learn.microsoft.com/en-us/clarity/)。