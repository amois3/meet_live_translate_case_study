/**
 * The extension must never compete with the meeting for the microphone.
 *
 * A live Chrome 150 call had three simultaneous input streams open and the
 * remote participant could not hear anything. Meet's own captions already
 * carry the local speaker, so the recorder needs the tab's audio and never a
 * device.
 *
 * This is checked by reading the source rather than by calling it, because
 * what matters is that no second path exists — and a test that calls a
 * function can only tell you about the path it called. The same test lives in
 * the product, where it also reads the manifest and the settings page.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TAB_ONLY, openTabAudio, playBackThrough } from '../src/capture.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const capture = fs.readFileSync(path.join(ROOT, 'src', 'capture.js'), 'utf8');
const code = capture
  .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments, including the one above the rule
  .replace(/^\s*\/\/.*$/gm, ' ');       // and line comments

test('the recorder opens exactly one stream', () => {
  const calls = code.match(/getUserMedia\s*\(/g) || [];
  assert.equal(calls.length, 1, 'a second media path is a second way to take the microphone');
});

test('the one stream it opens is the tab, never a device', () => {
  assert.match(code, /chromeMediaSource:\s*TAB_ONLY|chromeMediaSource:\s*['"]tab['"]/);
  assert.equal(TAB_ONLY, 'tab');
  assert.doesNotMatch(code, /deviceId|audioinput|enumerateDevices/);
});

test('no microphone processing is requested anywhere', () => {
  // echoCancellation, noiseSuppression and autoGainControl are constraints on
  // a physical input. Asking for them is asking for the device, whatever the
  // rest of the request says.
  assert.doesNotMatch(code, /echoCancellation|noiseSuppression|autoGainControl/);
});

test('a missing tab stream is an error, not a fallback', async () => {
  // The dangerous shape is "no stream id, so open the default device instead",
  // which reads like robustness and is how the microphone gets taken.
  await assert.rejects(() => openTabAudio({ getUserMedia: async () => 'device' }, ''), /refusing/);
});

test('the request actually sent carries the tab source and no video', async () => {
  let sent = null;
  const media = { getUserMedia: async (constraints) => { sent = constraints; return 'stream'; } };

  const stream = await openTabAudio(media, 'tab-stream-42');

  assert.equal(stream, 'stream');
  assert.equal(sent.video, false);
  assert.equal(sent.audio.mandatory.chromeMediaSource, 'tab');
  assert.equal(sent.audio.mandatory.chromeMediaSourceId, 'tab-stream-42');
});

test('captured tab audio is played back, or the meeting goes silent', () => {
  // Tab capture mutes the tab for the listener unless the stream is routed to
  // the destination. Forgetting it does not look like a recorder bug; it looks
  // like the call dying the moment the extension starts.
  const connected = [];
  const context = {
    createMediaStreamSource: (stream) => ({ connect: (to) => connected.push([stream, to]) }),
    destination: 'speakers',
  };

  playBackThrough(context, 'captured');

  assert.deepEqual(connected, [['captured', 'speakers']]);
});
