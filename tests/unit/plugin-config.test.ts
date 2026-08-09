import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadPluginConfig, writePluginConfig, pluginConfigPath } from '../../src/lib/plugin-config.js';

describe('plugin-config', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-home-'));
    vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('returns defaults when no config exists', () => {
    const config = loadPluginConfig();
    expect(config.websiteUrl).toBeNull();
    expect(config.scanRoots).toEqual([path.join(homeDir, 'Projects')]);
  });

  it('writes and reads back websiteUrl', () => {
    writePluginConfig({ websiteUrl: 'https://example.com/api/sessions', scanRoots: [path.join(homeDir, 'Projects')] });
    const config = loadPluginConfig();
    expect(config.websiteUrl).toBe('https://example.com/api/sessions');
  });
});
