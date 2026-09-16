# How a caption reaches a reader

```
  Meet's page          the extension                    the reader
  ───────────          ─────────────                    ──────────
  caption region ──> find it        (captionRoot.js)
                     read it        (MutationObserver)
                     translate it   (service)      ──>  overlay, live
        │
        └─ incomplete? ──> tab audio (capture.js)  ──>  repaired line
```

Every arrow is somewhere a line can be lost, and the two in this repository are
the two that were losing them.

## Finding it

There is no API. The captions are a region of a page belonging to somebody
else, drawn with generated class names that differ between rollouts, so the
region has to be recognised rather than requested.

Recognition is a score over candidates:

| Signal | Weight | Why |
|---|---:|---|
| Speaker blocks | up to +4 | Structural. Meet renders one per speaker, and that outlives the class names |
| Known container | +3 | Fast and usually right, never relied on alone |
| Accessible name says captions | +2 | Meet's own label, in any of three languages |
| Live region | +1 | Weak on its own — chat is a live region too |
| More than three controls | −3 | A panel of buttons is a panel |
| Inside a dialog or menu | −2 | Probably a settings preview |
| No text, or far too much | −2 | A transcript has a size |
| Lower half of the viewport | +1 | A hint, and only ever upwards |
| **Hidden by CSS** | **disqualifies** | The one invisibility a background tab still reports honestly |

The threshold is 3. Below it the answer is nothing rather than the least bad
candidate: reading the wrong region produces a transcript of the wrong thing,
which is worse than an empty one because it looks like it worked.

## The layering, and why it exists

`describe()` is the only function that touches the DOM, and it only reads.
`score()` and `pick()` are pure functions over plain objects.

The rule that broke in production was a scoring rule. Had it lived inside a
function that needs a live meeting to run, it would have been exercised once,
by hand, in a foreground window — which is the one configuration in which it
works.

## Reading somebody else's page

Meet rewrites its DOM constantly and an element may be detached between frames.
`describe()` treats a throwing selector as an absent feature. A page changing
underneath is the normal case, not an exceptional one, and an extension that
crashes on it stops translating mid-sentence.

The window is passed in rather than reached for, because in an extension the
element can belong to an iframe whose `window` is not the one this code runs
in.

## Recording

Only when a caption arrives incomplete, and only ever from the tab.

`openTabAudio` takes a stream id issued by the extension's own tab-capture
grant. There is no device id anywhere in the path, so there is nothing that
could reach the microphone even if the constraints were wrong — and the
constraints are checked by a test that reads the file.

Captured tab audio is routed back to the destination, because capturing it
mutes the tab for the person listening.
