'use client';

import { useEffect } from 'react';

import { analytics } from '@/lib/analytics';
import { useErrorMonitoring, usePagePerformance } from '@/hooks/useAnalytics';

interface ClarityTrackerProps {
  projectId?: string;
  enable?: boolean;
}

export function ClarityTracker({
  projectId = 'u6fla6fy8x',
  enable = true,
}: ClarityTrackerProps) {
  // 全局 JS 错误 / Promise 拒绝监控（依赖 analytics 队列，Clarity 未就绪也不丢）
  useErrorMonitoring();
  // 页面加载耗时
  usePagePerformance();

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
          // 如果 Clarity 已经存在，初始化我们的 Analytics
          analytics.init();
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

        // 等待 Clarity 初始化完成，然后初始化我们的 Analytics
        const initAnalytics = () => {
          if (window.clarity) {
            analytics.init();
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
  }, [projectId, enable]);

  return null;
}
