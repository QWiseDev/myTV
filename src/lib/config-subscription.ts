const CONFIG_SUBSCRIPTION_USER_AGENT = 'LunaTV-ConfigFetcher/1.0';

export const CONFIG_SUBSCRIPTION_TIMEOUT_MS = 100000;

export class ConfigSubscriptionFetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ConfigSubscriptionFetchError';
  }
}

export async function decodeConfigSubscriptionContent(
  content: string,
): Promise<string> {
  const bs58 = (await import('bs58')).default;
  const decodedBytes = bs58.decode(content);
  return new TextDecoder().decode(decodedBytes);
}

export async function fetchDecodedConfigSubscription(
  url: string,
  timeoutMs = CONFIG_SUBSCRIPTION_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': CONFIG_SUBSCRIPTION_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new ConfigSubscriptionFetchError(
        `请求失败: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    const configContent = await response.text();
    return await decodeConfigSubscriptionContent(configContent);
  } finally {
    clearTimeout(timeoutId);
  }
}
