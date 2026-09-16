/**
 * The layout of a live meeting, as plain objects.
 *
 * None of this needs a browser, a meeting, or anyone to talk. That is the
 * point of splitting the judgement away from the DOM: the rule about geometry
 * is the rule that broke in production, and a rule that can only be exercised
 * by joining a call is a rule that gets exercised once.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MIN_SCORE,
  describe as describeElement,
  emptyDescription,
  findCaptionRoot,
  measure,
  pick,
  score,
} from '../src/captionRoot.js';

const captionRegion = (over = {}) => ({
  ...emptyDescription(),
  knownRoot: true,
  speakerBlocks: 2,
  liveRegion: true,
  textLength: 120,
  viewportHeight: 900,
  rect: { top: 700, height: 120 },
  ...over,
});

test('a caption region is recognised on its own merits', () => {
  const { total } = score(captionRegion());
  assert.ok(total >= MIN_SCORE, `scored ${total}, below the threshold`);
});

test('a background window measures as nothing, and that disqualifies nobody', () => {
  // Chrome reports all-zero rectangles for tabs in background or minimised
  // windows. The extension used to reject those candidates, so it went blind
  // exactly when somebody looked at another window — which is when they most
  // want the transcript to keep running.
  const visible = score(captionRegion()).total;
  const unmeasured = score(captionRegion({ rect: null })).total;

  assert.ok(unmeasured >= MIN_SCORE, 'an unmeasured caption region must still be found');
  assert.equal(visible - unmeasured, 1, 'geometry may only ever add confidence');
});

test('a rectangle of zeroes is read as a missing measurement, not a tiny element', () => {
  const zeroed = { top: 0, left: 0, width: 0, height: 0 };
  assert.equal(measure({ getBoundingClientRect: () => zeroed }), null);

  const real = { top: 12, left: 0, width: 300, height: 40 };
  assert.deepEqual(measure({ getBoundingClientRect: () => real }), real);
});

test('captions at the top of the viewport are still captions', () => {
  // Meet draws them along the bottom, usually. "Usually" is not a rule, and
  // a person who has moved the layout is not a person who wants silence.
  const high = captionRegion({ rect: { top: 40, height: 80 } });
  assert.ok(score(high).total >= MIN_SCORE);
});

test('a control panel is not a transcript', () => {
  const panel = captionRegion({ knownRoot: false, speakerBlocks: 0, uiElements: 9 });
  assert.ok(score(panel).total < MIN_SCORE);
});

test('a hidden region is refused outright, because CSS is honest in a background tab', () => {
  // The only signal allowed to disqualify, and the reason it is allowed:
  // display:none stays display:none whether or not anyone is looking at the
  // window, unlike a rectangle. A penalty was not enough — a well identified
  // region cleared the threshold while invisible.
  const hidden = score(captionRegion({ cssHidden: true }));
  assert.equal(hidden.disqualified, true);
  assert.equal(hidden.total, -Infinity);
  assert.equal(pick([captionRegion({ cssHidden: true })]), null);
});

test('an empty region is refused and a whole chat log is refused', () => {
  assert.ok(score(captionRegion({ speakerBlocks: 0, knownRoot: false, textLength: 0 })).total < MIN_SCORE);
  assert.ok(score(captionRegion({ textLength: 40000 })).total < score(captionRegion()).total);
});

test('speaker blocks carry the decision when every class name has changed', () => {
  // The class names are generated and do change. What does not change is that
  // Meet renders one block per speaker.
  const renamed = captionRegion({ knownRoot: false, liveRegion: false, captionLabel: false });
  assert.ok(score(renamed).total >= MIN_SCORE, 'structure must outlive the class names');
});

test('the strongest candidate wins and ties keep their order', () => {
  const weak = captionRegion({ knownRoot: false, speakerBlocks: 0, liveRegion: true, textLength: 20 });
  const strong = captionRegion();

  assert.equal(pick([weak, strong]).index, 1);
  assert.equal(pick([strong, { ...strong }]).index, 0, 'a tie must not depend on DOM order this frame');
});

test('nothing good enough means nothing, not the least bad thing', () => {
  const rubbish = captionRegion({ knownRoot: false, speakerBlocks: 0, liveRegion: false, textLength: 1 });
  assert.equal(pick([rubbish]), null);
});

test('the score explains itself', () => {
  const { reasons } = score(captionRegion());
  assert.ok(reasons.some((reason) => reason.includes('speaker blocks')));
  assert.ok(reasons.every((reason) => /^[+-]\d+ /.test(reason)));
});

test('reading an element never throws, whatever the page does', () => {
  // The page belongs to somebody else and is rewritten constantly. A selector
  // this code does not control throwing must not take the extension with it.
  const hostile = {
    matches() { throw new Error('detached'); },
    querySelectorAll() { throw new Error('detached'); },
    getAttribute() { return null; },
    closest() { return null; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
    textContent: '   ',
  };

  const described = describeElement(hostile, { innerHeight: 900 });
  assert.equal(described.speakerBlocks, 0);
  assert.equal(described.rect, null);
  assert.equal(describeElement(null, null).textLength, 0);
});

test('a whole synthetic page resolves to the caption strip', () => {
  const element = (attributes, extras = {}) => ({
    attributes,
    getAttribute: (name) => attributes[name] ?? null,
    matches: (selector) => (extras.matches || []).some((own) => selector.includes(own)),
    querySelectorAll: (selector) => (extras.contains?.[selector.slice(0, 6)] || []),
    closest: () => extras.overlay || null,
    getBoundingClientRect: () => extras.rect || { top: 0, left: 0, width: 0, height: 0 },
    textContent: extras.text || '',
  });

  const captions = element(
    { 'aria-live': 'polite' },
    {
      matches: ['.a4cQT'],
      contains: { '.nMcdL': [{}, {}] },
      rect: { top: 720, left: 0, width: 800, height: 90 },
      text: 'so the deployment goes out on Thursday',
    },
  );
  const chat = element(
    { 'aria-live': 'polite' },
    { rect: { top: 100, left: 0, width: 300, height: 600 }, text: 'x'.repeat(9000) },
  );

  const doc = { querySelectorAll: (selector) => (selector === '[aria-live="polite"]' ? [captions, chat] : []) };
  const found = findCaptionRoot(doc, { innerHeight: 900 });

  assert.ok(found, 'the caption strip should have been found');
  assert.equal(found.element, captions);
});
