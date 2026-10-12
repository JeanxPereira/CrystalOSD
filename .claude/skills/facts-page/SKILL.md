---
name: facts-page
description: Use when writing or changing a page under facts/ — the page contract (documentation, not a lab notebook), how statements cite their verifier, how to supersede instead of appending, and the lint that enforces it.
---
# facts-page — what the system is, with its proof

`facts/` is the only trusted store. A page states what the PS2 OSD does, in present tense, and
every measured statement says which script reproduces it.

- **Name the build** of every address: HDD OSD 1.10U (canon) or ROM 2.30. Where both exist, give both.
- **Mark how it is known**: *verified* (a script recomputes it bit for bit: name it and a capture), *measured* (seen in a capture, not recomputed), *read* (from disassembly, address range given). Nothing unmarked.
- **The rule, not the number**: the expression and its writer, then the value it gives.
- **No account of the work**: no "draft", "worker", "fork", "we found", "at first", "was a mismatch first", "nothing here was edited", dates of who did what. If a later measurement corrects a page, rewrite the statement; do not append a "correction" section.
- **One subject per page**; cross-link instead of repeating. `README.md` holds the page table and the list of what is left; `verification.md` the verifier × build matrix.
- **Lint**: `node References/scripts/lint_facts.mjs facts/<page>.md` runs after every edit (hook) and must end `FOUND`.
- A page written from a worker's draft is rewritten, not pasted: drafts narrate, pages state.
