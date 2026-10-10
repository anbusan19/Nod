# Landing page animations as GIFs

Rendered from the same code and numbers as the landing page, on the page's near-black background (`#070606`),
for use in slides. Regenerate with `docs/pitch/make-gifs.py` (needs Pillow, numpy, svgpathtools and the
Plus Jakarta Sans and Geist Mono TTFs in a `fonts/` folder).

| File | What it shows |
|---|---|
| nod-knot-assemble.gif | The Braille knot assembling through an ordered dither, then a dither sweep |
| nod-dither-word.gif | "Nod." as dots: assemble, sweep, settle |
| nod-terminal-propose.gif | The agent's `nod.propose(...)` typing out, then "Sent" |
| nod-claim-vs-reality.gif | Honest agent versus misleading agent, matches versus blocked |
| nod-limits-slider.gif | An amount sweeping across Auto, Nod and Block |
| nod-approve-flow.gif | Decode, hold to approve, fingerprint, signed |
| nod-fingerprint.gif | The fingerprint drawing in, on its own |

## Architecture and transparent knot

| File | What it shows |
|---|---|
| nod-architecture.gif | The architecture as modules in containers (agent, backend, phone, wallet, Solana), with the seven steps of one proposal highlighted in turn, 1600x900 |
| nod-knot-assemble-transparent.gif | The knot assembling, no background (lavender, for dark slides) |
| nod-knot-assemble-transparent-blue.gif | The same in the deeper blue, for light slides |
| nod-knot-lavender.png, nod-knot-blue.png, nod-knot-white.png | The still knot on a transparent background, 1800x1800 |

GIF transparency is on or off per pixel, so the animated knots have slightly harder dot edges than the PNGs.
Use the PNGs when you only need the still knot.
