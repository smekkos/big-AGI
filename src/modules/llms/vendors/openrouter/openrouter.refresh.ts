import { llmsStoreState } from '~/common/stores/llms/store-llms';
import { getLabsAutoRefreshOpenRouter } from '~/common/stores/store-ux-labs';

import { llmsUpdateModelsForServiceOrThrow } from '../../llm.client';


// configuration
const STORAGE_KEY = 'or-models-last-fetch';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const OR_VENDOR_ID = 'openrouter' as const;


function _readLastFetch(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function _writeLastFetch(now: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}


/**
 * Opportunistic auto-refresh of the OpenRouter model list.
 *
 * Why this exists:
 * The global reconfiguration flow (`reconfigureBackendModels`) is gated by
 * `hashLlmReconfig`, which only changes on backend deploys / env edits.
 * In steady-state production a browser therefore never sees new OpenRouter
 * models until the user clicks Models -> Refresh manually.
 *
 * This function runs once per browser per 24h (TTL) and re-fetches the OR
 * model list with `keepUserEdits: true`, preserving any user customizations.
 *
 * Scope: OpenRouter only (per product decision - other vendors' catalogs
 * change less frequently and re-rebasing surface is kept minimal).
 *
 * Opt-out: the UX Labs setting `labsAutoRefreshOpenRouter` (default true).
 */
export async function maybeRefreshOpenRouterModels(): Promise<void> {
  // SSR guard
  if (typeof window === 'undefined') return;

  // user opt-out
  if (!getLabsAutoRefreshOpenRouter()) return;

  // TTL gate
  const now = Date.now();
  if (now - _readLastFetch() < TTL_MS) return;

  // find the OpenRouter service, if any is configured
  const orService = llmsStoreState().sources.find(s => s.vId === OR_VENDOR_ID);
  if (!orService) {
    // no OR service configured; mark as "checked" so we don't keep looking each boot
    _writeLastFetch(now);
    return;
  }

  // refresh; keepUserEdits preserves user customizations (rename/hide/star/etc.)
  try {
    await llmsUpdateModelsForServiceOrThrow(orService.id, true);
    _writeLastFetch(now);
  } catch (err) {
    // do NOT update the timestamp on failure so the next boot retries
    console.warn('[OR] auto-refresh failed:', err);
  }
}
