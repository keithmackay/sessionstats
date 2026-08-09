import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadOrCreateProjectConfig, ensureGitignoreEntry } from '../../src/lib/project-config.js';

describe('project-config', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionstats-proj-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('creates config with defaults and needsSetupConfirmation when missing', () => {
    const config = loadOrCreateProjectConfig(projectDir);
    expect(config.projectName).toBe(path.basename(projectDir));
    expect(config.tags).toEqual([]);
    expect(config.postToWeb).toBe(false);
    expect(config.needsSetupConfirmation).toBe(true);
  });

  it('returns the existing config unchanged on second call', () => {
    loadOrCreateProjectConfig(projectDir);
    const configPath = path.join(projectDir, '.sessionstats', 'config.json');
    const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    onDisk.tags = ['team-infra'];
    onDisk.needsSetupConfirmation = false;
    fs.writeFileSync(configPath, JSON.stringify(onDisk));

    const config = loadOrCreateProjectConfig(projectDir);
    expect(config.tags).toEqual(['team-infra']);
    expect(config.needsSetupConfirmation).toBe(false);
  });

  it('appends .sessionstats/ to an existing .gitignore', () => {
    fs.writeFileSync(path.join(projectDir, '.gitignore'), 'node_modules/\n');
    ensureGitignoreEntry(projectDir);
    const content = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.sessionstats/');
  });

  it('does not create a .gitignore if none exists', () => {
    ensureGitignoreEntry(projectDir);
    expect(fs.existsSync(path.join(projectDir, '.gitignore'))).toBe(false);
  });

  it('does not duplicate the entry on repeated calls', () => {
    fs.writeFileSync(path.join(projectDir, '.gitignore'), 'node_modules/\n');
    ensureGitignoreEntry(projectDir);
    ensureGitignoreEntry(projectDir);
    const content = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
    expect(content.match(/\.sessionstats\//g)?.length).toBe(1);
  });
});
