/** 媒体加载超时：超时后判定当前源失败并尝试自动切换源（与换源探测超时同口径） */
export const MEDIA_LOADING_TIMEOUT_MS = 10000;

/** 慢源起播宽限时长：当前源已解析清单或正在下载分片时，额外给予一次宽限缓冲避免误杀 */
export const MEDIA_LOADING_GRACE_TIMEOUT_MS = 10000;

/** 外部弹幕延迟加载：等待弹幕插件完成初始化后再拉取弹幕数据 */
export const EXTERNAL_DANMU_LOAD_DELAY_MS = 1000;
