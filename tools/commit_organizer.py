#!/usr/bin/env python3
"""commit_organizer.py - plan and create atomic Conventional Commits.

Scans the working tree, classifies each changed path into a Conventional
Commits group ((type, scope)), and proposes one commit per group following
the convention defined in CLAUDE.md:

  decomp(scope)   matching decompiled functions
  build(scope)    Makefile / splat / configure.py / linker scripts
  docs(scope)     *.md files, comments
  tools(scope)    scripts, tools, CI
  fix(scope)      fixes to previously decompiled code or scripts
  chore(scope)    minor maintenance, formatting, renames
  feat(scope)     new project features

Usage:
    python3 tools/commit_organizer.py                 plan only (default)
    python3 tools/commit_organizer.py --interactive   approve each group, edit subject
    python3 tools/commit_organizer.py --commit        create all commits non-interactively
    python3 tools/commit_organizer.py --include-deleted  include git-tracked deletions
    python3 tools/commit_organizer.py --include-staged   include already-staged files

Notes:
    - Submodule pointer bumps are detected and grouped separately (tools(deps)).
    - Files matching .gitignore are skipped entirely.
    - Subject lines are auto-derived from filenames; override via --interactive.
    - HEREDOC commit messages are used; never amends; never --no-verify.
"""

from __future__ import annotations

import argparse
import fnmatch
import os
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path


# ---------------------------------------------------------------------------
# classification rules
# ---------------------------------------------------------------------------
# Order matters: first match wins.
# Tuple format: (glob, type, scope, subject_template)
#   - glob is matched against the repo-relative path
#   - subject_template uses {basename}, {count}, {names}
CLASSIFY_RULES: list[tuple[str, str, str, str | None]] = [
    # ---- decomp source files (per subsystem) ------------------------------
    ("src/stubs/**",                     "chore",  "stubs",        "promote stubs"),
    ("src/browser/**.c",                 "decomp", "browser",      None),
    ("src/cdvd/**.c",                    "decomp", "cdvd",         None),
    ("src/clock/**.c",                   "decomp", "clock",        None),
    ("src/config/**.c",                  "decomp", "config",       None),
    ("src/core/**.c",                    "decomp", "core",         None),
    ("src/graph/**.c",                   "decomp", "graph",        None),
    ("src/history/**.c",                 "decomp", "history",      None),
    ("src/module/**.c",                  "decomp", "module",       None),
    ("src/opening/**.c",                 "decomp", "opening",      None),
    ("src/sound/**.c",                   "decomp", "sound",        None),
    ("src/**.h",                         "decomp", "headers",      "add headers"),
    ("include/**.h",                     "decomp", "headers",      "add headers"),

    # ---- assembly (manual edits should be rare) ---------------------------
    ("asm/**.s",                         "build",  "asm",          "regenerate asm"),

    # ---- build infrastructure --------------------------------------------
    ("Makefile",                         "build",  "",             "update Makefile"),
    ("splat_config.yml",                 "build",  "splat",        "update splat config"),
    ("configure.py",                     "build",  "splat",        "update configure.py"),
    ("*.ld",                             "build",  "linker",       "update linker script"),
    ("symbol_addrs.txt",                 "build",  "symbols",      "update symbol_addrs.txt"),
    ("undefined_*.txt",                  "build",  "splat",        "regenerate splat metadata"),
    ("config/build.sha1",                "build",  "verify",       "update build.sha1"),

    # ---- orchestrator (feat scope) ---------------------------------------
    ("tools/orchestrator/**.py",         "feat",   "orchestrator", None),
    ("tools/orchestrator/prompts/**",    "feat",   "orchestrator", "update orchestrator prompts"),
    ("tools/orchestrator/**.md",         "docs",   "orchestrator", "document orchestrator"),
    (".orchestrator/config.yml",         "feat",   "orchestrator", "add orchestrator config"),
    (".orchestrator/**",                 "chore",  "orchestrator", "update orchestrator state"),

    # ---- other tools -----------------------------------------------------
    ("tools/decomp-permuter",            "tools",  "deps",         "bump decomp-permuter submodule"),
    ("tools/transmuter",                 "tools",  "deps",         "bump transmuter submodule"),
    ("tools/permuter/**",                "tools",  "permuter",     None),
    ("tools/**.py",                      "tools",  "",             None),
    ("tools/**.sh",                      "tools",  "",             None),
    ("tools/**.json",                    "tools",  "manifests",    "update manifests"),
    ("tools/**.md",                      "docs",   "tools",        "document tools/"),

    # ---- agent / IDE config ----------------------------------------------
    (".claude/commands/**",              "docs",   "claude",       "add slash command"),
    (".claude/skills/**",                "docs",   "claude",       "update skills"),
    (".claude/subagents/**",             "docs",   "claude",       "update subagents"),
    (".claude/settings*.json",           "chore",  "claude",       "update settings"),

    # ---- top-level docs --------------------------------------------------
    ("README.md",                        "docs",   "",             "update README"),
    ("CLAUDE.md",                        "docs",   "",             "update CLAUDE.md"),
    ("PS2_PROJECT_STATE.md",             "docs",   "state",        "update project state"),
    ("reference/**.md",                  "docs",   "reference",    None),
    ("**.md",                            "docs",   "",             None),

    # ---- git plumbing / chore --------------------------------------------
    (".gitignore",                       "chore",  "",             "update .gitignore"),
    (".gitmodules",                      "chore",  "",             "update submodules"),
    (".github/**",                       "tools",  "ci",           "update CI"),
    (".vscode/**",                       "chore",  "",             "update editor config"),
]

