export interface SourceSiteItem {
  key: string;
  name: string;
  api: string;
}

export interface SourceCategoryItem {
  type_id: string | number;
  type_name: string;
}

export interface SourceVideoItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type_name: string;
  remarks: string;
}

export interface SourceVideoListMeta {
  page: number;
  pagecount: number;
  total: number;
  limit: number;
}

export interface SourceVideoListResult {
  items: SourceVideoItem[];
  meta: SourceVideoListMeta;
}

export const ADULT_DEFAULT_CATEGORY_NAME = 'AI短剧';

/** 选择默认分类：黄果模块优先命中「AI短剧」，否则回退首项 */
export function pickDefaultSourceCategory(
  categories: SourceCategoryItem[],
  isAdultModule: boolean,
): SourceCategoryItem | undefined {
  if (categories.length === 0) return undefined;
  if (isAdultModule) {
    const preferred = categories.find(
      (c) => c.type_name === ADULT_DEFAULT_CATEGORY_NAME,
    );
    if (preferred) return preferred;
  }
  return categories[0];
}
