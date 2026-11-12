// The bundle's command: `node dist/release-route.cjs <plan|verify|why> ...`. plan and verify read
// the same environment as the plain steps (scripts/release-route.mjs); why reads `why <file> [key]`.
import { runHandlers } from '../step-common.mjs';
import { CHART_STEPS } from './steps.mjs';

export const runChartStep = (step, doors) => runHandlers(CHART_STEPS, step, doors);
