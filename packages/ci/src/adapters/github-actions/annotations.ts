import type { LogLevel } from '../types';

type CoreModule = typeof import('@actions/core');

export function logToGhActions(
  core: CoreModule,
  level: LogLevel,
  msg: string,
  meta?: Record<string, unknown>
): void {
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const line = `${msg}${suffix}`;
  if (level === 'error') {
    core.error(line);
  } else if (level === 'warn') {
    core.warning(line);
  } else {
    core.info(line);
  }
}
