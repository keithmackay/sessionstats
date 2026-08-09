#!/usr/bin/env node

// src/hooks/session-start.ts
import { stdin } from "process";
import path3 from "path";

// src/lib/stats-writer.ts
import fs2 from "fs";
import path from "path";
import os from "os";

// src/lib/stats-parser.ts
import fs from "fs";
var SCHEMA_VERSION = 1;
function parseStatsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { schemaVersion: SCHEMA_VERSION, totals: createEmptyTotals(), rows: [] };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const rows = raw.rows ?? [];
  return { schemaVersion: raw.schemaVersion ?? SCHEMA_VERSION, totals: computeTotals(rows), rows };
}
function createEmptyTotals() {
  return { sessions: 0, totalDuration: "00:00:00", totalCost: 0, totalTokens: 0 };
}
function rowCost(row) {
  return row.models.reduce((sum, m) => sum + (m.cost ?? 0), 0);
}
function rowTokens(row) {
  return row.models.reduce((sum, m) => sum + (m.input ?? 0) + (m.output ?? 0) + (m.cacheRead ?? 0) + (m.cacheWrite ?? 0), 0);
}
function computeTotals(rows) {
  const endRows = rows.filter((r) => r.event === "END");
  let totalDurationMs = 0;
  let totalCost = 0;
  let totalTokens = 0;
  for (const row of endRows) {
    if (row.duration) totalDurationMs += parseTimeToMs(row.duration);
    totalCost += rowCost(row);
    totalTokens += rowTokens(row);
  }
  return { sessions: endRows.length, totalDuration: formatMsToTime(totalDurationMs), totalCost, totalTokens };
}
function parseTimeToMs(time) {
  const parts = time.split(":").map(Number);
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1e3;
  return 0;
}
function formatMsToTime(ms) {
  const totalSeconds = Math.floor(ms / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// src/lib/stats-writer.ts
function getMachineId() {
  let username;
  try {
    username = os.userInfo().username;
  } catch {
    username = process.env.USER || process.env.USERNAME || "unknown";
  }
  return `${username}@${os.hostname()}`;
}
function writeStatsFile(filePath, rows) {
  const content = JSON.stringify({ schemaVersion: SCHEMA_VERSION, rows }, null, 2) + "\n";
  const dir = path.dirname(filePath);
  if (!fs2.existsSync(dir)) fs2.mkdirSync(dir, { recursive: true });
  fs2.writeFileSync(filePath, content, "utf-8");
}
function appendRow(filePath, row) {
  const stats = parseStatsFile(filePath);
  stats.rows.push(row);
  writeStatsFile(filePath, stats.rows);
}

// src/lib/formatters.ts
function formatMsToTime2(ms) {
  const totalSeconds = Math.floor(ms / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
function calculateDuration(startISO, endISO) {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  const durationMs = Math.max(0, endMs - startMs);
  return formatMsToTime2(durationMs);
}

// src/lib/orphan-detector.ts
function detectAndCloseOrphans(filePath) {
  const stats = parseStatsFile(filePath);
  const closedOrphans = [];
  const sessionIds = new Set(stats.rows.map((r) => r.sessionId));
  for (const sessionId of sessionIds) {
    const sessionRows = stats.rows.filter((r) => r.sessionId === sessionId);
    const hasStart = sessionRows.some((r) => r.event === "START");
    const hasEnd = sessionRows.some((r) => r.event === "END");
    if (hasStart && !hasEnd) {
      const startRow = sessionRows.find((r) => r.event === "START");
      const endRow = {
        sessionId,
        project: startRow.project,
        event: "END",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        duration: calculateDuration(startRow.timestamp, (/* @__PURE__ */ new Date()).toISOString()),
        models: [],
        apiMessages: null,
        userMessages: null,
        toolCalls: null,
        subagentCount: null,
        cacheHitRate: null,
        flags: "[Abnormal End]",
        machineId: startRow.machineId || getMachineId()
      };
      appendRow(filePath, endRow);
      closedOrphans.push(endRow);
    }
  }
  return closedOrphans;
}

// src/lib/project-config.ts
import fs3 from "fs";
import path2 from "path";
import { execSync } from "child_process";
var SCHEMA_VERSION2 = 1;
function projectConfigPath(projectDir) {
  return path2.join(projectDir, ".sessionstats", "config.json");
}
function gitEmail(projectDir) {
  try {
    return execSync("git config user.email", {
      cwd: projectDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"]
    }).trim() || null;
  } catch {
    return null;
  }
}
function loadOrCreateProjectConfig(projectDir) {
  const configPath = projectConfigPath(projectDir);
  if (fs3.existsSync(configPath)) {
    return JSON.parse(fs3.readFileSync(configPath, "utf-8"));
  }
  const config = {
    schemaVersion: SCHEMA_VERSION2,
    projectName: path2.basename(projectDir),
    tags: [],
    userEmail: gitEmail(projectDir),
    postToWeb: false,
    needsSetupConfirmation: true
  };
  writeProjectConfig(projectDir, config);
  return config;
}
function writeProjectConfig(projectDir, config) {
  const configPath = projectConfigPath(projectDir);
  fs3.mkdirSync(path2.dirname(configPath), { recursive: true });
  fs3.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
function ensureGitignoreEntry(projectDir) {
  const gitignorePath = path2.join(projectDir, ".gitignore");
  if (!fs3.existsSync(gitignorePath)) return;
  const content = fs3.readFileSync(gitignorePath, "utf-8");
  if (content.includes(".sessionstats/")) return;
  const needsNewline = content.length > 0 && !content.endsWith("\n");
  fs3.appendFileSync(gitignorePath, `${needsNewline ? "\n" : ""}.sessionstats/
`);
}

// src/hooks/session-start.ts
async function sessionStartHook(input) {
  const statsPath = path3.join(input.cwd, ".sessionstats", "session_stats.json");
  const projectName = path3.basename(input.cwd);
  const config = loadOrCreateProjectConfig(input.cwd);
  ensureGitignoreEntry(input.cwd);
  try {
    const closedOrphans = detectAndCloseOrphans(statsPath);
    if (closedOrphans.length > 0) {
      console.error(`[sessionstats] Closed ${closedOrphans.length} orphaned session(s)`);
    }
  } catch (error) {
    console.error("[sessionstats] Error detecting orphans:", error);
  }
  const startRow = {
    sessionId: input.session_id,
    project: projectName,
    event: "START",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    duration: null,
    models: [],
    apiMessages: null,
    userMessages: null,
    toolCalls: null,
    subagentCount: null,
    cacheHitRate: null,
    flags: null,
    machineId: getMachineId()
  };
  try {
    appendRow(statsPath, startRow);
  } catch (error) {
    console.error("[sessionstats] Error recording session start:", error);
  }
  const output = { continue: true, suppressOutput: !config.needsSetupConfirmation };
  if (config.needsSetupConfirmation) {
    console.error(
      "[sessionstats] This project has not confirmed its .sessionstats/config.json yet. Please interactively confirm/adjust projectName, tags, userEmail, and postToWeb with the user now (same flow as /session_setup), then clear needsSetupConfirmation in .sessionstats/config.json."
    );
  }
  console.log(JSON.stringify(output));
}
var inputData = "";
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
  inputData += chunk;
});
stdin.on("end", async () => {
  try {
    const parsed = JSON.parse(inputData);
    await sessionStartHook(parsed);
  } catch (error) {
    console.error("[sessionstats] Hook error:", error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
