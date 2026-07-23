import type { ExtensionRequest, ExtensionResponse } from '../shared/messages';
import {
  authStatus,
  generate,
  getConfig,
  inventorySearch as inventorySearchApi,
  login,
  logout,
  quotaStatus,
  rechargeCredits,
  recordFeedback,
  setConfig,
  syncXConsoleContext,
  transferCredits,
} from './api';
import { getFumbleQueue, resolveFumbleRisk, snoozeFumbleRisk, syncFumbleQueue } from './fumble-queue';
import { insertIntoActivePage, readAnyActivePage } from './page-reader';

chrome.runtime.onInstalled.addListener(() => {
  console.log('DriveCentric AI extension installed');
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionRequest | { type?: string }, _sender, sendResponse) => {
  if (message.type === 'MIC_TRANSCRIPT_UPDATE' || message.type === 'MIC_STATE' || message.type === 'MIC_ERROR' || message.type === 'MIC_LEVEL') return false;
  void handleMessage(message as ExtensionRequest)
    .then((data) => sendResponse({ ok: true, data } satisfies ExtensionResponse))
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Extension request failed',
      } satisfies ExtensionResponse),
    );
  return true;
});

async function handleMessage(message: ExtensionRequest) {
  if (message.type === 'AUTH_STATUS') return authStatus();
  if (message.type === 'USAGE_QUOTA') return quotaStatus();
  if (message.type === 'AUTH_LOGIN') return login(message.userId, message.password);
  if (message.type === 'AUTH_LOGOUT') return logout();
  if (message.type === 'AI_GENERATE') return generate(message.payload);
  if (message.type === 'AI_FEEDBACK') return recordFeedback(message.payload);
  if (message.type === 'BILLING_RECHARGE') return rechargeCredits(message.amountDollars);
  if (message.type === 'BILLING_TRANSFER') return transferCredits(message.targetUserId, message.amountDollars);
  if (message.type === 'INVENTORY_SEARCH') return inventorySearch(message.query, message.limit);
  if (message.type === 'READ_PAGE') {
    const page = await readAnyActivePage();
    const synchronized = await syncXConsoleContext(page).catch(() => undefined);
    return synchronized?.suggestions?.length ? { ...page, xconsoleSuggestions: synchronized.suggestions } : page;
  }
  if (message.type === 'INSERT_INTO_PAGE') return insertIntoActivePage(message.text);
  if (message.type === 'MIC_START') return startMicCapture();
  if (message.type === 'MIC_STOP') return stopMicCapture();
  if (message.type === 'MIC_WINDOW_OPEN') return openMicWindow();
  if (message.type === 'FUMBLE_QUEUE_GET') return getFumbleQueue();
  if (message.type === 'FUMBLE_QUEUE_SYNC') return syncFumbleQueue(message.page);
  if (message.type === 'FUMBLE_QUEUE_RESOLVE') return resolveFumbleRisk(message.conversationId);
  if (message.type === 'FUMBLE_QUEUE_SNOOZE') return snoozeFumbleRisk(message.conversationId, message.minutes);
  if (message.type === 'CONFIG_GET') return getConfig();
  if (message.type === 'CONFIG_SET') return setConfig(message.apiBaseUrl);
  throw new Error('Unknown extension message');
}

async function inventorySearch(query: string, limit?: number) {
  const max = limit ?? 9;
  return inventorySearchApi(query, max);
}

async function ensureOffscreenMicDocument() {
  const offscreen = chrome.offscreen as
    | undefined
    | {
        createDocument: (options: { url: string; reasons: string[]; justification: string }) => Promise<void>;
        closeDocument?: () => Promise<void>;
      };
  if (!offscreen?.createDocument) throw new Error('Mic capture is not available in this browser extension context.');

  const runtimeWithContexts = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (options: { contextTypes: string[]; documentUrls?: string[] }) => Promise<Array<unknown>>;
  };
  const url = chrome.runtime.getURL('offscreen.html');
  if (runtimeWithContexts.getContexts) {
    const existingContexts = await runtimeWithContexts.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [url],
    });
    if (existingContexts.length) return;
  }

  try {
    await offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capture salesperson dictation for the live deal context box.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Only a single offscreen document|already exists/i.test(message)) throw error;
  }
}

async function startMicCapture() {
  await ensureOffscreenMicDocument();
  const response = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_MIC_START' });
  return { started: Boolean(response?.started) };
}

async function stopMicCapture() {
  await ensureOffscreenMicDocument();
  const response = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_MIC_STOP' });
  return { stopped: true, transcript: String(response?.transcript ?? '') };
}

async function openMicWindow() {
  await chrome.windows.create({
    url: chrome.runtime.getURL('mic.html'),
    type: 'popup',
    width: 430,
    height: 520,
    focused: true,
  });
  return { opened: true };
}
