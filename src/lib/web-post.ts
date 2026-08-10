// ABOUTME: Posts a completed session's data to the configured sessionstats-web endpoint
// ABOUTME: No-ops silently if apiKey/websiteUrl aren't configured; never throws on network/HTTP failure

import { loadPluginConfig } from './plugin-config.js';
import type { SessionRow } from '../types/index.js';

const TIMEOUT_MS = 5000;

export async function postSessionToWeb(row: SessionRow, project: string, tags: string[]): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const config = loadPluginConfig();
    if (!config.apiKey || !config.websiteUrl) return;

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${config.websiteUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: config.apiKey, project, tags, sessions: [row] }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[sessionstats] Web post failed: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('[sessionstats] Web post failed:', error);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
