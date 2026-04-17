#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runPipeline } from './runner.js';
import type { Pipeline } from './types.js';
import { PACKAGE_VERSION } from './version.js';

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
    typeof (v as Pipeline).name === 'string' &&
    typeof (v as Pipeline).flow === 'function'
  );
}

async function cmdRun(): Promise<void> {
  const pipeline = await loadPipeline();
  const result = await runPipeline(pipeline);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      { status: result.status, tracePath: result.tracePath, reason: result.reason },
      null,
      2
    )
  );
  if (result.status === 'failure') process.exit(1);
}

async function cmdValidate(): Promise<void> {
  const pipeline = await loadPipeline();
  // Force-build the chart so we exercise the user's flow callback.
  const chart = pipeline.flow();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        name: pipeline.name,
        triggers: pipeline.triggers,
        adapter: pipeline.adapter.name,
        stageCount: chart.stageMap.size,
      },
      null,
      2
    )
  );
}

async function cmdInit(adapter: string): Promise<void> {
  if (adapter !== 'github-actions') {
    throw new Error(
      `Unsupported adapter: ${adapter}. Only 'github-actions' is supported.`
    );
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
    const content = await readFile(join(templatesDir, 'github-actions', name), 'utf8');
    await writeFile(dest, content, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`created: ${dest}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    '\nNext steps:\n' +
      '  1. npm i -D footprintjs @footprintjs/ci @actions/core @actions/artifact simple-git\n' +
      '  2. Add platform secrets in repo settings\n' +
      '  3. workflow_dispatch with dry_run=true first\n'
  );
}

async function findTemplatesDir(): Promise<string> {
  const here = fileURLToPath(import.meta.url);
  for (const c of [
    resolve(dirname(here), '..', 'templates'),
    resolve(dirname(here), '..', '..', 'templates'),
  ]) {
    try {
      const s = await stat(c);
      if (s.isDirectory()) return c;
    } catch {
      /* keep going */
    }
  }
  throw new Error('Could not locate templates/ dir');
}

const SAMPLE_CONFIG = `import { pipeline, githubActions, flowChart } from '@footprintjs/ci';

interface State {
  message: string;
}

export default pipeline({
  name: 'release',
  adapter: await githubActions(),
  triggers: ['release.published'],

  flow: () => flowChart<State>('Hello', (scope) => {
    scope.message = 'hello from FootPrint CI';
  }, 'hello').build(),

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
  program
    .command('validate')
    .description('type-check the pipeline without running')
    .action(cmdValidate);
  program
    .command('init')
    .description('scaffold config + workflow templates')
    .option('--adapter <name>', 'adapter preset', 'github-actions')
    .action((opts: { adapter: string }) => cmdInit(opts.adapter));

  await program.parseAsync(argv);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
