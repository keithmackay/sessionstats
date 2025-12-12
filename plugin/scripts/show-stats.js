#!/usr/bin/env node

// src/scripts/show-stats.ts
import path from "path";

// src/lib/stats-file.ts
import fs from "fs";
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
  lines.push(`  Claude Time:  ${COLORS.green}${stats.totals.totalClaudeTime}${COLORS.reset}`);
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
      const costStr = row.cost !== null ? `$${row.cost.toFixed(2)}` : "N/A";
      lines.push(`  ${date.padEnd(18)} ${(row.duration || "N/A").padEnd(10)} ${COLORS.green}${costStr}${COLORS.reset}${flag}`);
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
  lines.push(`| Claude Time | ${stats.totals.totalClaudeTime} |`);
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
      const cost = row.cost !== null ? `$${row.cost.toFixed(2)}` : "N/A";
      const tokens = row.tokens !== null ? row.tokens.toLocaleString() : "N/A";
      lines.push(`| ${date} | ${row.duration || "N/A"} | ${cost} | ${tokens} | ${row.model || "N/A"} | ${row.flags || ""} |`);
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
  const statsPath = path.join(projectDir, "session_stats.md");
  const projectName = path.basename(projectDir);
  try {
    const stats = parseStatsFile(statsPath);
    if (stats.rows.length === 0) {
      console.log("No session statistics found.");
      console.log("Sessions will be tracked automatically when you start and end Claude Code sessions.");
      return;
    }
    if (useMarkdown) {
      console.log(formatMarkdownOutput(stats, projectName));
    } else {
      console.log(formatTerminalOutput(stats, projectName));
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("No session statistics found.");
      console.log("Sessions will be tracked automatically when you start and end Claude Code sessions.");
    } else {
      console.error("Error reading session statistics:", error);
      process.exit(1);
    }
  }
}
showStats();
