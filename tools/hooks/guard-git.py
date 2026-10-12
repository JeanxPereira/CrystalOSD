"""Claude Code PreToolUse hook: the git rules of CLAUDE.md as refusals.

Reads the tool call JSON on stdin ({"tool_name": ..., "tool_input": {"command": ...}}).
Exit 2 blocks the call and the message on stderr reaches the model. Exit 0 lets it pass.

Refused:
  git add -A | --all | . | -u | <directory> | :/ | :(top)  -> explicit file paths only
    (a short-flag cluster that contains A/u, e.g. `-Av`, counts too; `git stage` is
    `git add`'s sibling name and is treated identically)
  git commit ... with Co-Authored-By / "Generated with" / "Claude" in the MESSAGE TEXT
    (the value of -m/--message, or the content of the file named by -F/--file/-F<file>)
    -- never other arguments, paths, or other segments of the command.
  git rebase | git reset --hard | git push --force|-f|+<refspec> | git commit --amend
    rewrite history -> refused unless CLOCK_ALLOW=1

`git` only counts as an invocation when it sits in COMMAND POSITION of a shell
segment (segments are split on `&&`, `||`, `|`, `;`, newline -- but only OUTSIDE
quotes; see `split_segments`) -- optionally after `VAR=value` assignments,
`sudo`/`time`/`env` prefixes, and git's own GLOBAL OPTIONS (`-C <p>`, `-c <k=v>`,
`--git-dir[=]`, `--work-tree[=]`, `--namespace[=]`, `--no-pager`, `-p`,
`--exec-path[=]`, `--no-optional-locks`, `--literal-pathspecs`). A directory
argument to `add` is resolved against a preceding `cd <p>` segment and/or a
`-C <p>` global option, not just the hook's own process cwd. A trailing
unquoted `# ...` shell comment is stripped before tokenizing (a quoted `#`,
e.g. `-m "issue #42"`, is left alone).

A command that merely *mentions* "git add -A" as text -- `echo git add -A`,
`grep "git reset --hard" file`, `python x.py git add -A`, or a commit message
like `-m "one; git add -A; two"` -- is not a git invocation and must not be
refused.

Accepted residuals (the guard is a RAIL, not a sandbox -- it reads the literal
command string, so it cannot see through a subshell or a nested interpreter):
`sh -c '...'`, `pwsh -Command '...'`, `python -c '...'`, and `$( ... )`
command substitutions can still carry an unrefused `git add -A` etc inside
them. `CLOCK_ALLOW=1` remains the explicit escape hatch for the
history-rewrite class when a human really means it.
"""
import sys, os, re, json, shlex

ATTRIBUTION_RE = re.compile(r"co-authored-by|generated with|anthropic|(?<!\.)claude(?!\.md)", re.I)

# Prefixes that can precede the real command without hiding it: shell-style
# environment assignments, and the handful of wrapper commands that still run
# their argument in command position.
_PREFIX_COMMANDS = {"sudo", "time", "env"}
_VAR_ASSIGN_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")

# git's own global options, before the subcommand. Some take a following
# argument (space form); `-C`/`-c` also accept the argument glued on
# (`-Cpath`, `-ck=v`); the `--foo=` ones accept either `--foo bar` or
# `--foo=bar`. None of these change WHAT the subcommand does to `add`'s
# semantics -- they only relocate/retarget the invocation -- so skipping them
# is enough; their values (beyond `-C`, tracked for directory resolution)
# are not otherwise interpreted.
_GLOBAL_OPT_ARG = ("--git-dir", "--work-tree", "--namespace", "--exec-path")
_GLOBAL_OPT_FLAG = ("--no-pager", "-p", "--no-optional-locks", "--literal-pathspecs")

def refuse(msg):
    sys.stderr.write("guard-git: " + msg + "\n")
    sys.exit(2)

def split_segments(cmd):
    """Split `cmd` into shell segments on `&&`, `||`, `|`, `;`, and newline --
    but only where those delimiters sit OUTSIDE single/double quotes. A naive
    `re.split` on the raw string treats a delimiter inside a quoted `-m`
    message the same as a real one, so `git commit -m "one; git add -A; two"`
    would be sliced into a bogus `git add -A` segment. Walking the string once
    with quote/escape state keeps a quoted delimiter part of the segment that
    contains it.

    Raises ValueError on an unterminated quote -- the caller treats that as
    malformed input and allows the command through (the hook must never block
    the session on its own confusion, same as the top-level malformed-JSON
    handling below)."""
    segments = []
    current = []
    in_single = False
    in_double = False
    i = 0
    n = len(cmd)
    while i < n:
        c = cmd[i]
        if in_single:
            if c == "'":
                in_single = False
            current.append(c)
            i += 1
            continue
        if in_double:
            if c == "\\" and i + 1 < n:
                current.append(c); current.append(cmd[i + 1])
                i += 2
                continue
            if c == '"':
                in_double = False
            current.append(c)
            i += 1
            continue
        # Outside any quote.
        if c == "\\" and i + 1 < n:
            current.append(c); current.append(cmd[i + 1])
            i += 2
            continue
        if c == "'":
            in_single = True
            current.append(c)
            i += 1
            continue
        if c == '"':
            in_double = True
            current.append(c)
            i += 1
            continue
        if c == "&" and i + 1 < n and cmd[i + 1] == "&":
            segments.append("".join(current)); current = []
            i += 2
            continue
        if c == "|" and i + 1 < n and cmd[i + 1] == "|":
            segments.append("".join(current)); current = []
            i += 2
            continue
        if c == "|" or c == ";" or c == "\n":
            segments.append("".join(current)); current = []
            i += 1
            continue
        current.append(c)
        i += 1
    if in_single or in_double:
        raise ValueError("unterminated quote")
    segments.append("".join(current))
    return segments