NEVER_COMMIT_GLOBS = [
    "OSDSYS_A_XLF_decrypted_unpacked.elf",
    "*.rom",
    "*.bios",
    ".env",
    ".env.local",
    ".orchestrator/secrets.env",
    ".orchestrator/secrets.local.env",
    ".orchestrator/log.jsonl",
    ".orchestrator/queue.json",
    ".orchestrator/ask_human/**",
    ".orchestrator/takeaways.md",
    ".orchestrator/briefs/**",
    "src/stubs/**",
    "build/**",
    "**/__pycache__/**",
    "**/*.pyc",
]

TYPE_ORDER = ["build", "feat", "tools", "decomp", "fix", "docs", "chore"]


# ---------------------------------------------------------------------------
# data classes
# ---------------------------------------------------------------------------


@dataclass
class Change:
    status: str
    path: str

    @property
    def is_deletion(self) -> bool:
        return "D" in self.status

    @property
    def is_submodule_bump(self) -> bool:
        # "M" on a submodule path; we'll detect via .gitmodules below
        return False  # determined contextually


@dataclass
class CommitGroup:
    ctype: str
    scope: str
    files: list[str]
    subject: str

    def header(self) -> str:
        if self.scope:
            return f"{self.ctype}({self.scope}): {self.subject}"
        return f"{self.ctype}: {self.subject}"


# ---------------------------------------------------------------------------
# git helpers
# ---------------------------------------------------------------------------


def run(cmd: list[str], check: bool = True) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} failed: {proc.stderr.strip()}")
    return proc.stdout


def repo_root() -> Path:
    return Path(run(["git", "rev-parse", "--show-toplevel"]).strip())


def _expand_untracked_dir(path: str) -> list[str]:
    """git status reports an untracked directory as a single path; expand to files."""
    raw = run(["git", "ls-files", "--others", "--exclude-standard", "--", path])
    return [line.strip() for line in raw.splitlines() if line.strip()]


