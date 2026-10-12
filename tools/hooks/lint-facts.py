"""Claude Code PostToolUse hook: after an edit to a page under facts/, run lint_facts.mjs on it.

Reads the tool call JSON on stdin. When the edited file is facts/*.md and the lint finds an
error, exit 2 with the lint's lines on stderr, which reaches the model. Otherwise exit 0.
"""
import json, os, subprocess, sys

call = json.load(sys.stdin)
path = (call.get("tool_input") or {}).get("file_path") or ""
norm = path.replace("\\", "/")
if "/facts/" not in norm or not norm.endswith(".md"):
    sys.exit(0)
root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
result = subprocess.run(["node", os.path.join(root, "References", "scripts", "lint_facts.mjs"), path],
                        capture_output=True, text=True, cwd=root)
if result.returncode != 0:
    sys.stderr.write("facts/ lint failed for this page; fix it before going on:\n" + result.stdout)
    sys.exit(2)
sys.exit(0)
