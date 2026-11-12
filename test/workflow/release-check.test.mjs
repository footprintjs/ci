// release-check.yml: the plan job of release-route.yml with the action fixed to dry-run, for a
// caller's pull requests. Read only, no build, no hold, no secret. Held equal to the route's plan
// job except for the two things that must differ, so the two copies cannot drift.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWorkflow } from './support/route-workflow.mjs';

const check = readWorkflow('release-check.yml');
const route = readWorkflow('release-route.yml');

test('a reusable workflow with no input, no secret, no permissions of its own, and one read-only job', () => {
  assert.deepEqual(Object.keys(check.yaml), ['name', 'on', 'permissions', 'defaults', 'jobs']);
  assert.deepEqual(check.yaml.on, { workflow_call: null });
  assert.deepEqual(check.yaml.permissions, {});
  assert.deepEqual(Object.keys(check.yaml.jobs), ['plan']);
  assert.deepEqual(check.yaml.jobs.plan.permissions, { contents: 'read' });
  // Read from the parsed file, so the comments may say what the job does NOT do.
  assert.doesNotMatch(JSON.stringify(check.yaml), /secrets|write|id-token|hold|build|npm-tool|concurrency|cache/);
});

test('the same job as the route\'s plan job, but the action is dry-run and the record has its own name; no outputs', () => {
  const { outputs, ...routePlan } = route.yaml.jobs.plan;
  assert.ok(outputs);
  const expected = structuredClone(routePlan);
  const plan = expected.steps.find((step) => step.id === 'plan');
  plan.env.ROUTE_ACTION = 'dry-run';
  expected.steps.at(-1).with.name = 'release-check-plan-record-${{ github.run_attempt }}';
  assert.deepEqual(check.yaml.jobs.plan, expected);
});

test('no ${{ }} inside a run: line, and no expression reads the event (a pull request\'s text never reaches a step)', () => {
  for (const step of check.yaml.jobs.plan.steps) if (typeof step.run === 'string') assert.doesNotMatch(step.run, /\$\{\{/);
  assert.doesNotMatch(JSON.stringify(check.yaml), /github\.event|github\.head_ref|inputs\./);
});