def list_changes(include_staged: bool, include_deleted: bool) -> list[Change]:
    raw = run(["git", "status", "--porcelain"])
    out: list[Change] = []
    for line in raw.splitlines():
        if not line:
            continue
        status = line[:2]
        path = line[3:].strip()
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        if path.startswith('"') and path.endswith('"'):
            path = path[1:-1]
        if not include_staged and status[0] != " " and status[0] != "?":
            # already staged; skip unless requested
            continue
        if "D" in status and not include_deleted:
            continue
        # untracked entries that point to a directory (trailing /) need expansion
        if status == "??" and path.endswith("/"):
            for f in _expand_untracked_dir(path.rstrip("/")):
                out.append(Change(status=status, path=f))
            continue
        out.append(Change(status=status, path=path))
    return out


def is_submodule(path: str) -> bool:
    if not Path(".gitmodules").exists():
        return False
    body = Path(".gitmodules").read_text()
    return bool(re.search(rf"path\s*=\s*{re.escape(path)}\b", body))


def is_excluded(path: str) -> bool:
    for pat in NEVER_COMMIT_GLOBS:
        if fnmatch.fnmatch(path, pat):
            return True
    return False


# ---------------------------------------------------------------------------
# classification + grouping
# ---------------------------------------------------------------------------


def classify(path: str) -> tuple[str, str, str | None]:
    for pattern, ctype, scope, template in CLASSIFY_RULES:
        if fnmatch.fnmatch(path, pattern):
            return ctype, scope, template
    return "chore", "", None


def derive_subject(
    ctype: str,
    scope: str,
    files: list[str],
    template: str | None,
    *,
    all_new: bool = False,
) -> str:
    verb = "add" if all_new else "update"

    if template:
        return template.format(
            verb=verb,
            count=len(files),
            names=", ".join(Path(f).stem for f in files[:3]),
            basename=Path(files[0]).name if files else "",
        )

    bases = [Path(f).stem for f in files]

    if ctype == "decomp":
        if scope == "headers":
            return f"{verb} {len(files)} header{'s' if len(files) > 1 else ''}"
        if len(files) == 1:
            return f"reconstruct {bases[0]}"
        if len(files) <= 3:
            return f"reconstruct {', '.join(bases)}"
        return f"reconstruct {len(files)} functions"

    if ctype == "feat":
        if scope == "orchestrator":
            return "add LLM-driven decomp orchestrator"
        return f"add {scope or 'feature'}"

    if ctype == "tools":
        if scope == "deps":
            return "bump submodules"
        if len(files) == 1:
            return f"{verb} {bases[0]}"
        if scope:
            return f"{verb} {scope} helpers"
        return f"{verb} {len(files)} scripts"

    if ctype == "docs":
        if len(files) == 1:
            base = Path(files[0]).name
            if base == "README.md":
                return f"document {scope or 'project'}"
            return f"{verb} {base}"
        return f"document {scope or 'changes'}"

    if ctype == "build":
        return f"{verb} {scope or 'build'} infrastructure"

    if ctype == "fix":
        return f"fix {scope or 'issue'}"

    if ctype == "chore":
        return f"{verb} {scope or 'config'}"

    return verb


def group_changes(changes: list[Change]) -> list[CommitGroup]:
    # bucket key is (ctype, scope) only — same scope merges into one commit
    buckets: dict[tuple[str, str], list[tuple[str, str | None, str]]] = defaultdict(list)
    for c in changes:
        if is_excluded(c.path):
            continue
        if is_submodule(c.path):
            buckets[("tools", "deps")].append((c.path, "bump submodules", c.status))
            continue
        ctype, scope, template = classify(c.path)
        buckets[(ctype, scope)].append((c.path, template, c.status))

    groups = []
    for (ctype, scope), entries in buckets.items():
        files = [e[0] for e in entries]
        statuses = [e[2] for e in entries]
        # take first non-None template if all entries share it; else auto-derive
        templates = {e[1] for e in entries if e[1]}
        if len(templates) == 1:
            template = templates.pop()
        else:
            template = None
        all_new = all(s == "??" for s in statuses)
        subj = derive_subject(ctype, scope, files, template, all_new=all_new)
        groups.append(CommitGroup(ctype=ctype, scope=scope, files=sorted(files), subject=subj))

    groups.sort(key=lambda g: (TYPE_ORDER.index(g.ctype) if g.ctype in TYPE_ORDER else 99, g.scope))
    return groups


