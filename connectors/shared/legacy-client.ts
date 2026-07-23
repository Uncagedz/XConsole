export interface LegacyClientConfig {
  legacyApiBaseUrl: string;
  legacyAuthorization?: string;
}

export async function legacyJson<T>(
  config: LegacyClientConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  if (config.legacyAuthorization) headers.set('authorization', config.legacyAuthorization);
  const response = await fetch(`${config.legacyApiBaseUrl.replace(/\/+$/, '')}${path}`, {
    ...init,
    headers,
    signal: init.signal,
  });
  if (!response.ok) {
    throw new Error(`Legacy XConsole adapter returned HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}
