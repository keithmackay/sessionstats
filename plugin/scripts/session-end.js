#!/usr/bin/env node

// src/hooks/session-end.ts
import { stdin } from "process";
import path5 from "path";

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
function findStartRow(filePath, sessionId) {
  const stats = parseStatsFile(filePath);
  const startRows = stats.rows.filter((r) => r.sessionId === sessionId && r.event === "START");
  return startRows[startRows.length - 1] || null;
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
import fs2 from "fs";
import path from "path";
import os from "os";
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

// src/lib/token-engine.ts
import fs3 from "fs";
import path2 from "path";

// src/lib/pricing.ts
var PRICING = {
  "claude-opus-4-5-20251101": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-6": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 }
};
var DEFAULT_PRICING = { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 };
function getPricing(model) {
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (model.includes(key) || key.includes(model)) return pricing;
  }
  return DEFAULT_PRICING;
}
function costForUsage(usage, model) {
  const pricing = getPricing(model);
  const perM = 1e6;
  return usage.input_tokens / perM * pricing.input + usage.output_tokens / perM * pricing.output + usage.cache_read_input_tokens / perM * pricing.cacheRead + usage.cache_creation_input_tokens / perM * pricing.cacheWrite;
}

// src/lib/token-engine.ts
function parseTranscript(content) {
  const byModel = /* @__PURE__ */ new Map();
  let apiMessages = 0;
  let userMessages = 0;
  let toolCalls = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (entry.type === "user") {
      userMessages++;
      continue;
    }
    if (entry.type !== "assistant") continue;
    const msg = entry.message ?? {};
    const usage = msg.usage;
    const model = msg.model ?? "unknown";
    if (usage) {
      apiMessages++;
      const cost = costForUsage(
        {
          input_tokens: usage.input_tokens ?? 0,
          output_tokens: usage.output_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0
        },
        model
      );
      const entryStats = byModel.get(model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      entryStats.input += usage.input_tokens ?? 0;
      entryStats.output += usage.output_tokens ?? 0;
      entryStats.cacheRead += usage.cache_read_input_tokens ?? 0;
      entryStats.cacheWrite += usage.cache_creation_input_tokens ?? 0;
      entryStats.cost += cost;
      byModel.set(model, entryStats);
    }
    const content_ = msg.content;
    if (Array.isArray(content_)) {
      for (const block of content_) {
        if (block && typeof block === "object" && block.type === "tool_use") toolCalls++;
      }
    }
  }
  const models = Array.from(byModel.entries()).map(([model, v]) => ({
    model,
    input: v.input,
    output: v.output,
    cacheRead: v.cacheRead,
    cacheWrite: v.cacheWrite,
    cost: v.cost
  }));
  const totalInput = models.reduce((s, m) => s + (m.input ?? 0), 0);
  const totalCacheRead = models.reduce((s, m) => s + (m.cacheRead ?? 0), 0);
  const totalCacheWrite = models.reduce((s, m) => s + (m.cacheWrite ?? 0), 0);
  const totalAllInput = totalInput + totalCacheRead + totalCacheWrite;
  const cacheHitRate = totalAllInput > 0 ? totalCacheRead / totalAllInput : 0;
  return { models, apiMessages, userMessages, toolCalls, cacheHitRate };
}
function mergeStats(a, b) {
  const byModel = /* @__PURE__ */ new Map();
  for (const stats of [a, b]) {
    for (const m of stats.models) {
      const entry = byModel.get(m.model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      entry.input += m.input ?? 0;
      entry.output += m.output ?? 0;
      entry.cacheRead += m.cacheRead ?? 0;
      entry.cacheWrite += m.cacheWrite ?? 0;
      entry.cost += m.cost ?? 0;
      byModel.set(m.model, entry);
    }
  }
  const models = Array.from(byModel.entries()).map(([model, v]) => ({ model, ...v }));
  const totalInput = models.reduce((s, m) => s + m.input, 0);
  const totalCacheRead = models.reduce((s, m) => s + m.cacheRead, 0);
  const totalCacheWrite = models.reduce((s, m) => s + m.cacheWrite, 0);
  const totalAllInput = totalInput + totalCacheRead + totalCacheWrite;
  return {
    models,
    apiMessages: a.apiMessages + b.apiMessages,
    userMessages: a.userMessages + b.userMessages,
    toolCalls: a.toolCalls + b.toolCalls,
    cacheHitRate: totalAllInput > 0 ? totalCacheRead / totalAllInput : 0
  };
}
function parseSessionTranscript(transcriptPath) {
  const content = fs3.readFileSync(transcriptPath, "utf-8");
  let stats = parseTranscript(content);
  const sessionId = path2.basename(transcriptPath, ".jsonl");
  const subagentDir = path2.join(path2.dirname(transcriptPath), sessionId, "subagents");
  let subagentCount = 0;
  if (fs3.existsSync(subagentDir)) {
    const files = fs3.readdirSync(subagentDir).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      subagentCount++;
      const subContent = fs3.readFileSync(path2.join(subagentDir, file), "utf-8");
      stats = mergeStats(stats, parseTranscript(subContent));
    }
  }
  return { ...stats, subagentCount };
}

