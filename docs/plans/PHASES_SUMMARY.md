# cc-session-track: Phases Summary

A quick-reference guide to the implementation roadmap.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript |
| Runtime | Node.js 18+ |
| Bundler | esbuild |
| Testing | vitest |
| Metrics Source | ccusage npm package |
| Hook System | Claude Code Lifecycle Hooks |

---

## Key Principles

- **TDD** - Write tests before implementation
- **YAGNI** - Only build what's needed now
- **DRY** - Shared logic in `/src/lib/`
- **Frequent Commits** - Commit after each task

---

## Phase 1: Project Foundation

**Goal**: Set up project structure and configuration files.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 1.1 | Initialize package.json | `/package.json` |
| 1.2 | Create TypeScript config | `/tsconfig.json` |
| 1.3 | Create plugin metadata | `/.claude-plugin/plugin.json` |
| 1.4 | Create hooks config | `/hooks/hooks.json` |
| 1.5 | Define TypeScript types | `/src/types/index.ts` |

**Key Deliverables**: Working `npm install`, TypeScript compiles without errors

---

## Phase 2: Stats File Operations (TDD)

**Goal**: Implement reading/writing of session_stats.md.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 2.1 | Write stats-file tests | `/tests/unit/stats-file.test.ts` |
| 2.2 | Implement stats-file | `/src/lib/stats-file.ts` |
| 2.3 | Write orphan-detector tests | `/tests/unit/orphan-detector.test.ts` |
| 2.4 | Implement orphan-detector | `/src/lib/orphan-detector.ts` |
| 2.5 | Implement formatters | `/src/lib/formatters.ts` |

**Key Deliverables**: All unit tests pass, can parse/write session_stats.md

---

## Phase 3: Hook Implementations (TDD)

**Goal**: Implement SessionStart and SessionEnd hooks.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 3.1 | Implement SessionStart hook | `/src/hooks/session-start.ts` |
| 3.2 | Implement SessionEnd hook | `/src/hooks/session-end.ts` |

**Key Deliverables**: Hooks read stdin JSON, write to session_stats.md, output success JSON

---

## Phase 4: Slash Command

**Goal**: Create /session_stats command for formatted output.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 4.1 | Create command definition | `/commands/session_stats.md` |

**Key Deliverables**: `/session_stats` displays formatted stats, `md` flag outputs markdown

---

## Phase 5: Build Configuration

**Goal**: Set up esbuild to compile TypeScript hooks.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 5.1 | Create build script | `/scripts/build-hooks.js` |

**Key Deliverables**: `npm run build` produces `/plugin/scripts/*.js`

---

## Phase 6: Testing & Documentation

**Goal**: Verify everything works, update documentation.

| Task | Description | Deliverable |
|------|-------------|-------------|
| 6.1 | Run all unit tests | All tests pass |
| 6.2 | Manual integration test | Plugin works end-to-end |
| 6.3 | Test orphan detection | Crashed sessions closed properly |
| 6.4 | Update README.md | Installation & usage docs |

**Key Deliverables**: Ready for marketplace distribution

---

## Success Criteria

- [ ] `npm test` passes all unit tests
- [ ] `npm run build` compiles without errors
- [ ] SessionStart hook creates START row in session_stats.md
- [ ] SessionEnd hook creates END row with metrics
- [ ] Orphaned sessions detected and marked `[Abnormal End]`
- [ ] `/session_stats` displays formatted output
- [ ] `/session_stats md` outputs markdown tables
- [ ] Totals header updated correctly after each session
- [ ] Plugin installs via marketplace command

---

## Post-Launch Maintenance

### Monitoring
- Check that hooks fire correctly on session start/end
- Monitor ccusage compatibility with Claude Code updates

### Common Issues
- **No metrics captured**: ccusage may not have data for very short sessions
- **Orphan detection false positives**: May occur if session ID format changes
- **Build failures**: Check Node.js version (requires 18+)

### Future Considerations
- Version bump ccusage dependency when new features released
- Monitor Claude Code hook API for breaking changes
- Consider adding model-specific cost tracking

---

## File Structure Reference

```
cc-session-track/
├── .claude-plugin/
│   └── plugin.json              # Marketplace metadata
├── hooks/
│   └── hooks.json               # Hook configuration
├── plugin/
│   ├── scripts/
│   │   ├── session-start.js     # Compiled hook
│   │   └── session-end.js       # Compiled hook
│   └── package.json             # Runtime deps
├── src/
│   ├── hooks/
│   │   ├── session-start.ts
│   │   └── session-end.ts
│   ├── lib/
│   │   ├── stats-file.ts
│   │   ├── orphan-detector.ts
│   │   └── formatters.ts
│   └── types/
│       └── index.ts
├── commands/
│   └── session_stats.md
├── tests/
│   └── unit/
│       ├── stats-file.test.ts
│       ├── orphan-detector.test.ts
│       └── formatters.test.ts
├── scripts/
│   └── build-hooks.js
├── docs/
│   └── plans/
│       ├── IMPLEMENTATION_PLAN.md
│       └── PHASES_SUMMARY.md
├── package.json
├── tsconfig.json
└── README.md
```
