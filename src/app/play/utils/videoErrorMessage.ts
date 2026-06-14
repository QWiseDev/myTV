const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

export function getVideoErrorMessage(error: MediaError): string {
  switch (error.code) {
    case MEDIA_ERR_ABORTED:
      return '视频播放被中止';
    case MEDIA_ERR_NETWORK:
      return `网络错误 - ${error.message || '下载视频时网络发生错误'}`;
    case MEDIA_ERR_DECODE:
      return '视频解码错误 - 视频文件损坏或不兼容';
    case MEDIA_ERR_SRC_NOT_SUPPORTED:
      return '视频格式不支持或地址无效';
    default:
      return `未知错误 (代码: ${error.code})`;
  }
}
