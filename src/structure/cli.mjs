#!/usr/bin/env node
import { runCli } from './cli/run.mjs';

process.exitCode = runCli(process.argv.slice(2));
