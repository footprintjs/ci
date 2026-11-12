// What enters the chart's state is what the plain path decides on and prints: a fact is its
// observer's value exactly (or null), never a cleaned look-alike; a cause keeps its detail as
// shown, and showing it again prints exactly what the plain step prints from the raw detail.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { causeValue, factValue, writeObservation } from '../../../src/release-route/chart/state.mjs';
import { Refusal } from '../../../src/release-route/refusals.mjs';
import { FACTS } from '../../../src/release-route/rules.mjs';
import { shownDetail } from '../../../src/release-route/step-common.mjs';
import { clean as printable } from '../../../src/shared/text.mjs';

const LOOK_ALIKES = ['publish ', ' publish', 'publish\u{200B}', '\tpublish\n', 'dry-run\u{202E}', 'Publish', 'true', 'false', 1, 0, '', undefined, null, {}, [], NaN];

test('a fact enters state as one of its values, exactly, or as null', () => {
  for (const [name, values] of Object.entries(FACTS)) {
    for (const value of values) assert.ok(Object.is(factValue(name, value), value), `${name}=${value}`);
    for (const value of LOOK_ALIKES) if (!values.includes(value)) assert.equal(factValue(name, value), null, `${name}=${String(value)}`);
  }
  const scope = {};
  writeObservation(scope, { facts: { action: 'publish ', refIsMain: true }, causes: {}, context: {} });
  assert.deepEqual(scope, { action: null, refIsMain: true });
});

const DETAILS = ['ls-remote main', 'npm HTTP 503', `a${'x'.repeat(300)}`, 'x::error::y', 'a\nb\r\nc', '##[group]z', '\u{202E}rtl', ' padded ', ':', '', `${'::'.repeat(150)}`];

test('a cause\'s detail, kept as shown, prints exactly as the plain step prints the raw one', () => {
  for (const detail of DETAILS) {
    const kept = causeValue(new Refusal('git-failed', detail)).detail;
    assert.equal(printable(kept), printable(detail), JSON.stringify(detail));
    assert.equal(shownDetail(kept), shownDetail(detail), JSON.stringify(detail));
  }
});
