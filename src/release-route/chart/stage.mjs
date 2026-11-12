// The two things every chart of the route is built with, owned here once:
// - stageFn: every stage function passes through it (the chart files call nothing else). Whatever
//   a stage throws leaves it as a Refusal holding only its code and its shown detail
//   (step-common.mjs · shownRefusal), so what the engine records about the error (the execution
//   tree, the story) can hold nothing more: no raw message, no outside text, no secret.
// - QUIET_LOGGER: the engine's logger. Its default writes a stage error, with its stack and the
//   checkout's paths, to stderr; the route says what went wrong itself, as a named refusal, so the
//   engine's logger says nothing (FlowChartBuilder · setLogger, footprintjs 12.1.0).
import { shownRefusal } from '../step-common.mjs';

const silent = () => {};
export const QUIET_LOGGER = Object.freeze({ info: silent, log: silent, debug: silent, error: silent, warn: silent });

export function stageFn(stage, doors) {
  const fn = stage.make(doors);
  return (scope) => {
    try {
      const out = fn(scope);
      return out instanceof Promise ? out.catch((error) => { throw shownRefusal(error); }) : out;
    } catch (error) {
      throw shownRefusal(error);
    }
  };
}

// The usual way a linear stage is added.
export const addStage = (builder, stage, doors) => builder.addFunction(stage.name, stageFn(stage, doors), stage.id, stage.description);
