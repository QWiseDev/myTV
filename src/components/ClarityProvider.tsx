'use client';

import { createContext, ReactNode,useContext, useEffect, useState } from 'react';

import { ClarityTracker } from './ClarityTracker';

interface UserInfo {
  accountName?: string;    // 账号名（用作userId）
  displayName?: string;    // 显示名称
  email?: string;
  sessionType?: 'guest' | 'registered' | 'premium';
  customTags?: Record<string, string>;
}

interface ClarityContextType {
  user: UserInfo;
  updateUser: (userInfo: Partial<UserInfo>) => void;
  logout: () => void;
  identify: (userInfo: UserInfo) => void;
}

const ClarityContext = createContext<ClarityContextType | undefined>(undefined);

interface ClarityProviderProps {
  children: ReactNode;
  projectId?: string;
  enable?: boolean;
  initialUser?: UserInfo;
}

export function ClarityProvider({
  children,
  projectId,
  enable = true,
  initialUser = { sessionType: 'guest' }
}: ClarityProviderProps) {
  const [user, setUser] = useState<UserInfo>(initialUser);

  // 更新用户信息
  const updateUser = (userInfo: Partial<UserInfo>) => {
    setUser(prev => ({ ...prev, ...userInfo }));
  };

  // 完全设置用户身份（通常在登录时使用）
  const identify = (userInfo: UserInfo) => {
    setUser(userInfo);
  };

  // 登出用户
  const logout = () => {
    setUser({ sessionType: 'guest' });
  };

  // 从localStorage或用户管理系统获取用户信息的示例
  useEffect(() => {
    // 可以在这里从localStorage、cookies或用户认证系统获取用户信息
    const savedUserInfo = typeof window !== 'undefined' ? localStorage.getItem('clarity_user_info') : null;

    if (savedUserInfo) {
      try {
        const parsedUserInfo = JSON.parse(savedUserInfo);
        setUser(parsedUserInfo);
      } catch (error) {
        console.error('[Clarity] Failed to parse saved user info:', error);
      }
    }
  }, []);

  // 用户信息变化时保存到localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('clarity_user_info', JSON.stringify(user));
    }
  }, [user]);

  const contextValue: ClarityContextType = {
    user,
    updateUser,
    logout,
    identify
  };

  return (
    <ClarityContext.Provider value={contextValue}>
      <ClarityTracker
        projectId={projectId}
        enable={enable}
        accountName={user.accountName}
        displayName={user.displayName}
        email={user.email}
        sessionType={user.sessionType}
        customTags={user.customTags}
      />
      {children}
    </ClarityContext.Provider>
  );
}

// Hook for using Clarity context
export function useClarity() {
  const context = useContext(ClarityContext);
  if (context === undefined) {
    throw new Error('useClarity must be used within a ClarityProvider');
  }
  return context;
}

// 便捷的hook用于常见的用户操作
export function useClarityUser() {
  const { updateUser, identify, logout, user } = useClarity();

  // 用户登录
  const login = (userInfo: Omit<UserInfo, 'sessionType'> & { sessionType?: 'guest' | 'registered' | 'premium' }) => {
    const userData = {
      ...userInfo,
      sessionType: userInfo.sessionType || 'registered'
    };
    identify(userData);
  };

  // 用户升级为高级用户
  const upgradeToPremium = () => {
    updateUser({ sessionType: 'premium' });
  };

  // 添加自定义标签
  const addTag = (key: string, value: string) => {
    updateUser({
      customTags: {
        ...user.customTags,
        [key]: value
      }
    });
  };

  // 移除自定义标签
  const removeTag = (key: string) => {
    const newTags = { ...user.customTags };
    delete newTags[key];
    updateUser({ customTags: newTags });
  };

  return {
    user,
    login,
    logout,
    upgradeToPremium,
    addTag,
    removeTag,
    updateUser,
    identify
  };
}