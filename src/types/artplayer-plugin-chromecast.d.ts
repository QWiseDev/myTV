/* eslint-disable @typescript-eslint/no-explicit-any -- 第三方插件手工类型声明，any 仅作类型占位，不影响运行时 */

declare module '@/lib/artplayer-plugin-chromecast' {
  interface ChromecastPluginOptions {
    icon?: string;
    sdk?: string;
    url?: string;
    mimeType?: string;
    onStateChange?: (
      state: 'connected' | 'connecting' | 'disconnected' | 'disconnecting'
    ) => void;
    onCastAvailable?: (available: boolean) => void;
    onCastStart?: () => void;
    onError?: (error: Error) => void;
  }

  interface ChromecastPlugin {
    name: 'artplayerPluginChromecast';
    getCastState: () => any;
    isCasting: () => boolean;
  }

  function artplayerPluginChromecast(
    options?: ChromecastPluginOptions
  ): (art: any) => Promise<ChromecastPlugin>;
  export default artplayerPluginChromecast;
}
