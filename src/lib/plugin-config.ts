// ABOUTME: Reads/writes ~/.claude/sessionstats/config.json (plugin-level: websiteUrl, scanRoots)

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { PluginConfig } from '../types/index.js';

export function pluginConfigPath(): string {
  return path.join(os.homedir(), '.claude', 'sessionstats', 'config.json');
}

function defaults(): PluginConfig {
  return { websiteUrl: null, scanRoots: [path.join(os.homedir(), 'Projects')] };
}

export function loadPluginConfig(): PluginConfig {
  const configPath = pluginConfigPath();
  if (!fs.existsSync(configPath)) return defaults();
  return { ...defaults(), ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
}

export function writePluginConfig(config: PluginConfig): void {
  const configPath = pluginConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
