#!/usr/bin/env node

// src/scripts/report.ts
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

// src/scripts/report.ts
function aggregateByTag(scanRoots, tag) {
  const projects = [];
  for (const root of scanRoots) {
    if (!fs2.existsSync(root)) continue;
    const entries = fs2.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const entry of entries) {
      const projectDir = path.join(root, entry.name);
      const configPath = path.join(projectDir, ".sessionstats", "config.json");
      if (!fs2.existsSync(configPath)) continue;
      let config;
      try {
        config = JSON.parse(fs2.readFileSync(configPath, "utf-8"));
      } catch (error) {
        console.error(`[sessionstats] Skipping ${entry.name}: could not read .sessionstats/config.json (${error})`);
        continue;
      }
      const tags = Array.isArray(config.tags) ? config.tags : [];
      if (tag && !tags.includes(tag)) continue;
      const statsPath = path.join(projectDir, ".sessionstats", "session_stats.json");
      let stats;
      try {
        stats = parseStatsFile(statsPath);
      } catch (error) {
        console.error(`[sessionstats] Skipping ${entry.name}: could not read .sessionstats/session_stats.json (${error})`);
        continue;
      }
      const endRows = stats.rows.filter((r) => r.event === "END");
      const byModel = /* @__PURE__ */ new Map();
      for (const row of endRows) {
        for (const m of row.models) {
          const entry2 = byModel.get(m.model) ?? { cost: 0, tokens: 0 };
          entry2.cost += m.cost ?? 0;
          entry2.tokens += (m.input ?? 0) + (m.output ?? 0) + (m.cacheRead ?? 0) + (m.cacheWrite ?? 0);
          byModel.set(m.model, entry2);
        }
      }
      const models = Array.from(byModel.entries()).map(([model, v]) => ({ model, ...v }));
      projects.push({
        projectName: config.projectName,
        tags,
        cost: endRows.reduce((s, r) => s + rowCost(r), 0),
        tokens: endRows.reduce((s, r) => s + rowTokens(r), 0),
        sessions: endRows.length,
        models
      });
    }
  }
  return {
    projects,
    totalCost: projects.reduce((s, p) => s + p.cost, 0),
    totalTokens: projects.reduce((s, p) => s + p.tokens, 0)
  };
}
function printReport() {
  const args = process.argv.slice(2);
  const tagIndex = args.indexOf("--tag");
  const tag = tagIndex >= 0 ? args[tagIndex + 1] : null;
  const pluginConfigPath = path.join(os.homedir(), ".claude", "sessionstats", "config.json");
  const scanRoots = fs2.existsSync(pluginConfigPath) ? JSON.parse(fs2.readFileSync(pluginConfigPath, "utf-8")).scanRoots : [path.join(os.homedir(), "Projects")];
  const result = aggregateByTag(scanRoots, tag);
  console.log("=".repeat(60));
  console.log(`  SESSIONSTATS REPORT${tag ? ` \u2014 tag: ${tag}` : " \u2014 all projects"}`);
  console.log("=".repeat(60));
  for (const p of result.projects) {
    console.log(`  ${p.projectName.padEnd(24)} sessions:${p.sessions.toString().padStart(4)}  cost:$${p.cost.toFixed(2)}`);
    for (const m of p.models) {
      console.log(`    \u21B3 ${m.model.padEnd(28)} cost:$${m.cost.toFixed(2)}  tokens:${m.tokens.toLocaleString()}`);
    }
  }
  console.log("-".repeat(60));
  console.log(`  TOTAL cost: $${result.totalCost.toFixed(2)}  tokens: ${result.totalTokens.toLocaleString()}`);
}
printReport();
export {
  aggregateByTag
};
