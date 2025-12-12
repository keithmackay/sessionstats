#!/usr/bin/env node

import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const HOOKS = [
  { name: 'session-start', source: 'src/hooks/session-start.ts' },
  { name: 'session-end', source: 'src/hooks/session-end.ts' }
];

async function buildHooks() {
  console.log('Building cc-session-track hooks...\n');

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8')
  );
  const version = packageJson.version;

  // Create output directories
  const pluginDir = path.join(rootDir, 'plugin');
  const scriptsDir = path.join(pluginDir, 'scripts');

  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  // Build each hook
  for (const hook of HOOKS) {
    console.log(`Building ${hook.name}...`);

    await build({
      entryPoints: [path.join(rootDir, hook.source)],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'esm',
      outfile: path.join(scriptsDir, `${hook.name}.js`),
      minify: false, // Keep readable for debugging
      sourcemap: false,
      define: {
        '__VERSION__': `"${version}"`
      },
      banner: {
        js: '#!/usr/bin/env node'
      }
    });

    // Make executable
    fs.chmodSync(path.join(scriptsDir, `${hook.name}.js`), 0o755);

    const stats = fs.statSync(path.join(scriptsDir, `${hook.name}.js`));
    console.log(`  ✓ ${hook.name}.js (${(stats.size / 1024).toFixed(2)} KB)`);
  }

  // Generate plugin/package.json for runtime
  const pluginPackageJson = {
    name: 'cc-session-track-plugin',
    version: version,
    private: true,
    type: 'module',
    engines: { node: '>=18.0.0' }
  };

  fs.writeFileSync(
    path.join(pluginDir, 'package.json'),
    JSON.stringify(pluginPackageJson, null, 2) + '\n'
  );
  console.log('  ✓ plugin/package.json generated');

  // Copy hooks.json to plugin directory
  const hooksJsonSrc = path.join(rootDir, 'hooks', 'hooks.json');
  const hooksJsonDest = path.join(pluginDir, 'hooks.json');
  if (fs.existsSync(hooksJsonSrc)) {
    fs.copyFileSync(hooksJsonSrc, hooksJsonDest);
    console.log('  ✓ hooks.json copied to plugin/');
  }

  // Copy .claude-plugin to plugin directory
  const pluginJsonSrc = path.join(rootDir, '.claude-plugin', 'plugin.json');
  const claudePluginDir = path.join(pluginDir, '.claude-plugin');
  if (!fs.existsSync(claudePluginDir)) {
    fs.mkdirSync(claudePluginDir, { recursive: true });
  }
  if (fs.existsSync(pluginJsonSrc)) {
    fs.copyFileSync(pluginJsonSrc, path.join(claudePluginDir, 'plugin.json'));
    console.log('  ✓ .claude-plugin/plugin.json copied to plugin/');
  }

  // Copy commands directory to plugin
  const commandsSrc = path.join(rootDir, 'commands');
  const commandsDest = path.join(pluginDir, 'commands');
  if (fs.existsSync(commandsSrc)) {
    if (!fs.existsSync(commandsDest)) {
      fs.mkdirSync(commandsDest, { recursive: true });
    }
    for (const file of fs.readdirSync(commandsSrc)) {
      fs.copyFileSync(
        path.join(commandsSrc, file),
        path.join(commandsDest, file)
      );
    }
    console.log('  ✓ commands/ copied to plugin/');
  }

  console.log('\n✓ All hooks built successfully!');
  console.log(`  Output: ${pluginDir}`);
}

buildHooks().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
