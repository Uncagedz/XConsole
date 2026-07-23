import type { AuthResponse } from '@drivecentric-ai/shared';

const AUTH_KEY = 'drivecentric_ai_extension_auth';
const API_BASE_URL_KEY = 'drivecentric_ai_api_base_url';
const RAW_DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const DEFAULT_API_BASE_URL: string = normalizeApiBaseUrlValue(RAW_DEFAULT_API_BASE_URL, '');

export type StoredAuth = AuthResponse;

export async function getAuth(): Promise<StoredAuth | null> {
  const result = await chrome.storage.local.get(AUTH_KEY);
  return (result[AUTH_KEY] as StoredAuth | undefined) ?? null;
}

export async function setAuth(auth: StoredAuth | null) {
  if (!auth) {
    await chrome.storage.local.remove(AUTH_KEY);
    return;
  }
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

export async function getApiBaseUrl() {
  const result = await chrome.storage.local.get(API_BASE_URL_KEY);
  const value = result[API_BASE_URL_KEY];
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_API_BASE_URL;

  const normalized = normalizeApiBaseUrlValue(value);
  if (isLocalhostUrl(normalized) && DEFAULT_API_BASE_URL && !isLocalhostUrl(DEFAULT_API_BASE_URL)) {
    await chrome.storage.local.remove(API_BASE_URL_KEY);
    return DEFAULT_API_BASE_URL;
  }

  if (normalized !== value.trim().replace(/\/+$/, '')) {
    await chrome.storage.local.set({ [API_BASE_URL_KEY]: normalized });
  }

  return normalized;
}

export async function requireApiBaseUrl() {
  const value = await getApiBaseUrl();
  if (!value) {
    throw new Error('Team server URL is required. Rebuild the extension with VITE_API_BASE_URL set to the Railway backend URL.');
  }
  return value;
}

function normalizeApiBaseUrl(url: string) {
  return normalizeApiBaseUrlValue(url);
}

function normalizeApiBaseUrlValue(url: string, emptyFallback?: string): string {
  const trimmed = url.trim();
  if (!trimmed) return emptyFallback ?? DEFAULT_API_BASE_URL;
  const isLocalDev = /^(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/.*)?$/i.test(trimmed);
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${isLocalDev ? 'http' : 'https'}://${trimmed}`;
  return new URL(withProtocol).toString().replace(/\/+$/, '');
}

function isLocalhostUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export async function setApiBaseUrl(url: string) {
  const normalized = normalizeApiBaseUrl(url);
  if (normalized) {
    await chrome.storage.local.set({ [API_BASE_URL_KEY]: normalized });
  } else {
    await chrome.storage.local.remove(API_BASE_URL_KEY);
  }
  await setAuth(null);
  return getApiBaseUrl();
}
