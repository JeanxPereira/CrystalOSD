---
name: commit
description: Use when committing in CrystalOSD or Watson — explicit paths, the message form, what never goes in, and who may commit what.
---
# commit

- **CrystalOSD: commit only when Jean asked.** Watson: tested branches may be merged into local `main` freely; never push either repository.
- Stage explicit paths, one by one (`git add -A`, `.`, a directory are refused by the hook). Check `git status --short` before and after.
- Message: `Type(Scope): Short imperative description`, at most 72 characters; Types `Fix Feat Refactor Perf Build Docs GS`; Scopes `Core Renderer App GS Shaders CI Project` (Watson: `Launch Trace Server Emulator`). Body optional, explains why.
- Never any attribution to Claude or AI: no `Co-Authored-By`, no "Generated with" (the hook refuses it).
- Never `--amend`, `rebase`, `reset --hard`, force push, `git clean` (refused unless `CLOCK_ALLOW=1`, which only Jean sets).
- Before committing verifiers or the model: `node References/scripts/run_all.mjs --changed` passes. Before committing facts/: `lint_facts.mjs` passes.
- Never commit dumps, BIOS images, textures, captures (`References/` is ignored except `scripts/`, `readings/`, `model/`, `lib/`).
