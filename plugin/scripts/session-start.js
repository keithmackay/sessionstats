#!/usr/bin/env node

// src/hooks/session-start.ts
import { stdin } from "process";
import path2 from "path";

// src/lib/stats-file.ts
import fs from "fs";
import path from "path";
var CSV_HEADER = "session_id,project,event,timestamp,model,duration,claude_time,cost,tokens,flags";
function parseStatsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      totals: createEmptyTotals(),
      rows: []
    };
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const totals = parseTotalsLine(lines[0] || "");
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    if (lines[i].trim()) {
      const row = parseCSVRow(lines[i]);
      if (row) rows.push(row);
    }
  }
  return { totals, rows };
}
function writeStatsFile(filePath, stats) {
  const totalsLine = formatTotalsLine(stats.totals);
  const csvLines = stats.rows.map(formatCSVRow);
  const content = [totalsLine, CSV_HEADER, ...csvLines].join("\n") + "\n";
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, "utf-8");
}
function appendRow(filePath, row) {
  const stats = parseStatsFile(filePath);
  stats.rows.push(row);
  if (row.event === "END") {
    stats.totals = recalculateTotals(stats.rows);
  }
  writeStatsFile(filePath, stats);
}
function createEmptyTotals() {
  return {
    sessions: 0,
    totalDuration: "00:00:00",
    totalClaudeTime: "00:00:00",
    totalCost: 0,
    totalTokens: 0
  };
}
function parseTotalsLine(line) {
  const defaults = createEmptyTotals();
  if (!line || !line.includes("Sessions:")) return defaults;
  const sessionsMatch = line.match(/Sessions:\s*(\d+)/);
  const durationMatch = line.match(/Duration:\s*([\d:]+)/);
  const claudeMatch = line.match(/Claude:\s*([\d:]+)/);
  const costMatch = line.match(/Cost:\s*\$?([\d.]+)/);
  const tokensMatch = line.match(/Tokens:\s*([\d,]+)/);
  return {
    sessions: sessionsMatch ? parseInt(sessionsMatch[1], 10) : 0,
    totalDuration: durationMatch ? durationMatch[1] : "00:00:00",
    totalClaudeTime: claudeMatch ? claudeMatch[1] : "00:00:00",
    totalCost: costMatch ? parseFloat(costMatch[1]) : 0,
    totalTokens: tokensMatch ? parseInt(tokensMatch[1].replace(/,/g, ""), 10) : 0
  };
}
function formatTotalsLine(totals) {
  return `Sessions: ${totals.sessions} | Duration: ${totals.totalDuration} | Claude: ${totals.totalClaudeTime} | Cost: $${totals.totalCost.toFixed(2)} | Tokens: ${totals.totalTokens.toLocaleString()}`;
}
function parseCSVRow(line) {
  const parts = line.split(",");
  if (parts.length < 10) return null;
  return {
    sessionId: parts[0],
    project: parts[1],
    event: parts[2],
    timestamp: parts[3],
    model: parts[4] || null,
    duration: parts[5] || null,
    claudeTime: parts[6] || null,
    cost: parts[7] ? parseFloat(parts[7]) : null,
    tokens: parts[8] ? parseInt(parts[8], 10) : null,
    flags: parts[9] || null
  };
}
function formatCSVRow(row) {
  return [
    row.sessionId,
    row.project,
    row.event,
    row.timestamp,
    row.model || "",
    row.duration || "",
    row.claudeTime || "",
    row.cost !== null ? row.cost.toFixed(2) : "",
    row.tokens !== null ? row.tokens.toString() : "",
    row.flags || ""
  ].join(",");
}
function recalculateTotals(rows) {
  const endRows = rows.filter((r) => r.event === "END");
  let totalDurationMs = 0;
  let totalClaudeMs = 0;
  let totalCost = 0;
  let totalTokens = 0;
  for (const row of endRows) {
    if (row.duration) totalDurationMs += parseTimeToMs(row.duration);
    if (row.claudeTime) totalClaudeMs += parseTimeToMs(row.claudeTime);
    if (row.cost !== null) totalCost += row.cost;
    if (row.tokens !== null) totalTokens += row.tokens;
  }
  return {
    sessions: endRows.length,
    totalDuration: formatMsToTime(totalDurationMs),
    totalClaudeTime: formatMsToTime(totalClaudeMs),
    totalCost,
    totalTokens
  };
}
function parseTimeToMs(time) {
  const parts = time.split(":").map(Number);
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1e3;
  }
  return 0;
}
function formatMsToTime(ms) {
  const totalSeconds = Math.floor(ms / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// src/lib/formatters.ts
function calculateDuration(startISO, endISO) {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  const durationMs = Math.max(0, endMs - startMs);
  const totalSeconds = Math.floor(durationMs / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
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
        model: startRow.model,
        duration: calculateDuration(startRow.timestamp, (/* @__PURE__ */ new Date()).toISOString()),
        claudeTime: null,
        cost: null,
        tokens: null,
        flags: "[Abnormal End]"
      };
      appendRow(filePath, endRow);
      closedOrphans.push(endRow);
    }
  }
  return closedOrphans;
}

// src/hooks/session-start.ts
async function sessionStartHook(input) {
  const statsPath = path2.join(input.cwd, "session_stats.md");
  const projectName = path2.basename(input.cwd);
  try {
    const closedOrphans = detectAndCloseOrphans(statsPath);
    if (closedOrphans.length > 0) {
      console.error(`[cc-session-track] Closed ${closedOrphans.length} orphaned session(s)`);
    }
  } catch (error) {
    console.error("[cc-session-track] Error detecting orphans:", error);
  }
  const startRow = {
    sessionId: input.session_id,
    project: projectName,
    event: "START",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    model: null,
    // Will be captured on END from ccusage
    duration: null,
    claudeTime: null,
    cost: null,
    tokens: null,
    flags: null
  };
  try {
    appendRow(statsPath, startRow);
  } catch (error) {
    console.error("[cc-session-track] Error recording session start:", error);
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
    await sessionStartHook(parsed);
  } catch (error) {
    console.error("[cc-session-track] Hook error:", error);
    console.log('{"continue": true, "suppressOutput": true}');
  }
});