# ---------------------------------------------------------------------------
# rendering
# ---------------------------------------------------------------------------


def render_plan(groups: list[CommitGroup]) -> str:
    lines = []
    for i, g in enumerate(groups, 1):
        lines.append(f"[{i}] {g.header()}")
        for f in g.files:
            lines.append(f"    {f}")
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# committing
# ---------------------------------------------------------------------------


def stage_paths(paths: list[str]) -> None:
    if not paths:
        return
    run(["git", "add", "--", *paths])


def reset_index() -> None:
    run(["git", "reset", "HEAD", "--"], check=False)


def create_commit(
    group: CommitGroup,
    body: str = "",
    dry_run: bool = False,
    co_author: str | None = None,
) -> bool:
    msg = group.header()
    trailer_block = ""
    if body.strip():
        trailer_block += body.strip() + "\n"
    if co_author:
        if trailer_block and not trailer_block.endswith("\n\n"):
            trailer_block += "\n"
        trailer_block += f"Co-Authored-By: {co_author}\n"
    if trailer_block:
        msg += "\n\n" + trailer_block.rstrip() + "\n"

    if dry_run:
        print(f"  (dry-run) git commit -m '{group.header()}'")
        return True

    proc = subprocess.run(
        ["git", "commit", "-m", msg],
        capture_output=True,
        text=True,
    )
    sys.stdout.write(proc.stdout)
    sys.stderr.write(proc.stderr)
    return proc.returncode == 0


def prompt(question: str, default: str = "y") -> str:
    suffix = " [Y/n] " if default == "y" else " [y/N] "
    try:
        ans = input(question + suffix).strip().lower()
    except EOFError:
        ans = ""
    return ans or default


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="organize working tree into atomic Conventional Commits")
    p.add_argument("--commit", action="store_true", help="create commits non-interactively")
    p.add_argument("--interactive", action="store_true", help="approve each group, edit subject")
    p.add_argument("--include-deleted", action="store_true", help="include git deletions")
    p.add_argument("--include-staged", action="store_true", help="include files already staged")
    p.add_argument("--dry-run", action="store_true", help="preview commit commands without running")
    p.add_argument(
        "--co-author",
        default=os.environ.get("COMMIT_CO_AUTHOR"),
        help="append Co-Authored-By trailer (default: $COMMIT_CO_AUTHOR)",
    )
    args = p.parse_args(argv)

    os.chdir(repo_root())

    changes = list_changes(args.include_staged, args.include_deleted)
    if not changes:
        print("nothing to commit")
        return 0

    groups = group_changes(changes)
    if not groups:
        print("all pending changes are excluded by NEVER_COMMIT_GLOBS")
        return 0

    print(f"== Commit plan ({len(groups)} commits over {sum(len(g.files) for g in groups)} files) ==\n")
    print(render_plan(groups))

    if not (args.commit or args.interactive):
        print("preview only; rerun with --interactive or --commit")
        return 0

    if args.interactive:
        # let user edit each group, skip, or merge into next
        edited: list[CommitGroup] = []
        for g in groups:
            print(f"\n--- {g.header()} ---")
            for f in g.files:
                print(f"  {f}")
            ans = prompt("commit this group?")
            if ans.startswith("n"):
                print("  skipped")
                continue
            new_subj = input(f"subject [{g.subject}]: ").strip()
            if new_subj:
                g.subject = new_subj
            edited.append(g)
        groups = edited

    # create commits
    for g in groups:
        # reset whatever was staged before, then stage only this group's files
        reset_index()
        stage_paths(g.files)
        ok = create_commit(g, dry_run=args.dry_run, co_author=args.co_author)
        if not ok:
            print(f"\n!! commit failed for: {g.header()}")
            print("   leaving remaining groups unstaged; resolve manually and re-run")
            return 1

    print("\n== done ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
