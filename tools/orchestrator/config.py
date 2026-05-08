"""Config loader. Reads .orchestrator/config.yml, falls back to defaults."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ORCH_DIR = PROJECT_ROOT / ".orchestrator"
CONFIG_PATH = ORCH_DIR / "config.yml"
SECRETS_PATHS = [
    ORCH_DIR / "secrets.local.env",  # higher priority, machine-specific override
    ORCH_DIR / "secrets.env",
    PROJECT_ROOT / ".env.local",
    PROJECT_ROOT / ".env",
]


def load_secrets() -> None:
    """Read KEY=value lines from gitignored secrets files into os.environ.

    Existing env vars take precedence (don't overwrite). Loads in priority
    order: secrets.local.env > secrets.env > .env.local > .env.
    """
    for path in SECRETS_PATHS:
        if not path.exists():
            continue
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip("\"'")
            if key and key not in os.environ:
                os.environ[key] = val


load_secrets()

DEFAULT_CONFIG: dict[str, Any] = {
    "planner": {
        "provider": "deepseek",
        "model": "deepseek-chat",
    },
    "worker": {
        "provider": "deepseek",
        "model": "deepseek-reasoner",
        "fallback": {
            "provider": "gemini",
            "model": "gemini-2.5-pro",
        },
        "max_iterations": 8,
        "stuck_threshold": 3,
    },
    "judge": {
        "symbol_only_threshold": 15,
        "close_threshold": 100,
    },
    "embeddings": {
        "provider": "mcp",
        "tool": "mcp__decomp-me-mcp__decomp_search_context",
        "top_k": 5,
    },
    "paths": {
        "queue": ".orchestrator/queue.json",
        "log": ".orchestrator/log.jsonl",
        "takeaways": ".orchestrator/takeaways.md",
        "ask_human": ".orchestrator/ask_human",
        "stubs_dir": "src/stubs",
        "src_dir": "src",
        "asm_dir": "asm",
        "decomp_results": "tools/decomp_results.json",
    },
}


def _try_load_yaml(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        import yaml  # type: ignore
    except ImportError:
        return _parse_simple_yaml(path.read_text())
    return yaml.safe_load(path.read_text())


def _parse_simple_yaml(text: str) -> dict:
    """Tiny YAML subset parser (key: value + nesting via 2-space indent)."""
    root: dict = {}
    stack: list[tuple[int, dict]] = [(-1, root)]
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1] if stack else root
        if ":" not in line:
            continue
        key, _, val = line.strip().partition(":")
        key = key.strip()
        val = val.strip()
        if not val:
            new_dict: dict = {}
            parent[key] = new_dict
            stack.append((indent, new_dict))
        else:
            if val.lower() in ("true", "false"):
                parent[key] = val.lower() == "true"
            elif val.isdigit():
                parent[key] = int(val)
            else:
                try:
                    parent[key] = float(val)
                except ValueError:
                    parent[key] = val.strip("\"'")
    return root


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load() -> dict:
    user_cfg = _try_load_yaml(CONFIG_PATH) or {}
    merged = _deep_merge(DEFAULT_CONFIG, user_cfg)
    return merged


def write_default(force: bool = False) -> Path:
    ORCH_DIR.mkdir(exist_ok=True, parents=True)
    if CONFIG_PATH.exists() and not force:
        return CONFIG_PATH
    CONFIG_PATH.write_text(_render_yaml(DEFAULT_CONFIG))
    return CONFIG_PATH


def _render_yaml(d: dict, indent: int = 0) -> str:
    out = []
    pad = "  " * indent
    for k, v in d.items():
        if isinstance(v, dict):
            out.append(f"{pad}{k}:")
            out.append(_render_yaml(v, indent + 1))
        elif isinstance(v, bool):
            out.append(f"{pad}{k}: {'true' if v else 'false'}")
        elif v is None:
            out.append(f"{pad}{k}:")
        else:
            out.append(f"{pad}{k}: {v}")
    return "\n".join(out)


def project_root() -> Path:
    return PROJECT_ROOT


def resolve(rel: str) -> Path:
    return PROJECT_ROOT / rel
