#!/usr/bin/env node
// ABOUTME: One-time, throwaway migration of legacy root-level session_stats.md CSVs into .sessionstats/
// ABOUTME: Dry-run by default; pass --yes to actually write/delete. Not part of the sessionstats plugin runtime.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const ROOT = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1])
  || path.join(os.homedir(), 'Projects');
const CONFIRM = process.argv.includes('--yes');

const CSV_HEADER_PREFIX = 'session_id,';

function log(msg) {
  console.log(msg);
}

function getMachineId() {
  let username;
  try {
    username = os.userInfo().username;
  } catch {
    username = process.env.USER || process.env.USERNAME || 'unknown';
  }
  return `${username}@${os.hostname()}`;
}

function gitEmail(dir) {
  try {
    return execSync('git config user.email', { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function parseLegacyCsv(content) {
  const lines = content.split('\n');
  const headerIndex = lines.findIndex(l => l.startsWith(CSV_HEADER_PREFIX));
  if (headerIndex === -1) return [];

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('#')) continue;
    const parts = line.split(',');
    if (parts.length < 10) continue;

    const [sessionId, project, event, timestamp, model, duration, , cost, tokens, flags, machineId] = parts;

    rows.push({
      sessionId,
      project,
      event,
      timestamp,
      duration: duration || null,
      models: model ? [{
        model,
        input: null,
        output: null,
        cacheRead: null,
        cacheWrite: null,
        cost: cost !== '' ? parseFloat(cost) : null,
      }] : [],
      apiMessages: null,
      userMessages: null,
      toolCalls: null,
      subagentCount: null,
      cacheHitRate: null,
      flags: [flags || null, '[Migrated]'].filter(Boolean).join(' '),
      machineId: machineId || null,
    });
  }
  return rows;
}

function migrateProject(projectDir) {
  const csvPath = path.join(projectDir, 'session_stats.md');
  const sessionstatsDir = path.join(projectDir, '.sessionstats');
  const configPath = path.join(sessionstatsDir, 'config.json');
  const jsonPath = path.join(sessionstatsDir, 'session_stats.json');
  const projectName = path.basename(projectDir);

  if (!fs.existsSync(csvPath)) return null;

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseLegacyCsv(csvContent);

  const configExists = fs.existsSync(configPath);
  const jsonExists = fs.existsSync(jsonPath);

  const plan = {
    projectDir,
    projectName,
    rowCount: rows.length,
    willWriteConfig: !configExists,
    willWriteJson: !jsonExists,
    willDeleteCsv: !jsonExists,
  };

  if (!CONFIRM) return plan;

  if (!configExists) {
    const config = {
      schemaVersion: 1,
      projectName,
      tags: [],
      userEmail: gitEmail(projectDir),
      postToWeb: false,
    };
    fs.mkdirSync(sessionstatsDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  if (!jsonExists) {
    fs.mkdirSync(sessionstatsDir, { recursive: true });
    const statsFile = { schemaVersion: 1, rows };
    fs.writeFileSync(jsonPath, JSON.stringify(statsFile, null, 2) + '\n', 'utf-8');

    // Verify the write is readable back before deleting the original.
    const readBack = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    if (!Array.isArray(readBack.rows) || readBack.rows.length !== rows.length) {
      throw new Error(`Readback verification failed for ${jsonPath}`);
    }

    // Only delete the source CSV once its data has actually been migrated into the JSON above.
    // If .sessionstats/session_stats.json already existed (e.g. a live hook wrote it after
    // this plugin was installed but before this script ran), deleting the CSV here would
    // silently discard its history instead of migrating it — leave it in place instead.
    fs.unlinkSync(csvPath);
  }

  return plan;
}

function main() {
  if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
    console.error(`Not a directory: ${ROOT}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => path.join(ROOT, e.name));

  const plans = [];
  for (const dir of entries) {
    const plan = migrateProject(dir);
    if (plan) plans.push(plan);
  }

  log(`${CONFIRM ? 'Migrated' : 'Would migrate'} ${plans.length} project(s) under ${ROOT}:\n`);
  for (const p of plans) {
    log(`  ${p.projectName}`);
    log(`    rows: ${p.rowCount}`);
    log(`    config.json: ${p.willWriteConfig ? 'create (defaults)' : 'skip (already exists)'}`);
    log(`    session_stats.json: ${p.willWriteJson ? 'create' : 'skip (already exists)'}`);
    log(`    session_stats.md: delete`);
  }

  if (!CONFIRM) {
    log('\nDry run — no files were changed. Re-run with --yes to apply.');
  } else {
    log('\nDone.');
  }
}

main();
