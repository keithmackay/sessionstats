// ABOUTME: Extracts user prompts from Claude Code JSONL transcript files
// ABOUTME: Filters out tool results and system content, returns clean prompt history

export interface Prompt {
  timestamp: string;
  content: string;
  sessionId: string;
}

interface TranscriptEntry {
  type: string;
  sessionId?: string;
  timestamp?: string;
  message?: {
    role: string;
    content: string | unknown[];
  };
}

/**
 * Extract user prompts from an array of JSONL lines.
 * Filters to only real user input (string content, non-empty after stripping system tags).
 */
export function extractPrompts(lines: string[]): Prompt[] {
  const prompts: Prompt[] = [];

  for (const line of lines) {
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== 'user') continue;
    if (!entry.message || typeof entry.message.content !== 'string') continue;

    const cleaned = stripSystemTags(entry.message.content).trim();
    if (!cleaned) continue;

    prompts.push({
      timestamp: entry.timestamp || '',
      content: cleaned,
      sessionId: entry.sessionId || '',
    });
  }

  prompts.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return prompts;
}

/**
 * Format prompts as markdown grouped by date.
 */
export function formatPromptsMarkdown(prompts: Prompt[]): string {
  if (prompts.length === 0) return '';

  const byDate = new Map<string, Prompt[]>();
  for (const p of prompts) {
    const date = p.timestamp.slice(0, 10); // YYYY-MM-DD
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(p);
  }

  const sections: string[] = [];
  for (const [date, datePrompts] of byDate) {
    const lines: string[] = [`## ${date}`];
    for (const p of datePrompts) {
      const time = p.timestamp.slice(11, 16); // HH:MM
      const quoted = p.content.split('\n').map(l => `> ${l}`).join('\n');
      lines.push(`### ${time}\n${quoted}`);
    }
    sections.push(lines.join('\n\n'));
  }

  return sections.join('\n\n');
}

function stripSystemTags(content: string): string {
  return content
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '');
}