// src/lib/project-config.ts
import fs4 from "fs";
import path3 from "path";
import { execSync } from "child_process";
var SCHEMA_VERSION2 = 1;
function projectConfigPath(projectDir) {
  return path3.join(projectDir, ".sessionstats", "config.json");
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
  if (fs4.existsSync(configPath)) {
    return JSON.parse(fs4.readFileSync(configPath, "utf-8"));
  }
  const config = {
    schemaVersion: SCHEMA_VERSION2,
    projectName: path3.basename(projectDir),
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
  fs4.mkdirSync(path3.dirname(configPath), { recursive: true });
  fs4.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// src/lib/plugin-config.ts
import fs5 from "fs";
import path4 from "path";
import os2 from "os";
function pluginConfigPath() {
  return path4.join(os2.homedir(), ".claude", "sessionstats", "config.json");
}
function defaults() {
  return { websiteUrl: null, scanRoots: [path4.join(os2.homedir(), "Projects")], apiKey: null };
}
function loadPluginConfig() {
  const configPath = pluginConfigPath();
  if (!fs5.existsSync(configPath)) return defaults();
  return { ...defaults(), ...JSON.parse(fs5.readFileSync(configPath, "utf-8")) };
}

// src/lib/web-post.ts
var TIMEOUT_MS = 5e3;
async function postSessionToWeb(row, project, tags) {
  let timeout;
  try {
    const config = loadPluginConfig();
    if (!config.apiKey || !config.websiteUrl) return;
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(`${config.websiteUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: config.apiKey, project, tags, sessions: [row] }),
      signal: controller.signal
    });
    if (!response.ok) {
      console.error(`[sessionstats] Web post failed: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error("[sessionstats] Web post failed:", error);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// src/hooks/session-end.ts
async function sessionEndHook(input) {
  const statsPath = path5.join(input.cwd, ".sessionstats", "session_stats.json");
  const projectName = path5.basename(input.cwd);
  const endTime = (/* @__PURE__ */ new Date()).toISOString();
  const startRow = findStartRow(statsPath, input.session_id);
  const config = loadOrCreateProjectConfig(input.cwd);
  let transcriptStats;
  try {
    transcriptStats = parseSessionTranscript(input.transcript_path);
  } catch (error) {
    console.error("[sessionstats] Could not read transcript (this is OK):", error);
    transcriptStats = { models: [], apiMessages: 0, userMessages: 0, toolCalls: 0, cacheHitRate: 0, subagentCount: 0 };
  }
  const duration = startRow ? calculateDuration(startRow.timestamp, endTime) : null;
  const endRow = {
    sessionId: input.session_id,
    project: projectName,
    event: "END",
    timestamp: endTime,
    duration,
    models: transcriptStats.models,
    apiMessages: transcriptStats.apiMessages,
    userMessages: transcriptStats.userMessages,
    toolCalls: transcriptStats.toolCalls,
    subagentCount: transcriptStats.subagentCount,
    cacheHitRate: transcriptStats.cacheHitRate,
    flags: startRow ? null : "[No Start Found]",
    machineId: getMachineId()
  };
  try {
    appendRow(statsPath, endRow);
  } catch (error) {
    console.error("[sessionstats] Error recording session end:", error);
  }
  if (config.postToWeb) {
    await postSessionToWeb(endRow, projectName, config.tags);
  }
  const output = { continue: true, suppressOutput: true };
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
    await sessionEndHook(parsed);
  } catch (error) {
    console.error("[sessionstats] Hook error:", error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
