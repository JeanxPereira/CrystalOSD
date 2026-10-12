"""Claude Code PreToolUse hook: refuses waiting by polling.

Long commands (captures, mutation, run_all, builds) run in the background and end with one
verdict line; the agent waits for the notification. Text inside quotes is not a command.
"""
import json, re, sys

call = json.load(sys.stdin)
command = call.get('tool_input', {}).get('command', '')
bare = re.sub(r'"[^"]*"|\'[^\']*\'', '', command)
if re.search(r'(^|[;&|(\s])sleep\s+\d', bare) or re.search(r'\bStart-Sleep\b', bare, re.I):
    sys.stderr.write('Polling is refused: run the command with run_in_background and wait for its notification; '
                     'the script prints one verdict line at the end.\n')
    sys.exit(2)
sys.exit(0)
