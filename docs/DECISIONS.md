# Decisions

## Geometry may add confidence and never disqualify

**Chosen:** position and size can raise a score, never lower it or veto it.

**Alternative:** the original — reject candidates whose rectangle is empty or
sits high in the viewport, which is both cheap and usually correct.

**Cost:** a caption-shaped region somewhere unexpected can now win. In exchange
the extension keeps working in a background window, where Chrome reports every
rectangle as zero. The original rule was right about where captions usually are
and wrong about what a measurement means, and the failure it produced was
silent and appeared exactly when a person had looked away.

## Hidden by CSS disqualifies; a missing rectangle does not

**Chosen:** `display:none`, `visibility:hidden` and an opacity at or below 0.05
end the candidate outright. A `null` rectangle changes nothing.

**Why the asymmetry:** computed style is reported honestly regardless of window
state; geometry is not. The two look like the same kind of fact — "can this be
seen?" — and treating them alike is what produced the bug.

**Why outright rather than a penalty:** a penalty was tried here and was not
enough. A region with speaker blocks and a known container still cleared the
threshold while invisible. A container Meet has hidden is not showing captions,
however well it scores on everything else.

## The DOM is confined to one reading function

**Chosen:** `describe()` touches the DOM; `score()` and `pick()` are pure.

**Cost:** one more layer, and a description that has to be kept in step with
what the scorer needs.

**In exchange:** the judgement is testable as plain data. Nineteen tests run in
under a second with no browser, no meeting and nothing installed, and the rule
that broke in production is exercised on every push instead of once by hand in
the one configuration where it worked.

## A throwing selector is an absent feature

**Chosen:** every DOM read is wrapped, and a failure means "this signal is not
available".

**Alternative:** let it propagate, on the grounds that swallowing errors hides
problems.

**Why not:** the page belongs to Google and is rewritten continuously; elements
detach between frames as a matter of routine. Here an exception does not
surface a problem, it stops the translation mid-sentence. The signals that
matter are positive ones, so a missing signal degrades the score rather than
corrupting it.

## Below the threshold the answer is nothing

**Chosen:** if no candidate reaches 3, return null instead of the best of a bad
set.

**Why:** a transcript of the wrong region is worse than no transcript, because
it looks like it worked. An empty overlay is a visible failure; a confident
translation of the chat panel is not.

## The microphone rule is checked by reading the file

**Chosen:** a test that greps the source for a second `getUserMedia`, for a
device id, and for microphone processing constraints.

**Alternative:** call the function and assert on the constraints it passes,
which is a more conventional test.

**Why both, but this one especially:** calling a function tells you about the
path you called. The property here is that *no other path exists*, and the only
way to state that is over the text of the module. Comments are stripped first,
so the paragraph explaining the rule is not mistaken for breaking it.

## No stream id is an error, not a fallback

**Chosen:** `openTabAudio` throws when the tab stream id is missing.

**Why:** the alternative — fall back to the default input — is how the
microphone gets taken, and it is written by somebody being careful. Defaults are
where this class of bug lives.
