'use client';

import type { ThemeProviderProps } from 'next-themes';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import * as React from 'react';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute='class'
      // 全站写死暗色系：忽略系统偏好与 localStorage 中的历史选择
      forcedTheme='dark'
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
