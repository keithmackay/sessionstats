---
description: Generate or update BUILD_STORY.md documenting project development history
---

# Build Story Generator

You are tasked with creating or updating a `docs/BUILD_STORY.md` file that chronicles the development of this project. This document captures the collaborative process between human and AI, including prompts, decisions, and implementation details.

## Step 1: Gather Context

First, collect information from multiple sources:

### 1.1 Check for existing BUILD_STORY.md
```bash
cat docs/BUILD_STORY.md 2>/dev/null || echo "NO_EXISTING_FILE"
```

### 1.2 Get git history
```bash
git log --oneline --all | head -50
```

### 1.3 Get detailed recent commits
```bash
git log --pretty=format:"### %s%n%nDate: %ad%nAuthor: %an%n%n%b%n---" --date=short -20
```

### 1.4 Get project metadata
```bash
cat package.json 2>/dev/null || cat Cargo.toml 2>/dev/null || cat pyproject.toml 2>/dev/null || echo "{}"
```

### 1.5 Get README
```bash
cat README.md 2>/dev/null || echo "No README"
```

### 1.6 Get project structure
```bash
find . -type f -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.rs" -o -name "*.go" 2>/dev/null | grep -v node_modules | grep -v dist | grep -v build | head -50
```

### 1.7 Get user prompt history from Claude Code transcripts
```bash
node "${CLAUDE_PLUGIN_ROOT}/plugin/scripts/extract-prompts.js"
```

This outputs all user prompts from every Claude Code session for this project, grouped by date with timestamps. Include ALL of these prompts in the BUILD_STORY.md output.

## Step 2: Analyze Current Session

Review the conversation history from this session to identify:
- **User requests**: What did the user ask for?
- **Design decisions**: What choices were made and why?
- **Implementation details**: What was built?
- **Key insights**: What lessons were learned?

## Step 3: Generate or Update BUILD_STORY.md

### If NO existing file:

Create a new `docs/BUILD_STORY.md` with this structure:

```markdown
# How [PROJECT_NAME] Was Built

This document chronicles the development of [PROJECT_NAME], including the prompts used, decisions made, and the iterative design process.

---

## Project Overview

| Attribute | Value |
|-----------|-------|
| **Project** | [name from package.json/etc] |
| **Description** | [description] |
| **Started** | [date of first commit] |
| **Primary Language** | [detected language] |

---

## Development Timeline

[Generate sections for each major phase based on git history, grouping related commits]

### Phase 1: [Initial Setup]
- [What was created]
- [Key files added]

### Phase 2: [Feature Name]
- [What was implemented]
- [Design decisions]

[Continue for each logical phase...]

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| [decision 1] | [why] |
| [decision 2] | [why] |

---

## Project Structure

```
[project tree]
```

---

## Prompt History

Include every user prompt from the extract-prompts output, organized chronologically. Present each prompt as a blockquote with its timestamp. Group by date.

---

## Future Enhancements

- [Ideas mentioned but not yet implemented]

---

## Retroactive Learning/Improvements

[Reviewing the full history above with hindsight, identify things that would be done differently knowing what we know now — see the "Retroactive Learning/Improvements" guidance below for what belongs here.]

---

*Documentation generated with Claude Code assistance.*
```

### If file EXISTS:

1. Read the existing content
2. Identify the last documented date/section
3. Analyze git commits since then
4. Add a new section for recent changes:

```markdown
---

## [Feature/Change Name] ([DATE])

### Context
[Why was this change needed?]

### User Request
> [Quote the prompt if available]

### Changes Made

| File | Change |
|------|--------|
| `file1.ts` | [description] |
| `file2.ts` | [description] |

### Technical Details
[Implementation specifics]

### Key Insights
> "[Any lessons learned]"
```

5. Update the **Prompt History** section with any new prompts not already documented.
6. If the existing file has no **Retroactive Learning/Improvements** section, add one at the end (see guidance below). If it already has one, review it against the changes since it was last updated and append any new items — don't rewrite items already there unless they've been directly superseded.

## Step 4: Write the File

After generating the content, write it to `docs/BUILD_STORY.md`.

If the docs/ directory doesn't exist, create it first:
```bash
mkdir -p docs
```

## Retroactive Learning/Improvements

This section is hindsight, not a changelog — don't restate what Key Technical Decisions already covers. For each item, name the specific commit/phase it relates to, what you'd do differently knowing the full history, and why (what pain, rework, or bug it would have avoided). Look for:

- **Rework signals**: a feature built one way, then reworked or reverted later — what would have gotten it right the first time?
- **Repeated fixes**: the same file/area patched multiple times for related bugs — a sign the underlying design needed to change, not just the symptom.
- **Decisions later regretted**: a documented decision whose rationale was later overridden or worked around elsewhere.
- **Missing tests/docs that would have caught a bug earlier** — call out the specific failure it would have caught.

If nothing in the history qualifies (e.g. a young or small project), write "Nothing rises to the level of a retroactive lesson yet" rather than manufacturing filler items.

## Guidelines

1. **Be specific**: Include actual file names, function names, and concrete details
2. **Quote prompts**: Include ALL user prompts from the extract-prompts output in the Prompt History section
3. **Explain rationale**: Don't just say what was done, explain why
4. **Track metrics**: Include before/after comparisons when relevant (bundle size, test count, etc.)
5. **Preserve history**: When updating, never remove existing content - only append
6. **Use tables**: They make technical decisions and changes scannable
7. **Include code snippets**: Short examples help illustrate key patterns
8. **Date everything**: Each section should have a date for future reference

## Output

After completing the BUILD_STORY.md, provide a brief summary:
- Whether you created a new file or updated existing
- How many sections were added
- Key highlights captured

If updating, also run:
```bash
git diff docs/BUILD_STORY.md | head -100
```

To show what was added.
