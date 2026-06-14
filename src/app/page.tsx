import { headers } from 'next/headers';

import { getServerHomeData } from '@/lib/home-data.server';
import { EMPTY_HOME_DATA } from '@/lib/home-data-types';

import HomeClient from '@/components/HomeClient';

export const dynamic = 'force-dynamic';

async function loadInitialHomeData() {
  try {
    const headerList = headers();
    if (!headerList.get('cookie')) {
      return EMPTY_HOME_DATA;
    }

    return await getServerHomeData();
  } catch (error) {
    console.error('首页首屏数据预取失败:', error);
    return EMPTY_HOME_DATA;
  }
}

export default async function Home() {
  const initialHomeData = await loadInitialHomeData();

  return <HomeClient initialHomeData={initialHomeData} />;
}
