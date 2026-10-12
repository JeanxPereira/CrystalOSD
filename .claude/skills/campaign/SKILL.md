---
name: campaign
description: Use when several PS2 OSD functions or questions must become verified facts at once — running the measure-campaign workflow, what it costs, how to read its result, and what the session still does by hand (facts pages, run_all, commits).
---
# campaign — many questions, the same three steps each

- Only when Jean opted in to multi-agent work. One question, or one already scouted: do it inline by the `measure` skill instead.
- Run: `Workflow({name: "measure-campaign", args: {items: ["<function or question, with the HDD OSD address when known>", ...], limit: 3}})`. Each item goes scout → verifier-writer → two refuters (arithmetic lens, evidence lens). Agents are the project's own (`.claude/agents/`, all on the mid tier).
- `limit` caps items in flight; emulator sessions are further capped by `with_emulator.mjs` (`watson.json` instances). Three is right for interpreter captures on this machine.
- Read the result per item: `passed` false, or fewer than 2 `confirmed`, means not verified — read the refutation, fix by a new item or by hand; never write the fact from a refuted item.
- Afterwards, the session (not the workflow): `node References/scripts/run_all.mjs --changed`; `doc-writer` per facts page touched (pages are shared, so one writer per page, after all items); `lint_facts.mjs`; commit only if Jean asked (`commit` skill).
- Cost: brief items, never paste history into them; agents read files themselves. Prefer fresh agents (this workflow, the named agents) over forks of the session.
