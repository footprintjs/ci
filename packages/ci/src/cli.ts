#!/usr/bin/env node
import { Command } from 'commander';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runPipeline } from './runner';
import type { Pipeline } from './types';
import { PACKAGE_VERSION } from './version';

const CONFIG_CANDIDATES = [
  '.footprint-ci.ts',
  '.footprint-ci.mjs',
  '.footprint-ci.js',
  '.footprint-ci.cjs',
  'footprint-ci.config.ts',
  'footprint-ci.config.mjs',
  'footprint-ci.config.js',
];

async function loadPipeline(cwd = process.cwd()): Promise<Pipeline> {
  const match = CONFIG_CANDIDATES.map((c) => resolve(cwd, c)).find((p) =>
    existsSync(p)
  );
  if (!match) {
    throw new Error(
      `No pipeline config found. Looked for: ${CONFIG_CANDIDATES.join(', ')}`
    );
  }

  const mod = await import(pathToFileURL(match).href);
  const candidate = mod.default ?? mod.pipeline ?? mod.config;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(
      `${match} did not export a Pipeline (expected default export from pipeline())`
    );
  }
  const resolved = await candidate;
  if (!isPipeline(resolved)) {
    throw new Error(
      `${match} default export is not a Pipeline. Did you forget to call pipeline()?`
    );
  }
  return resolved;
}

function isPipeline(v: unknown): v is Pipeline {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Pipeline).buildFlow === 'function' &&
    typeof (v as Pipeline).name === 'string'
  );
}

async function cmdRun(): Promise<void> {
  const pipeline = await loadPipeline();
  const result = await runPipeline(pipeline);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ status: result.status, tracePath: result.tracePath, reason: result.reason }, null, 2));
  if (result.status === 'failure') process.exit(1);
}

async function cmdValidate(): Promise<void> {
  const pipeline = await loadPipeline();
  // Force the flow to build so we exercise the builder callback.
  const def = pipeline.buildFlow();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        name: pipeline.name,
        triggers: pipeline.triggers,
        nodeCount: def.nodes.length,
        adapter: pipeline.adapter.name,
      },
      null,
      2
    )
  );
}

async function cmdInit(adapter: string): Promise<void> {
  if (adapter !== 'github-actions') {
    throw new Error(`Unsupported adapter: ${adapter}. Only 'github-actions' is supported.`);
  }

  const cwd = process.cwd();
  const configPath = join(cwd, '.footprint-ci.ts');
  const workflowDir = join(cwd, '.github', 'workflows');

  if (existsSync(configPath)) {
    // eslint-disable-next-line no-console
    console.log(`skip: ${configPath} already exists`);
  } else {
    await writeFile(configPath, SAMPLE_CONFIG, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`created: ${configPath}`);
  }

  await mkdir(workflowDir, { recursive: true });
  const templatesDir = await findTemplatesDir();

  for (const name of ['ci.yml', 'release.yml']) {
    const dest = join(workflowDir, name);
    if (existsSync(dest)) {
      // eslint-disable-next-line no-console
      console.log(`skip: ${dest} already exists`);
      continue;
    }
    const src = join(templatesDir, 'github-actions', name);
    const content = await readFile(src, 'utf8');
    await writeFile(dest, content, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`created: ${dest}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    '\nNext steps:\n' +
      '  1. Install peer deps: npm i -D footprintjs @footprintjs/ci @actions/core @actions/artifact simple-git\n' +
      '  2. Add platform secrets in your GitHub repo settings\n' +
      '  3. Push to a branch and trigger a workflow_dispatch run with dry_run=true\n'
  );
}

async function findTemplatesDir(): Promise<string> {
  // Resolve relative to this file, whether running from dist/ or src/.
  const here = fileURLToPath(import.meta.url);
  const candidates = [
    resolve(dirname(here), '..', 'templates'),
    resolve(dirname(here), '..', '..', 'templates'),
  ];
  for (const c of candidates) {
    try {
      const s = await stat(c);
      if (s.isDirectory()) return c;
    } catch {
      // continue
    }
  }
  throw new Error(`Could not locate templates/ dir. Tried: ${candidates.join(', ')}`);
}

const SAMPLE_CONFIG = `import { pipeline, githubActions } from '@footprintjs/ci';
// import { releaseAnnounce } from '@footprintjs/release-announce';

export default pipeline({
  name: 'release',
  adapter: await githubActions(),
  triggers: ['release.published'],

  flow: (fp) => fp.stage('hello', async (_input, ctx) => {
    ctx.adapter.log('info', \`release \${ctx.trigger.ref}\`);
    return { ok: true };
  }),

  persistence: {
    traces: { dir: './traces', commitBack: true },
  },
});
`;

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = new Command();
  program
    .name('footprint-ci')
    .description('FootPrint CI — observable pipelines')
    .version(PACKAGE_VERSION);

  program.command('run').description('run the pipeline').action(cmdRun);
  program.command('validate').description('type-check the pipeline without running').action(cmdValidate);
  program
    .command('init')
    .description('scaffold config + workflow templates')
    .option('--adapter <name>', 'adapter preset', 'github-actions')
    .action((opts: { adapter: string }) => cmdInit(opts.adapter));

  await program.parseAsync(argv);
}

// Allow `node dist/cli.js` as well as programmatic imports.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
