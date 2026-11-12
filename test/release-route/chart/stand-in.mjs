// Runs a charted step with stages a test stands in. The stages are an argument of the inner step
// functions (chart/steps.mjs · planStepWith, verifyStepWith), never a door, so the shipped steps
// cannot be handed another stage; this helper runs them the way the bundle runs a step
// (step-common.mjs · runHandlers: the refusal printed, the report ended, the exit code returned).
import { planStepWith, verifyStepWith } from '../../../src/release-route/chart/steps.mjs';
import { runHandlers } from '../../../src/release-route/step-common.mjs';

const WITH = Object.freeze({ plan: planStepWith, verify: verifyStepWith });

export const runWithStages = (step, stages, doors) => runHandlers({ [step]: (own) => WITH[step](stages, own) }, step, doors);
