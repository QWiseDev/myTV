interface CustomCategoryConfig {
  name: string;
  type: 'movie' | 'tv';
  query: string;
}

interface RuntimeConfig {
  STORAGE_TYPE?: string;
  FLUID_SEARCH?: boolean;
  CUSTOM_CATEGORIES?: CustomCategoryConfig[];
  DOUBAN_PROXY_TYPE?: string;
  DOUBAN_PROXY?: string;
  DOUBAN_IMAGE_PROXY_TYPE?: string;
  DOUBAN_IMAGE_PROXY?: string;
}

declare global {
  interface Window {
    RUNTIME_CONFIG?: RuntimeConfig;
  }
}

export {};
