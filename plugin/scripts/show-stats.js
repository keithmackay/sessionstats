#!/usr/bin/env node

// src/scripts/show-stats.ts
import fs2 from "fs";
import path from "path";

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

// src/lib/formatters.ts
var COLORS = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  blue: "\x1B[34m",
  cyan: "\x1B[36m",
  red: "\x1B[31m"
};
function rowCostStr(row) {
  return row.models.length > 0 ? `$${rowCost(row).toFixed(2)}` : "N/A";
}
function rowTokensStr(row) {
  return row.models.length > 0 ? rowTokens(row).toLocaleString() : "N/A";
}
function rowModelStr(row) {
  return row.models.map((m) => m.model).join(", ") || "N/A";
}
function formatTerminalOutput(stats, projectName) {
  const lines = [];
  lines.push("");
  lines.push(`${COLORS.cyan}\u256D${"\u2500".repeat(60)}\u256E${COLORS.reset}`);
  lines.push(`${COLORS.cyan}\u2502${COLORS.reset}  ${COLORS.bold}SESSION STATISTICS: ${projectName}${COLORS.reset}`.padEnd(71) + `${COLORS.cyan}\u2502${COLORS.reset}`);
  lines.push(`${COLORS.cyan}\u2570${"\u2500".repeat(60)}\u256F${COLORS.reset}`);
  lines.push("");
  lines.push(`  ${COLORS.bold}TOTALS${COLORS.reset}`);
  lines.push(`  ${"\u2500".repeat(40)}`);
  lines.push(`  Sessions:     ${COLORS.green}${stats.totals.sessions}${COLORS.reset}`);
  lines.push(`  Total Time:   ${COLORS.green}${stats.totals.totalDuration}${COLORS.reset}`);
  lines.push(`  Total Cost:   ${COLORS.green}$${stats.totals.totalCost.toFixed(2)}${COLORS.reset}`);
  lines.push(`  Total Tokens: ${COLORS.green}${stats.totals.totalTokens.toLocaleString()}${COLORS.reset}`);
  lines.push("");
  const endRows = stats.rows.filter((r) => r.event === "END").slice(-5).reverse();
  if (endRows.length > 0) {
    lines.push(`  ${COLORS.bold}RECENT SESSIONS (last ${endRows.length})${COLORS.reset}`);
    lines.push(`  ${"\u2500".repeat(40)}`);
    for (const row of endRows) {
      const date = new Date(row.timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
      const flag = row.flags ? ` ${COLORS.yellow}${row.flags}${COLORS.reset}` : "";
      lines.push(`  ${date.padEnd(18)} ${(row.duration || "N/A").padEnd(10)} ${COLORS.green}${rowCostStr(row)}${COLORS.reset}${flag}`);
    }
    lines.push("");
  } else {
    lines.push(`  ${COLORS.dim}No completed sessions yet${COLORS.reset}`);
    lines.push("");
  }
  return lines.join("\n");
}
function formatMarkdownOutput(stats, projectName) {
  const lines = [];
  lines.push(`## Session Statistics: ${projectName}`);
  lines.push("");
  lines.push("### Totals");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Sessions | ${stats.totals.sessions} |`);
  lines.push(`| Total Duration | ${stats.totals.totalDuration} |`);
  lines.push(`| Total Cost | $${stats.totals.totalCost.toFixed(2)} |`);
  lines.push(`| Total Tokens | ${stats.totals.totalTokens.toLocaleString()} |`);
  lines.push("");
  const endRows = stats.rows.filter((r) => r.event === "END").slice(-10).reverse();
  if (endRows.length > 0) {
    lines.push("### Recent Sessions");
    lines.push("");
    lines.push("| Date | Duration | Cost | Tokens | Model | Flags |");
    lines.push("|------|----------|------|--------|-------|-------|");
    for (const row of endRows) {
      const date = new Date(row.timestamp).toISOString().split("T")[0];
      lines.push(`| ${date} | ${row.duration || "N/A"} | ${rowCostStr(row)} | ${rowTokensStr(row)} | ${rowModelStr(row)} | ${row.flags || ""} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// src/scripts/show-stats.ts
function showStats() {
  const args = process.argv.slice(2);
  const useMarkdown = args.includes("md") || args.includes("markdown");
  const projectDir = args.find((arg) => !["md", "markdown"].includes(arg)) || process.cwd();
  const statsPath = path.join(projectDir, ".sessionstats", "session_stats.json");
  const renderedPath = path.join(projectDir, ".sessionstats", "session_stats.md");
  const projectName = path.basename(projectDir);
  const stats = parseStatsFile(statsPath);
  if (stats.rows.length === 0) {
    console.log("No session statistics found.");
    console.log("Sessions will be tracked automatically when you start and end Claude Code sessions.");
    return;
  }
  const markdown = formatMarkdownOutput(stats, projectName);
  fs2.writeFileSync(renderedPath, markdown, "utf-8");
  console.log(useMarkdown ? markdown : formatTerminalOutput(stats, projectName));
}
showStats();
