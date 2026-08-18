#!/usr/bin/env node

// src/lib/rebuild.ts
import fs3 from "fs";
import path4 from "path";

// src/lib/transcript-dir.ts
import path from "path";
import os from "os";
function getProjectTranscriptDir(projectDir2) {
  const encoded = projectDir2.replace(/[/.]/g, "-");
  return path.join(os.homedir(), ".claude", "projects", encoded);
}

// src/lib/token-engine.ts
import fs from "fs";
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
  const content = fs.readFileSync(transcriptPath, "utf-8");
  let stats = parseTranscript(content);
  const sessionId = path2.basename(transcriptPath, ".jsonl");
  const subagentDir = path2.join(path2.dirname(transcriptPath), sessionId, "subagents");
  let subagentCount = 0;
  if (fs.existsSync(subagentDir)) {
    const files = fs.readdirSync(subagentDir).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      subagentCount++;
      const subContent = fs.readFileSync(path2.join(subagentDir, file), "utf-8");
      stats = mergeStats(stats, parseTranscript(subContent));
    }
  }
  return { ...stats, subagentCount };
}

// src/lib/stats-parser.ts
var SCHEMA_VERSION = 1;

// src/lib/formatters.ts
function formatMsToTime(ms) {
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
  return formatMsToTime(durationMs);
}

// src/lib/stats-writer.ts
import fs2 from "fs";
import path3 from "path";
function writeStatsFile(filePath, rows2) {
  const content = JSON.stringify({ schemaVersion: SCHEMA_VERSION, rows: rows2 }, null, 2) + "\n";
  const dir = path3.dirname(filePath);
  if (!fs2.existsSync(dir)) fs2.mkdirSync(dir, { recursive: true });
  fs2.writeFileSync(filePath, content, "utf-8");
}

// src/lib/rebuild.ts
function firstAndLastTimestamps(content) {
  let first = null;
  let last = null;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof entry.timestamp !== "string" || !entry.timestamp) continue;
    if (!first) first = entry.timestamp;
    last = entry.timestamp;
  }
  return first && last ? { first, last } : null;
}
function rebuildSessionRows(projectDir2) {
  const transcriptDir2 = getProjectTranscriptDir(projectDir2);
  const projectName = path4.basename(projectDir2);
  if (!fs3.existsSync(transcriptDir2)) return [];
  const sessionFiles = fs3.readdirSync(transcriptDir2).filter((f) => f.endsWith(".jsonl")).map((f) => path4.join(transcriptDir2, f));
  const sessions = [];
  for (const filePath of sessionFiles) {
    const sessionId = path4.basename(filePath, ".jsonl");
    const content = fs3.readFileSync(filePath, "utf-8");
    const timestamps = firstAndLastTimestamps(content);
    if (!timestamps) continue;
    const { first, last } = timestamps;
    let transcriptStats;
    try {
      transcriptStats = parseSessionTranscript(filePath);
    } catch {
      transcriptStats = { models: [], apiMessages: 0, userMessages: 0, toolCalls: 0, cacheHitRate: 0, subagentCount: 0 };
    }
    const startRow = {
      sessionId,
      project: projectName,
      event: "START",
      timestamp: first,
      duration: null,
      models: [],
      apiMessages: null,
      userMessages: null,
      toolCalls: null,
      subagentCount: null,
      cacheHitRate: null,
      flags: "[Reconstructed]",
      machineId: null
    };
    const endRow = {
      sessionId,
      project: projectName,
      event: "END",
      timestamp: last,
      duration: calculateDuration(first, last),
      models: transcriptStats.models,
      apiMessages: transcriptStats.apiMessages,
      userMessages: transcriptStats.userMessages,
      toolCalls: transcriptStats.toolCalls,
      subagentCount: transcriptStats.subagentCount,
      cacheHitRate: transcriptStats.cacheHitRate,
      flags: "[Reconstructed]",
      machineId: null
    };
    sessions.push({ sessionId, first, last, startRow, endRow });
  }
  sessions.sort((a, b) => a.first.localeCompare(b.first));
  return sessions.flatMap((s) => [s.startRow, s.endRow]);
}
function rebuildStatsFile(projectDir2) {
  const rows2 = rebuildSessionRows(projectDir2);
  const statsPath = path4.join(projectDir2, ".sessionstats", "session_stats.json");
  writeStatsFile(statsPath, rows2);
  return rows2;
}

// src/scripts/rebuild-stats.ts
var projectDir = process.argv[2] || process.cwd();
var transcriptDir = getProjectTranscriptDir(projectDir);
var rows = rebuildStatsFile(projectDir);
var sessionCount = rows.filter((r) => r.event === "END").length;
console.log(`Scanned transcripts in ${transcriptDir}`);
console.log(`Rebuilt .sessionstats/session_stats.json with ${sessionCount} session(s).`);
