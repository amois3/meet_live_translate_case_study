/**
 * Finding the captions.
 *
 * Google Meet does not offer an API for its captions. They are a region of the
 * page, rendered by class names that are generated, change without notice, and
 * differ between rollouts. So the extension has to recognise the region, and
 * the rule that matters is this one:
 *
 *   A caption root is identified by WHAT IT IS, never by where it happens to
 *   sit on screen.
 *
 * The first implementation disqualified any candidate whose rectangle was
 * empty or sat in the upper quarter of the viewport — a reasonable-sounding
 * heuristic, since Meet draws captions along the bottom. Chrome reports
 * all-zero rectangles for tabs in background windows and for minimised ones.
 * The moment somebody looked at another window, every candidate measured as
 * zero, every candidate was disqualified, and the extension stopped
 * recognising captions it had been reading a second earlier. Silently, with
 * the overlay still saying everything was fine — and looking away from the
 * meeting is exactly when a person most wants the transcript to keep running.
 *
 * Geometry is still useful for choosing between several candidates, so it is
 * kept as a hint: it can add confidence, it can never disqualify.
 *
 * The module is split so that the judgement is testable without a browser.
 * `describe()` is the only part that touches the DOM and does nothing but
 * read; `score()` and `pick()` are pure functions over plain descriptions,
 * which is what the tests exercise.
 */

export const KNOWN_ROOT_SELECTOR = '.a4cQT, [jscontroller="D1tHje"], [jsname="tgaKEf"]';
export const SPEAKER_BLOCK_SELECTOR = '.nMcdL';
export const OVERLAY_SELECTOR = '[role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"]';
export const UI_SELECTOR =
  'button, input, textarea, select, svg, [role="button"], i.google-material-icons';

const CAPTION_LABEL = /caption|subtitle|субтитр/i;

/** Widest first. Order is not priority — everything matched is scored. */
export const CANDIDATE_SELECTORS = [
  'div[jscontroller="D1tHje"]',
  'div.a4cQT',
  'div[jsname="tgaKEf"]',
  'div[role="region"][aria-label*="caption" i]',
  'div[role="region"][aria-label*="subtitle" i]',
  'div[role="region"][aria-label*="субтитр" i]',
  '[aria-live="polite"]',
  '[aria-live="assertive"]',
];

export const MIN_SCORE = 3;
export const MIN_TEXT = 3;
export const MAX_TEXT = 2500;

/**
 * What a candidate is, as far as the decision is concerned.
 *
 * Every field is a fact about the element itself except `rect`, which is a
 * measurement the browser may decline to make. `null` there means "not
 * measured", and that is deliberately different from a rectangle of zeroes:
 * one is missing information, the other is information.
 */
export function emptyDescription() {
  return {
    knownRoot: false,
    speakerBlocks: 0,
    liveRegion: false,
    captionLabel: false,
    insideOverlay: false,
    cssHidden: false,
    uiElements: 0,
    textLength: 0,
    rect: null,
    viewportHeight: 0,
  };
}

/**
 * The score, and the reasons for it.
 *
 * Returning the reasons costs nothing and means a support question — "why did
 * it pick that one?" — has an answer that does not require a debugger.
 */
export function score(description) {
  const d = { ...emptyDescription(), ...description };
  const reasons = [];
  let total = 0;

  const add = (points, why) => {
    total += points;
    reasons.push(`${points > 0 ? '+' : ''}${points} ${why}`);
  };

  // Meet renders one block per speaker. Their presence is the strongest
  // signal there is, and it is structural rather than cosmetic.
  if (d.speakerBlocks > 0) add(Math.min(4, 2 + d.speakerBlocks), 'speaker blocks');
  if (d.knownRoot) add(3, 'known caption container');
  if (d.captionLabel) add(2, 'accessible name says captions');
  if (d.liveRegion) add(1, 'live region');

  // Hidden by CSS is the one kind of invisibility still reported honestly by
  // a background tab — `display:none` is `display:none` whether or not anyone
  // is looking at the window. So it is the one signal allowed to disqualify,
  // and it disqualifies outright rather than subtracting: a caption container
  // Meet has hidden is not showing captions, however well it scores on
  // everything else. A penalty here was not enough — a strongly identified
  // region still cleared the threshold while invisible.
  if (d.cssHidden) {
    reasons.push('disqualified: hidden by CSS');
    return { total: -Infinity, reasons, disqualified: true };
  }

  // A caption region is text. A panel full of controls is a panel.
  if (d.uiElements > 3) add(-3, 'too many controls to be a transcript');
  if (d.insideOverlay) add(-2, 'inside a dialog or menu');

  if (d.textLength < MIN_TEXT) add(-2, 'no text to read');
  if (d.textLength > MAX_TEXT) add(-2, 'far more text than captions carry');

  // Geometry, and only ever upwards. A candidate in the lower half of the
  // viewport is likelier to be the caption strip — but a candidate the
  // browser refused to measure is not thereby disqualified.
  if (d.rect && d.viewportHeight > 0) {
    const middle = d.rect.top + d.rect.height / 2;
    if (middle > d.viewportHeight * 0.5) add(1, 'sits in the lower half');
  }

  return { total, reasons, disqualified: false };
}

