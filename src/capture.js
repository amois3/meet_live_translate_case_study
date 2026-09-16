/**
 * The recorder, and the one stream it is allowed to open.
 *
 * The extension can recover a caption Meet delivered incomplete by falling
 * back to the audio. To do that it records — and recording is where an
 * extension can quietly break the meeting it is sitting in.
 *
 * On a live Chrome 150 call three simultaneous input streams were open and the
 * remote participant could not hear anything. Meet already carries the local
 * speaker in its own captions, so this side never needs the physical
 * microphone: the tab's own audio is both sufficient and incapable of
 * competing for the device.
 *
 * The rule is therefore absolute and mechanical, which is why
 * `test/microphone.test.js` reads this file rather than calling it:
 *
 *   - exactly one getUserMedia call in this module;
 *   - its source is the tab, never a device;
 *   - no microphone processing constraints anywhere, because asking for
 *     echo cancellation or gain control is asking for the device.
 */

export const TAB_ONLY = 'tab';

/**
 * Open the tab's audio, and nothing else.
 *
 * `streamId` comes from the extension's own tab-capture permission and is
 * bound to one tab for one grant; there is no device id anywhere in this
 * path, so there is nothing here that could reach the microphone even if the
 * constraints were wrong.
 */
export async function openTabAudio(media, streamId) {
  if (!streamId) throw new Error('no tab stream id: refusing to fall back to a device');

  return media.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: TAB_ONLY,
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });
}

/**
 * Tab capture silences the tab for the person listening unless the audio is
 * played back. Forgetting this does not look like a bug in the recorder: it
 * looks like the meeting going quiet the moment the extension starts, which
 * is a support ticket about the wrong component.
 */
export function playBackThrough(context, stream) {
  const source = context.createMediaStreamSource(stream);
  source.connect(context.destination);
  return source;
}
