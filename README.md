# Meet Live Translate — recognising something that has no API

[![CI](https://github.com/amois3/meet_live_translate_case_study/actions/workflows/ci.yml/badge.svg)](https://github.com/amois3/meet_live_translate_case_study/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A520-3c873a?logo=node.js&logoColor=white)
![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-2ea44f)
[![Licence](https://img.shields.io/badge/licence-review--only-6f42c1)](LICENSE)

**Meet Live Translate** is a Chrome extension and meeting-analysis service for
Google Meet: live English-to-Russian caption translation, audio-based recovery
when captions arrive incomplete, canonical transcripts, verified reports,
meeting chat and search. Manifest V3, Chrome 116 and newer. The implementation
is private.

This repository is the part that has to be right before any of that is worth
building: finding the captions in a page that offers no way to ask for them,
and recording without taking the microphone away from the call.

```bash
npm test          # 19 tests, no browser, no meeting, no network, no install
```

## Identify a thing by what it is, never by where it is

Meet has no caption API. The captions are a region of somebody else's page,
rendered with generated class names that change without notice and differ
between rollouts. So the extension has to recognise the region.

The first implementation scored candidates and then disqualified any whose
rectangle was empty or sat in the upper quarter of the viewport. That sounds
careful. Meet draws captions along the bottom, after all.

Chrome reports all-zero rectangles for tabs in background windows and for
minimised ones.

So the moment somebody looked at another window, every candidate measured as
zero, every candidate was disqualified, and the extension stopped recognising
captions it had been reading a second earlier — silently, with the overlay
still claiming everything was fine. Looking away from the meeting is precisely
when a person wants the transcript to keep running, which is what made this the
worst possible moment to go blind.

Geometry is still a useful way to choose between several candidates, so it is
kept as a hint with one rule attached: **it can add confidence, it can never
disqualify.** The test holds the difference to exactly one point.

```js
const visible   = score(captionRegion()).total;
const unmeasured = score(captionRegion({ rect: null })).total;
assert.ok(unmeasured >= MIN_SCORE);
assert.equal(visible - unmeasured, 1);   // geometry may only ever add
```

`null` and a rectangle of zeroes are deliberately different things here. One is
a missing measurement; the other would be information. Conflating them is the
whole bug.

### What is allowed to disqualify

One signal: hidden by CSS. `display:none` stays `display:none` whether or not
anybody is looking at the window, which is exactly what a rectangle does not
do. It disqualifies outright rather than subtracting — a penalty turned out not
to be enough, because a strongly identified region still cleared the threshold
while invisible, and a caption container Meet has hidden is not showing
captions however well it scores on everything else.

### What carries the decision when the class names change

Speaker blocks. Meet renders one per speaker, and that is structure rather than
cosmetics. A candidate with no recognised class, no live region and no
accessible name still passes on speaker blocks alone — which is the property
that lets the extension survive a rollout it was not told about.

## The microphone belongs to the meeting

Recovering an incomplete caption means falling back to audio, and recording is
where an extension can quietly break the call it is sitting in. A live Chrome
150 call had three simultaneous input streams open and the remote participant
could not hear anything.

Meet's own captions already carry the local speaker, so this side never needs
the physical microphone. The rule is absolute and mechanical, and
[`test/microphone.test.js`](test/microphone.test.js) checks it by **reading the
source rather than calling it**: exactly one `getUserMedia` in the module, its
source the tab and never a device, and no `echoCancellation`,
`noiseSuppression` or `autoGainControl` anywhere — because asking for
microphone processing is asking for the microphone, whatever the rest of the
request says.

Reading the file is the point. A test that calls a function can only tell you
about the path it called; what matters here is that no second path exists.

Two more shapes are pinned:

- a missing tab stream id is an **error, not a fallback**. "No stream, so open
  the default device instead" reads like robustness and is how the microphone
  gets taken;
- captured tab audio is played back to the destination, because tab capture
  mutes the tab for the listener. Forgetting that does not look like a recorder
  bug — it looks like the call dying the moment the extension starts, which is
  a support ticket about the wrong component.

## What is here

Two modules, 303 lines, **zero runtime dependencies** — node's standard library
and nothing else. 237 lines of tests across two files, run by `node --test`.

| Module | What it does |
|---|---|
| [`src/captionRoot.js`](src/captionRoot.js) | Describing, scoring and choosing a caption region, with the DOM confined to one reading function |
| [`src/capture.js`](src/capture.js) | The recorder and the single stream it may open |

The split is the testable part of the design. `describe()` is the only code
that touches the DOM and it only reads; `score()` and `pick()` are pure
functions over plain descriptions. The rule that broke in production is a rule
about scoring, and a rule that can only be exercised by joining a real meeting
is a rule that gets exercised once.

`score()` also returns its reasons. It costs nothing, and it means "why did it
pick that one?" has an answer that does not require attaching a debugger to
somebody else's call.

## Reading a page that belongs to somebody else

Meet's DOM is rewritten constantly and every element may be detached between
one frame and the next. `describe()` therefore treats a throwing selector as an
absent feature rather than an exception: a page changing under us is the normal
case, and an extension that crashes on it is an extension that stops
translating mid-sentence.

## Running it

```bash
npm test
```

Node 20 or newer. Nothing to install: no dependencies, no browser, no API key,
no meeting.

## The product this comes from

| | |
|---|---|
| Format | Chrome extension (Manifest V3) plus a meeting-analysis service |
| Minimum Chrome | 116 |
| Live | English-to-Russian caption translation while the meeting runs |
| Recovery | Audio-based repair when Meet delivers a caption incomplete |
| After the call | Canonical transcripts, verified reports, meeting chat and search |

## Documents

| | |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | how a caption reaches a reader, and where it can be lost |
| [DECISIONS.md](docs/DECISIONS.md) | why each choice was made and what it cost |

## Scope and licence

A public technical case study and reference core, not a distribution of the
private product, and not affiliated with or endorsed by Google. Contains no
product source, prompts, credentials or meeting data. Published for review and
discussion; see [LICENSE](LICENSE).