def strip_unquoted_comment(seg):
    """Drop a trailing `# ...` shell comment from `seg`, but only when the
    `#` is OUTSIDE any quote AND at the start of a word (preceded by nothing,
    or by whitespace) -- matching real shell semantics, where `foo#bar` is
    not a comment but `foo #bar` is, and `-m "issue #42"` is never touched
    because that `#` sits inside quotes."""
    in_single = False
    in_double = False
    i = 0
    n = len(seg)
    while i < n:
        c = seg[i]
        if in_single:
            if c == "'":
                in_single = False
            i += 1
            continue
        if in_double:
            if c == "\\" and i + 1 < n:
                i += 2
                continue
            if c == '"':
                in_double = False
            i += 1
            continue
        if c == "\\" and i + 1 < n:
            i += 2
            continue
        if c == "'":
            in_single = True
            i += 1
            continue
        if c == '"':
            in_double = True
            i += 1
            continue
        if c == "#" and (i == 0 or seg[i - 1] in " \t"):
            return seg[:i]
        i += 1
    return seg

def skip_global_options(argv, i):
    """Advance past git's global options starting at argv[i] (just after the
    `git` token). Returns (index of the subcommand or len(argv), cdir) where
    cdir is the argument of a `-C` option if one was seen (for directory
    resolution), else None."""
    cdir = None
    n = len(argv)
    while i < n:
        tok = argv[i]
        if tok == "-C":
            if i + 1 < n:
                cdir = argv[i + 1]
            i += 2
            continue
        if tok.startswith("-C") and len(tok) > 2:
            cdir = tok[2:]
            i += 1
            continue
        if tok == "-c":
            i += 2
            continue
        if tok.startswith("-c") and len(tok) > 2:
            i += 1
            continue
        if tok in _GLOBAL_OPT_ARG:
            i += 2
            continue
        if tok.startswith(tuple(o + "=" for o in _GLOBAL_OPT_ARG)):
            i += 1
            continue
        if tok in _GLOBAL_OPT_FLAG:
            i += 1
            continue
        break
    return i, cdir

def git_command_index(argv):
    """Index of `git` in argv if it is the command being invoked (skipping
    `VAR=value` assignments and sudo/time/env prefixes), else None."""
    i = 0
    while i < len(argv):
        tok = argv[i]
        if _VAR_ASSIGN_RE.match(tok) or tok in _PREFIX_COMMANDS:
            i += 1
            continue
        break
    if i < len(argv) and argv[i] == "git":
        return i
    return None

def commit_message_file(args):
    """The path passed via -F/--file/-F<file>/--file=<file> to `git commit`, if any."""
    for i, a in enumerate(args):
        if a in ("-F", "--file"):
            if i + 1 < len(args):
                return args[i + 1]
        elif a.startswith("--file="):
            return a[len("--file="):]
        elif a.startswith("-F") and len(a) > 2:
            return a[2:]
    return None

def commit_message_texts(args):
    """The literal text of every -m/--message value on this `git commit`
    invocation -- NEVER the rest of the command. Multiple -m values are each
    their own paragraph in the real commit (git joins them with blank
    lines), but for a substring/regex scan over each one independently is
    exactly as sound as over the join, so no join is needed here."""
    texts = []
    i = 0
    n = len(args)
    while i < n:
        a = args[i]
        if a in ("-m", "--message"):
            if i + 1 < n:
                texts.append(args[i + 1])
            i += 2
            continue
        if a.startswith("--message="):
            texts.append(a[len("--message="):])
            i += 1
            continue
        if a.startswith("-m") and len(a) > 2:
            texts.append(a[2:])
            i += 1
            continue
        i += 1
    return texts

def commit_carries_attribution(args):
    # Scoped to THIS segment's own `-m`/`--message` values and, if present,
    # the content of a `-F`/`--file` target -- never the raw command string,
    # never a sibling segment (e.g. an earlier `git add CLAUDE.md`), never a
    # path or flag. That is the whole fix: the message is the only thing
    # CLAUDE.md's attribution rule is actually about.
    for t in commit_message_texts(args):
        if ATTRIBUTION_RE.search(t):
            return True
    mfile = commit_message_file(args)
    if mfile:
        try:
            with open(mfile, "r", encoding="utf-8", errors="replace") as fh:
                content = fh.read()
        except OSError:
            # `.githooks/commit-msg` is the net for a message file the guard
            # cannot read (missing, unreadable): it reads the actual
            # message git resolved, regardless of how it was supplied.
            return False
        if ATTRIBUTION_RE.search(content):
            return True
    return False

