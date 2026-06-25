'use client';

import { useEffect } from 'react';

import { analytics } from '@/lib/analytics';

interface ClarityTrackerProps {
  projectId?: string;
  enable?: boolean;
  accountName?: string;    // 用户账号名（优先使用作为userId）
  displayName?: string;    // 显示名称（如果不提供则使用accountName）
  email?: string;
  sessionType?: 'guest' | 'registered' | 'premium';
  customTags?: Record<string, string>;
}

export function ClarityTracker({
  projectId = 'u6fla6fy8x',
  enable = true,
  accountName,
  displayName,
  email,
  sessionType,
  customTags
}: ClarityTrackerProps) {
  useEffect(() => {
    // 只在客户端和启用时运行
    if (typeof window === 'undefined' || !enable) {
      return;
    }

    // 延迟初始化，确保不与其他动态模块加载冲突
    const initializeClarity = () => {
      try {
        // 检查是否已经初始化
        if (window.clarity) {
          // 如果 Clarity 已经存在，初始化我们的 Analytics 并设置用户信息
          analytics.init();
          setClarityUserIdentifier();
          return;
        }

        // 创建 script 标签来加载 Microsoft Clarity
        const script = document.createElement('script');
        script.innerHTML = `
          (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "${projectId}");
        `;

        document.head.appendChild(script);

        // 等待 Clarity 初始化完成，然后初始化我们的 Analytics 并设置用户信息
        const initAnalytics = () => {
          if (window.clarity) {
            // 确保Analytics已初始化
            analytics.init();
            setClarityUserIdentifier();
          } else {
            setTimeout(initAnalytics, 200); // 增加延迟时间
          }
        };

        // 增加延迟时间，确保不影响其他动态模块
        setTimeout(initAnalytics, 1000);

      } catch (error) {
        console.error('[Clarity] Failed to initialize:', error);
      }
    };

    // 使用 requestIdleCallback 或 setTimeout 来延迟初始化，避免与动态导入冲突
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => {
        setTimeout(initializeClarity, 500);
      });
    } else {
      setTimeout(initializeClarity, 1000);
    }

  }, [projectId, enable, accountName, displayName, email, sessionType, customTags]);

  // 设置 Clarity 用户识别信息的函数
  const setClarityUserIdentifier = () => {
    if (typeof window === 'undefined' || !window.clarity) {
      return;
    }

    try {
      // 设置用户ID - 使用账号名作为唯一标识
      if (accountName) {
        window.clarity?.('set', 'userId', accountName);
      }

      // 设置显示名称 - 使用displayName或accountName
      const displayUserName = displayName || accountName;
      if (displayUserName) {
        window.clarity?.('set', 'username', displayUserName);
      }

      // 设置会话类型
      if (sessionType) {
        window.clarity?.('set', 'sessionType', sessionType);
      }

      // 设置用户角色
      const userRole = sessionType === 'premium' ? 'premium' :
                      sessionType === 'registered' ? 'registered' : 'guest';
      window.clarity?.('set', 'userRole', userRole);

      // 设置自定义标签
      if (customTags) {
        Object.entries(customTags).forEach(([key, value]) => {
          window.clarity?.('set', key, value);
        });
      }

      // 如果有邮箱，可以设置（注意隐私保护）
      if (email) {
        // 对邮箱进行脱敏处理，只显示用户名部分
        const emailUser = email.split('@')[0];
        window.clarity?.('set', 'emailDomain', emailUser);
      }


    } catch (error) {
      console.error('[Clarity] Failed to set user identifier:', error);
    }
  };

  return null;
}