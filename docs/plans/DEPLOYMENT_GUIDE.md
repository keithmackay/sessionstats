# Deployment Guide: Publishing cc-session-track

This guide covers how to deploy cc-session-track to the Claude Code marketplace and other distribution channels.

---

## Pre-Deployment Checklist

Before publishing, ensure:

- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Plugin works locally (install and test in a real project)
- [ ] README.md is complete and accurate
- [ ] Version number is set correctly in both:
  - `package.json`
  - `.claude-plugin/plugin.json`
- [ ] License file exists (MIT)
- [ ] No sensitive data in repository (API keys, credentials)

---

## Option 1: Claude Code Marketplace (Primary)

The Claude Code marketplace is the primary distribution channel for Claude Code plugins.

### Step 1: Verify Plugin Structure

Ensure your `plugin/` directory contains:

```
plugin/
├── .claude-plugin/
│   └── plugin.json          # Required: plugin metadata
├── hooks.json               # Required: hook configuration
├── scripts/
│   ├── session-start.js     # Required: compiled hooks
│   └── session-end.js
├── commands/
│   └── session_stats.md     # Optional: slash commands
└── package.json             # Required: runtime dependencies
```

### Step 2: Create a Marketplace Listing

1. **Fork or create a repository** on GitHub with your plugin code
   - Repository: `https://github.com/keithmackay/cc-session-track`

2. **Create a release tag**:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. **Register with the marketplace**:
   ```bash
   # From within Claude Code
   claude plugin marketplace add keithmackay/cc-session-track
   ```

### Step 3: Publish a Release

1. **Create a GitHub Release**:
   - Go to https://github.com/keithmackay/cc-session-track/releases
   - Click "Create a new release"
   - Choose tag `v0.1.0`
   - Title: `v0.1.0 - Initial Release`
   - Description: Copy from CHANGELOG or summarize features
   - Publish release

2. **Verify marketplace listing**:
   ```bash
   claude plugin search cc-session-track
   ```

### Step 4: Users Install

Once published, users can install with:

```bash
claude plugin marketplace add keithmackay/cc-session-track
claude plugin install cc-session-track
```

---

## Option 2: npm Registry

Publishing to npm allows installation via `npx` and programmatic use.

### Step 1: Prepare package.json

Ensure `package.json` has:

```json
{
  "name": "cc-session-track",
  "version": "0.1.0",
  "description": "Auto stats tracker plugin (total aggregated time/cost/tokens per Claude Code project)",
  "main": "plugin/scripts/session-start.js",
  "bin": {
    "cc-session-track": "plugin/scripts/session-start.js"
  },
  "files": [
    "plugin/",
    "README.md",
    "LICENSE"
  ],
  "keywords": [
    "claude",
    "claude-code",
    "plugin",
    "session",
    "tracking",
    "statistics"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/keithmackay/cc-session-track"
  },
  "author": "Keith MacKay",
  "license": "MIT"
}
```

### Step 2: Login to npm

```bash
npm login
```

### Step 3: Publish

```bash
# Dry run first
npm publish --dry-run

# Actual publish
npm publish
```

### Step 4: Verify

```bash
npm info cc-session-track
```

---

## Option 3: GitHub Releases Only

For users who prefer manual installation:

### Step 1: Create Release Asset

```bash
# Create a distributable zip
cd plugin
zip -r ../cc-session-track-v0.1.0.zip .
```

### Step 2: Upload to GitHub Release

1. Go to Releases page
2. Edit the release
3. Attach `cc-session-track-v0.1.0.zip`

### Step 3: Users Install Manually

Users download and extract to their Claude plugins directory:

```bash
# Download release
curl -L https://github.com/keithmackay/cc-session-track/releases/download/v0.1.0/cc-session-track-v0.1.0.zip -o cc-session-track.zip

# Extract to plugins directory
unzip cc-session-track.zip -d ~/.claude/plugins/cc-session-track
```

---

## Version Management

### Semantic Versioning

Follow [SemVer](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes to session_stats.md format or hook behavior
- **MINOR** (0.1.0): New features (e.g., new metrics, new commands)
- **PATCH** (0.0.1): Bug fixes, documentation updates

### Updating Version

1. Update version in both files:
   ```bash
   # package.json
   npm version patch  # or minor, or major

   # .claude-plugin/plugin.json - update manually to match
   ```

2. Rebuild:
   ```bash
   npm run build
   ```

3. Commit and tag:
   ```bash
   git add .
   git commit -m "Release v0.1.1"
   git tag v0.1.1
   git push && git push --tags
   ```

---

## Testing Before Release

### Local Testing

1. **Install locally**:
   ```bash
   # From the project directory
   claude plugin install . --local
   ```

2. **Start a new Claude session** in a test project

3. **Verify**:
   - Check that `session_stats.md` was created
   - Check that START row was recorded
   - Exit session and verify END row with metrics

4. **Test orphan detection**:
   - Start a session
   - Force-kill Claude Code (Ctrl+C or kill process)
   - Start a new session
   - Verify orphaned session was closed with `[Abnormal End]`

5. **Test /session_stats**:
   ```bash
   /session_stats       # Should show color output
   /session_stats md    # Should show markdown tables
   ```

### CI/CD Testing (Optional)

Add GitHub Actions workflow:

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run build
```

---

## Post-Deployment

### Monitor Issues

- Watch GitHub Issues for bug reports
- Respond to user feedback
- Track feature requests

### Update Documentation

Keep these files current:
- README.md
- CHANGELOG.md (create if not exists)
- docs/BUILD_STORY.md

### Announce Release

Consider announcing on:
- GitHub Discussions
- Twitter/X
- Reddit r/ClaudeAI
- Discord communities

---

## Marketplace Alternatives

### Awesome Claude Code

Submit to the community list:
- https://github.com/thedotmack/awesome-claude-code

1. Fork the repository
2. Add entry under "Plugins" section:
   ```markdown
   - [cc-session-track](https://github.com/keithmackay/cc-session-track) - Auto stats tracker for session time/cost/tokens
   ```
3. Submit pull request

### Personal Website/Blog

Write a blog post about:
- Why you built it
- How to use it
- Technical implementation details

---

## Troubleshooting Deployment

### Plugin Not Found After Publish

```bash
# Clear Claude's plugin cache
rm -rf ~/.claude/plugins/cache/

# Re-add marketplace
claude plugin marketplace add keithmackay/cc-session-track
```

### Version Mismatch

Ensure version matches in:
- `package.json`
- `.claude-plugin/plugin.json`
- `plugin/package.json` (generated by build)
- Git tag

### npm Publish Fails

```bash
# Check if name is taken
npm info cc-session-track

# Use scoped package if needed
# Change name to @keithmackay/cc-session-track
```

---

## Summary Checklist

### Ready to Deploy?

1. [ ] Tests pass locally
2. [ ] Build succeeds
3. [ ] Local installation works
4. [ ] Hooks fire correctly
5. [ ] /session_stats displays properly
6. [ ] Orphan detection works
7. [ ] Versions match across all files
8. [ ] README is complete
9. [ ] LICENSE file exists

### Deploy Steps

1. [ ] Create git tag: `git tag v0.1.0`
2. [ ] Push tag: `git push origin v0.1.0`
3. [ ] Create GitHub Release
4. [ ] Add to marketplace: `claude plugin marketplace add ...`
5. [ ] (Optional) Publish to npm
6. [ ] Verify installation works
7. [ ] Announce release

---

*Last updated: December 12, 2025*