/**
 * The best candidate, or null.
 *
 * Ties go to the earlier candidate, which keeps the result stable across
 * repaints: with equal scores the choice must not depend on the order
 * `querySelectorAll` happened to return things in this frame.
 */
export function pick(descriptions, { minScore = MIN_SCORE } = {}) {
  let best = null;
  let bestScore = -Infinity;

  descriptions.forEach((description, index) => {
    const { total } = score(description);
    if (total > bestScore) {
      bestScore = total;
      best = { index, description, score: total };
    }
  });

  if (!best || bestScore < minScore) return null;
  return best;
}

/**
 * Read one element into a description. The only part that touches the DOM,
 * and it only reads.
 *
 * `view` is the window the element belongs to, passed rather than reached for,
 * because in an extension the element can live in an iframe whose `window` is
 * not the one this code is running in.
 */
export function describe(element, view) {
  const d = emptyDescription();
  if (!element) return d;

  const matches = (selector) => {
    try {
      return Boolean(element.matches && element.matches(selector));
    } catch {
      return false;
    }
  };
  const countOf = (selector) => {
    try {
      return element.querySelectorAll ? element.querySelectorAll(selector).length : 0;
    } catch {
      return 0;
    }
  };

  d.knownRoot = matches(KNOWN_ROOT_SELECTOR);
  d.speakerBlocks = countOf(SPEAKER_BLOCK_SELECTOR) + (matches(SPEAKER_BLOCK_SELECTOR) ? 1 : 0);
  d.uiElements = countOf(UI_SELECTOR);

  const live = element.getAttribute ? element.getAttribute('aria-live') : null;
  d.liveRegion = live === 'polite' || live === 'assertive';

  const label = element.getAttribute ? element.getAttribute('aria-label') || '' : '';
  d.captionLabel = CAPTION_LABEL.test(label);

  d.insideOverlay = Boolean(element.closest && element.closest(OVERLAY_SELECTOR));
  d.textLength = String(element.textContent || '').replace(/\s+/g, ' ').trim().length;
  d.cssHidden = isCssHidden(element, view);
  d.rect = measure(element);
  d.viewportHeight = (view && view.innerHeight) || 0;

  return d;
}

/** Hidden by CSS — the only invisibility a background tab still reports truthfully. */
export function isCssHidden(element, view) {
  const style = view && view.getComputedStyle ? view.getComputedStyle(element) : null;
  if (!style) return false;
  if (style.visibility === 'hidden' || style.display === 'none') return true;
  return Number(style.opacity === '' || style.opacity == null ? 1 : style.opacity) <= 0.05;
}

/**
 * A rectangle, or null when the browser declined to supply one.
 *
 * All-zero is not a small element. It is a background or minimised window
 * refusing to lay out, and treating it as a measurement is the bug this file
 * exists because of.
 */
export function measure(element) {
  const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
  if (!rect) return null;
  if (!rect.width && !rect.height && !rect.top && !rect.left) return null;
  return rect;
}

/** Collect candidates from a document and choose one. */
export function findCaptionRoot(doc, view, options) {
  const seen = new Set();
  const elements = [];

  for (const selector of CANDIDATE_SELECTORS) {
    let found = [];
    try {
      found = Array.from(doc.querySelectorAll(selector));
    } catch {
      found = [];
    }
    for (const element of found) {
      if (seen.has(element)) continue;
      seen.add(element);
      elements.push(element);
    }
  }

  const chosen = pick(
    elements.map((element) => describe(element, view)),
    options,
  );
  return chosen ? { element: elements[chosen.index], score: chosen.score } : null;
}
