#!/usr/bin/env node
process.env.TS_ETW_MODULE_PATH = '';
const { runCli } = await import('./run.mjs');

process.exitCode = runCli(process.argv.slice(2));
