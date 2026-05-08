"""LLM provider abstraction for CrystalOSD orchestrator.

Two implementations:
  - ClaudeProvider: native Anthropic Messages API (requires `anthropic` SDK)
  - OpenAICompatProvider: OpenAI chat-completions shape, used for DeepSeek,
    OpenAI, Gemini-compat, and local llama.cpp/Ollama servers.

Single chat() entrypoint returning text + usage metadata.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


def _retry_after_seconds(body: str, default: float) -> float:
    m = re.search(r"retry in ([0-9.]+)s", body, re.IGNORECASE)
    if m:
        try:
            return float(m.group(1)) + 1.0
        except ValueError:
            pass
    m = re.search(r'"retryDelay":\s*"([0-9.]+)s"', body)
    if m:
        try:
            return float(m.group(1)) + 1.0
        except ValueError:
            pass
    return default


def _do_request(req, *, timeout, provider_name, max_retries=4):
    attempt = 0
    backoff = 4.0
    while True:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code in (429, 500, 502, 503, 504) and attempt < max_retries:
                wait = _retry_after_seconds(body, backoff)
                wait = min(wait, 90.0)
                print(
                    f"  [{provider_name}] {e.code}; retry {attempt + 1}/{max_retries} in {wait:.1f}s",
                    file=sys.stderr,
                )
                time.sleep(wait)
                attempt += 1
                backoff *= 2
                continue
            raise RuntimeError(
                f"{provider_name} API error {e.code}: {body[:500]}"
            ) from e


@dataclass
class LLMResponse:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = ""
    provider: str = ""
    latency_ms: int = 0
    raw: dict[str, Any] = field(default_factory=dict)


class LLMProvider(ABC):
    name: str = "abstract"

    @abstractmethod
    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        system: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.2,
        timeout: int = 180,
    ) -> LLMResponse: ...


class ClaudeProvider(LLMProvider):
    """Anthropic Messages API. Uses raw HTTP to avoid SDK dependency."""

    name = "claude"

    def __init__(self, model: str, api_key: str | None = None, base_url: str | None = None):
        self.model = model
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        self.base_url = base_url or "https://api.anthropic.com"

    def chat(self, messages, *, system=None, max_tokens=4096, temperature=0.2, timeout=180):
        body = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": messages,
        }
        if system:
            body["system"] = system

        req = urllib.request.Request(
            f"{self.base_url}/v1/messages",
            data=json.dumps(body).encode(),
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            method="POST",
        )
        t0 = time.time()
        raw = _do_request(req, timeout=timeout, provider_name=self.name)
        data = json.loads(raw)
        latency = int((time.time() - t0) * 1000)

        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        usage = data.get("usage", {})
        return LLMResponse(
            text=text,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            model=data.get("model", self.model),
            provider=self.name,
            latency_ms=latency,
            raw=data,
        )


class OpenAICompatProvider(LLMProvider):
    """OpenAI /v1/chat/completions shape. Covers DeepSeek, OpenAI, Gemini-compat, llama.cpp, Ollama."""

    name = "openai_compat"

    def __init__(self, model: str, base_url: str, api_key: str | None = None, provider_name: str = "openai_compat"):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or "none"
        self.name = provider_name

    def chat(self, messages, *, system=None, max_tokens=4096, temperature=0.2, timeout=180):
        msg_list = list(messages)
        if system:
            msg_list = [{"role": "system", "content": system}] + msg_list

        body = {
            "model": self.model,
            "messages": msg_list,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(body).encode(),
            headers={
                "authorization": f"Bearer {self.api_key}",
                "content-type": "application/json",
            },
            method="POST",
        )
        t0 = time.time()
        raw = _do_request(req, timeout=timeout, provider_name=self.name)
        data = json.loads(raw)
        latency = int((time.time() - t0) * 1000)

        choice = data.get("choices", [{}])[0]
        text = (choice.get("message") or {}).get("content", "") or ""
        usage = data.get("usage", {})
        return LLMResponse(
            text=text,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
            model=data.get("model", self.model),
            provider=self.name,
            latency_ms=latency,
            raw=data,
        )


PRESETS = {
    "agent": {"factory": "agent", "default_model": "external"},
    "claude": {"factory": "claude", "default_model": "claude-sonnet-4-6"},
    "deepseek": {
        "factory": "openai_compat",
        "base_url": "https://api.deepseek.com/v1",
        "key_env": "DEEPSEEK_API_KEY",
        "default_model": "deepseek-chat",
    },
    "openai": {
        "factory": "openai_compat",
        "base_url": "https://api.openai.com/v1",
        "key_env": "OPENAI_API_KEY",
        "default_model": "gpt-4o-mini",
    },
    "gemini": {
        "factory": "openai_compat",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "key_env": "GEMINI_API_KEY",
        "default_model": "gemini-2.5-flash",
    },
    "local": {
        "factory": "openai_compat",
        "base_url": "http://localhost:8080/v1",
        "key_env": None,
        "default_model": "qwen2.5-coder-7b-instruct-q5_k_m",
    },
}


def build_provider(spec: dict) -> LLMProvider:
    """Build provider from a config dict {provider, model, [base_url], [api_key_env]}."""
    pname = spec.get("provider")
    if pname not in PRESETS:
        raise ValueError(f"unknown provider: {pname}; known: {list(PRESETS)}")
    preset = PRESETS[pname]
    model = spec.get("model") or preset["default_model"]

    if preset["factory"] == "agent":
        raise RuntimeError(
            "provider=agent — calling LLM directly is disabled in agent mode; "
            "use `orchestrator plan/submit/iterate` from your IDE agent instead"
        )
    if preset["factory"] == "claude":
        return ClaudeProvider(model=model, api_key=os.environ.get("ANTHROPIC_API_KEY"))

    base_url = spec.get("base_url") or preset["base_url"]
    key_env = spec.get("api_key_env") or preset.get("key_env")
    api_key = os.environ.get(key_env) if key_env else None
    if key_env and not api_key:
        raise RuntimeError(f"{key_env} not set for provider '{pname}'")
    return OpenAICompatProvider(
        model=model,
        base_url=base_url,
        api_key=api_key,
        provider_name=pname,
    )


def build_with_fallback(spec: dict):
    """Returns a callable chat(...) that tries primary, then fallback on failure."""
    primary = build_provider(spec)
    fb_spec = spec.get("fallback")
    fallback = build_provider(fb_spec) if fb_spec else None

    def chat(messages, **kwargs) -> LLMResponse:
        try:
            return primary.chat(messages, **kwargs)
        except Exception as e:
            if fallback is None:
                raise
            return fallback.chat(messages, **kwargs)

    chat.primary = primary  # type: ignore[attr-defined]
    chat.fallback = fallback  # type: ignore[attr-defined]
    return chat
