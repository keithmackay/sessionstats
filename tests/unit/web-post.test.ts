import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postSessionToWeb } from '../../src/lib/web-post.js';
import * as pluginConfigModule from '../../src/lib/plugin-config.js';
import type { SessionRow } from '../../src/types/index.js';

const sampleRow: SessionRow = {
  sessionId: 's1', project: 'ignored', event: 'END', timestamp: '2026-01-01T00:00:00Z',
  duration: '00:05:00', models: [], apiMessages: 1, userMessages: 1, toolCalls: 0,
  subagentCount: 0, cacheHitRate: 0, flags: null, machineId: 'u@h',
};

describe('postSessionToWeb', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('no-ops without making a request when apiKey is missing', async () => {
    vi.spyOn(pluginConfigModule, 'loadPluginConfig').mockReturnValue({
      websiteUrl: 'https://example.com', scanRoots: [], apiKey: null,
    });

    await postSessionToWeb(sampleRow, 'my-project', ['team-infra']);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no-ops without making a request when websiteUrl is missing', async () => {
    vi.spyOn(pluginConfigModule, 'loadPluginConfig').mockReturnValue({
      websiteUrl: null, scanRoots: [], apiKey: 'key123',
    });

    await postSessionToWeb(sampleRow, 'my-project', ['team-infra']);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the envelope shape to <websiteUrl>/api/sessions when both are configured', async () => {
    vi.spyOn(pluginConfigModule, 'loadPluginConfig').mockReturnValue({
      websiteUrl: 'https://example.com', scanRoots: [], apiKey: 'key123',
    });
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await postSessionToWeb(sampleRow, 'my-project', ['team-infra']);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ apiKey: 'key123', project: 'my-project', tags: ['team-infra'], sessions: [sampleRow] }),
      })
    );
  });

  it('does not throw when fetch rejects (network error)', async () => {
    vi.spyOn(pluginConfigModule, 'loadPluginConfig').mockReturnValue({
      websiteUrl: 'https://example.com', scanRoots: [], apiKey: 'key123',
    });
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(postSessionToWeb(sampleRow, 'my-project', [])).resolves.toBeUndefined();
  });

  it('does not throw on a non-2xx response', async () => {
    vi.spyOn(pluginConfigModule, 'loadPluginConfig').mockReturnValue({
      websiteUrl: 'https://example.com', scanRoots: [], apiKey: 'key123',
    });
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    await expect(postSessionToWeb(sampleRow, 'my-project', [])).resolves.toBeUndefined();
  });

  it('does not throw when loadPluginConfig itself throws', async () => {
    vi.spyOn(pluginConfigModule, 'loadPluginConfig').mockImplementation(() => {
      throw new Error('config file is corrupt');
    });

    await expect(postSessionToWeb(sampleRow, 'my-project', [])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
