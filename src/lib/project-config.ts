// ABOUTME: Reads/creates .sessionstats/config.json (per-project config) and manages .gitignore entry
// ABOUTME: git config user.email lookup falls back gracefully to null if git is unavailable

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { ProjectConfig } from '../types/index.js';

const SCHEMA_VERSION = 1;

export function projectConfigPath(projectDir: string): string {
  return path.join(projectDir, '.sessionstats', 'config.json');
}

function gitEmail(projectDir: string): string | null {
  try {
    return execSync('git config user.email', {
      cwd: projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

export function loadOrCreateProjectConfig(projectDir: string): ProjectConfig {
  const configPath = projectConfigPath(projectDir);
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  const config: ProjectConfig = {
    schemaVersion: SCHEMA_VERSION,
    projectName: path.basename(projectDir),
    tags: [],
    userEmail: gitEmail(projectDir),
    postToWeb: false,
    needsSetupConfirmation: true,
  };
  writeProjectConfig(projectDir, config);
  return config;
}

export function writeProjectConfig(projectDir: string, config: ProjectConfig): void {
  const configPath = projectConfigPath(projectDir);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function ensureGitignoreEntry(projectDir: string): void {
  const gitignorePath = path.join(projectDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return;

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  if (content.includes('.sessionstats/')) return;

  const needsNewline = content.length > 0 && !content.endsWith('\n');
  fs.appendFileSync(gitignorePath, `${needsNewline ? '\n' : ''}.sessionstats/\n`);
}
