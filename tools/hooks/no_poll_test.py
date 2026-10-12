import json, pathlib, subprocess, sys

HOOK = pathlib.Path(__file__).with_name('no-poll.py')


def run(command, tool='Bash'):
    call = json.dumps({'tool_name': tool, 'tool_input': {'command': command}})
    done = subprocess.run([sys.executable, str(HOOK)], input=call, capture_output=True, text=True)
    if done.returncode == 2:
        assert 'Polling is refused' in done.stderr
    return done.returncode


def test_refuses_waiting_by_polling():
    assert run('sleep 240; tail out.txt') == 2
    assert run('until grep -q verdict x; do sleep 10; done') == 2
    assert run('Start-Sleep -Seconds 5', 'PowerShell') == 2


def test_allows_commands_that_only_mention_sleep():
    assert run('grep -n "sleep" References/scripts/capture.mjs') == 0
    assert run('node References/scripts/run_all.mjs --changed') == 0
    assert run("echo 'no sleep 5 here'") == 0