def resolve_dir(base_dir, a):
    """`a` as git would see it: unchanged if absolute, else joined onto
    `base_dir` (a preceding `cd <p>` and/or this invocation's `-C <p>`) when
    one is known, else unchanged (resolved against the hook's own cwd, as
    before)."""
    if os.path.isabs(a) or base_dir is None:
        return a
    return os.path.join(base_dir, a)

def is_all_or_update_flag(a):
    if a in ("-A", "--all", ".", "-u", "--update"):
        return True
    # A short-flag cluster (`-Av`, `-uv`, `-vA`, ...) counts if `A` or `u`
    # appears anywhere in it -- git accepts these glued together.
    if a.startswith("-") and not a.startswith("--") and len(a) > 1:
        return any(ch in ("A", "u") for ch in a[1:])
    return False

def is_refused_pathspec(a):
    # `:/` (repo-root magic pathspec) and `:(top)`/`:(top,...)` variants mean
    # "everything from the repo root" -- the same blast radius as `add -A`.
    return a == ":/" or a.startswith(":/") or re.match(r"^:\(top\b", a) is not None

def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    cmd = (data.get("tool_input") or {}).get("command") or ""
    if "git" not in cmd:
        sys.exit(0)
    try:
        segments = split_segments(cmd)
    except ValueError:
        sys.exit(0)
    pending_cd = None
    for raw_seg in segments:
        seg = strip_unquoted_comment(raw_seg)
        s = seg.strip()
        if not s:
            continue
        try:
            argv = shlex.split(s, posix=True)
        except ValueError:
            argv = s.split()
        if not argv:
            continue
        # Track the working directory a bare `cd <p>` segment establishes for
        # segments that follow it in the same command (e.g.
        # `cd Source && git add DesignLibrary`). Only a plain `cd <path>` (no
        # other flags/args) updates it; anything else leaves it as-is rather
        # than guessing.
        if argv[0] == "cd" and len(argv) == 2:
            pending_cd = argv[1] if pending_cd is None or os.path.isabs(argv[1]) \
                else os.path.join(pending_cd, argv[1])
            continue
        idx = git_command_index(argv)
        if idx is None:
            continue
        sub_idx, cdir = skip_global_options(argv, idx + 1)
        sub = argv[sub_idx] if sub_idx < len(argv) else ""
        args = argv[sub_idx + 1:]
        if sub == "stage":   # git's own alias for `add`
            sub = "add"
        base_dir = cdir if cdir is not None else pending_cd
        if sub == "add":
            if any(is_all_or_update_flag(a) for a in args):
                refuse("`git add %s` is forbidden (CLAUDE.md): add explicit file paths, one by one." % " ".join(args))
            for a in args:
                if a.startswith("-"):
                    continue
                if is_refused_pathspec(a):
                    refuse("`git add %s` is the repo-root pathspec: add explicit file paths, one by one." % a)
                if os.path.isdir(resolve_dir(base_dir, a)):
                    refuse("`git add %s` adds a directory: name the files instead." % a)
        amending = sub == "commit" and "--amend" in args
        if sub == "commit" and commit_carries_attribution(args):
            refuse("commit message carries an attribution line; the project forbids it.")
        if os.environ.get("CLOCK_ALLOW") != "1":
            # `commit --amend` rewrites the tip commit exactly like rebase, a hard
            # reset, or a force push -- same risk (CLAUDE.md: another session may
            # be in the tree), so it is gated the same way. `+<refspec>` on push
            # is git's own force-push spelling (`git push origin +rails`).
            force_push = sub == "push" and any(
                a in ("--force", "-f", "--force-with-lease") or (a.startswith("+") and not a.startswith("--"))
                for a in args)
            if sub == "rebase" or (sub == "reset" and "--hard" in args) or force_push or amending:
                label = "commit --amend" if amending else sub
                refuse("`git %s` rewrites history; another session may be in the tree (several sessions and agents share this tree). Set CLOCK_ALLOW=1 if you really mean it." % label)
            # `git clean` deletes IGNORED files, and the body of evidence lives in
            # ignored files by design (rule 3): References/26A5416b (the dyld cache,
            # the Ghidra project, the extracted rootfs), lab/, build/. On 2026-08-26 a
            # clean scoped to References/ destroyed all of it -- git clean does not use
            # the recycle bin, and re-analysing the DSC in Ghidra costs hours. Nothing
            # this project does routinely needs it; deleting a build directory is
            # `Remove-Item build`, naming what you delete.
            if sub == "clean":
                refuse("`git clean` deletes ignored files -- References/ (dumps, BIOS images, textures) and build/ are ignored BY DESIGN and there is no recycle bin. Delete by name instead. Set CLOCK_ALLOW=1 if you really mean it.")
    sys.exit(0)

if __name__ == "__main__":
    main()
