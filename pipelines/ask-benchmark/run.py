"""Run the four-setup benchmark: the same model answers the same questions with different tools.

    python pipelines/ask-benchmark/run.py --setups A,B,C,D --runs 3 --budget-usd 15 --out bench-runs/run.jsonl

Needs ANTHROPIC_API_KEY in the environment. It stops before any call that would pass --max-calls
or --budget-usd, and writes one JSON line per answer, so a stopped run keeps what it has.
--dry-run swaps in a stand-in model that sends nothing, to check the plumbing.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))

from setups import MODEL, make_setups, with_direct_web  # noqa: E402
from tools import Toolbox  # noqa: E402

# US$, read on the Claude API pricing page on 2026-11-26. Haiku 5.5 is priced per request by prompt
# length: a request whose input passes 100,000 tokens pays the higher rate on all of its tokens.
PRICES = {
    "tier_tokens": 100_000,
    "input": (0.10, 0.50),  # per million tokens: up to the tier, above it
    "output": (0.50, 2.50),
    "web_search": 0.01,  # per search; web fetch and, with these tool versions, code execution are free
}
MAX_TOKENS = 2_048
MAX_STEPS = 8  # model calls per answer, tool rounds included


def request_cost(usage) -> float:
    """Cost of one API response from its usage block."""
    get = (lambda k: (usage.get(k) if isinstance(usage, dict) else getattr(usage, k, 0)) or 0)
    prompt = get("input_tokens") + get("cache_read_input_tokens") + get("cache_creation_input_tokens")
    hi = 1 if prompt > PRICES["tier_tokens"] else 0
    stu = get("server_tool_use")
    searches = (stu.get("web_search_requests", 0) if isinstance(stu, dict) else getattr(stu, "web_search_requests", 0)) if stu else 0
    return prompt * PRICES["input"][hi] / 1e6 + get("output_tokens") * PRICES["output"][hi] / 1e6 + (searches or 0) * PRICES["web_search"]


def load_cases() -> dict[str, dict]:
    out = subprocess.run(
        ["node", str(REPO / "pipelines" / "semantic-layer" / "export_cases.mjs")],
        cwd=REPO, check=True, capture_output=True, text=True,
    )
    return {c["id"]: c for c in json.loads(out.stdout)}


def load_questions(path: Path = HERE / "questions.yaml", cases: dict | None = None) -> list[dict]:
    """Questions with their answer keys. Case-based keys come from cases.mjs, never from the YAML."""
    raw = yaml.safe_load(path.read_text())["questions"]
    cases = cases if cases is not None else load_cases()
    seen, out = set(), []
    for q in raw:
        if q["id"] in seen:
            raise ValueError(f"duplicate question id {q['id']}")
        seen.add(q["id"])
        if q.get("case"):
            c = cases[q["case"]]
            key = {"expect": "answer", "result": c["expected"]} if c["outcome"] == "answer" else {"expect": "decline"}
            spec = c.get("spec") or {}
            out.append({**q, "text": c["text"], "key": key, "metric": spec.get("metric"), "ordered": bool(spec.get("rank"))})
        elif q.get("expect") in ("decline", "caveat"):
            out.append({**q, "key": {"expect": q["expect"]}})
        else:
            a = q.get("answer") or {}
            missing = [f for f in ("text", "source", "as_of") if not q.get(f)] + ([] if a.get("value") is not None else ["answer.value"])
            if missing:
                raise ValueError(f"{q['id']} is missing {', '.join(missing)}")
            out.append({**q, "key": {"expect": "answer", "value": a["value"], "tolerance": a.get("tolerance"), "tolerance_pct": a.get("tolerance_pct")}})
    return out


def _blocks(content) -> list:
    return [b if not isinstance(b, dict) else SimpleNamespace(**b) for b in content]


def ask(client, setup, question: dict, toolbox: Toolbox, guard) -> dict:
    """One answer: the model calls tools until it submits, or the step limit is reached."""
    messages = [{"role": "user", "content": question["text"]}]
    rec = {"question": question["id"], "setup": setup.name, "calls": 0, "cost_usd": 0.0, "input_tokens": 0,
           "output_tokens": 0, "searches": 0, "tool_calls": [], "answer": None, "stop": None, "error": None}
    started, nudged = time.monotonic(), False
    for _ in range(MAX_STEPS):
        if not guard.allows():
            rec["stop"] = "budget"
            break
        try:
            resp = client.messages.create(model=MODEL, max_tokens=MAX_TOKENS, system=setup.system,
                                          tools=setup.tools, messages=messages)
        except Exception as e:  # noqa: BLE001 - record any API failure and move on
            if "allowed_callers" in str(e) and not rec.get("web_callers"):
                setup, rec["web_callers"] = with_direct_web(setup), "direct"  # the API's own advice, once
                continue
            rec["error"] = f"{type(e).__name__}: {str(e)[:300]}"
            break
        cost = request_cost(resp.usage)
        guard.spend(cost)
        u = resp.usage
        rec["calls"] += 1
        rec["cost_usd"] += cost
        rec["input_tokens"] += getattr(u, "input_tokens", 0) or 0
        rec["output_tokens"] += getattr(u, "output_tokens", 0) or 0
        stu = getattr(u, "server_tool_use", None)
        rec["searches"] += (getattr(stu, "web_search_requests", 0) or 0) if stu else 0
        content = _blocks(resp.content)
        for b in content:
            if b.type == "server_tool_use":
                rec["tool_calls"].append({"tool": b.name, "input": json.dumps(getattr(b, "input", {}))[:300]})
        messages.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason == "pause_turn":
            continue
        uses = [b for b in content if b.type == "tool_use"]
        if not uses:
            rec["final_text"] = " ".join(getattr(b, "text", "") for b in content if b.type == "text")[:1000]
            if nudged or resp.stop_reason != "end_turn":
                rec["stop"] = resp.stop_reason
                break
            messages.append({"role": "user", "content": "Call submit_answer now with your final answer."})
            nudged = True
            continue
        results, done = [], False
        for b in uses:
            if b.name == "submit_answer":
                rec["answer"], done = dict(b.input), True
                break
            text, is_error = toolbox.call(b.name, dict(b.input))
            rec["tool_calls"].append({"tool": b.name, "input": json.dumps(b.input)[:300], "error": is_error})
            results.append({"type": "tool_result", "tool_use_id": b.id, "content": text, "is_error": is_error})
        if done:
            rec["stop"] = "submitted"
            break
        messages.append({"role": "user", "content": results})
    else:
        rec["stop"] = "max_steps"
    rec["seconds"] = round(time.monotonic() - started, 2)
    rec["cost_usd"] = round(rec["cost_usd"], 6)
    return rec


class Guard:
    """Stops the run before it passes its call or spending cap."""

    def __init__(self, max_calls: int, budget_usd: float) -> None:
        self.max_calls, self.budget, self.calls, self.spent = max_calls, budget_usd, 0, 0.0

    def allows(self) -> bool:
        return self.calls < self.max_calls and self.spent < self.budget

    def spend(self, usd: float) -> None:
        self.calls += 1
        self.spent += usd


class DryRunClient:
    """A stand-in model for --dry-run: answers every question by declining, and sends nothing."""

    class _Messages:
        def create(self, **_kwargs):
            block = SimpleNamespace(type="tool_use", id="dry", name="submit_answer",
                                    input={"outcome": "decline", "explanation": "Dry run: no model was called."})
            return SimpleNamespace(content=[block], stop_reason="tool_use",
                                   usage=SimpleNamespace(input_tokens=0, output_tokens=0, server_tool_use=None))

    messages = _Messages()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--setups", default="A,B,C,D")
    p.add_argument("--runs", type=int, default=1)
    p.add_argument("--only", default="", help="comma-separated question ids")
    p.add_argument("--max-calls", type=int, default=200)
    p.add_argument("--budget-usd", type=float, default=3.0)
    p.add_argument("--max-searches", type=int, default=5)
    p.add_argument("--max-fetches", type=int, default=3)
    p.add_argument("--out", type=Path, default=REPO / "bench-runs" / "run.jsonl")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args(argv)

    setups = make_setups(a.max_searches, a.max_fetches)
    chosen = [s.strip().upper() for s in a.setups.split(",") if s.strip()]
    unknown = [s for s in chosen if s not in setups]
    if unknown or not chosen:
        p.error(f"unknown setups {unknown}; choose from {', '.join(setups)}")
    if not 1 <= a.runs <= 5:
        p.error("--runs must be 1 to 5")
    questions = load_questions()
    if a.only:
        wanted = {q.strip() for q in a.only.split(",")}
        questions = [q for q in questions if q["id"] in wanted]
    if a.dry_run:
        client = DryRunClient()
    else:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("ANTHROPIC_API_KEY is not set; nothing was sent.", file=sys.stderr)
            return 1
        import anthropic  # noqa: PLC0415

        client = anthropic.Anthropic(max_retries=3)
    layer = None
    if any(setups[s].uses_semantic_layer for s in chosen):
        sys.path.insert(0, str(REPO / "pipelines" / "semantic-layer"))
        from semantic_query import SemanticLayer  # noqa: PLC0415

        layer = SemanticLayer.open()

    guard = Guard(a.max_calls, a.budget_usd)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    started = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    header = {"type": "run", "model": MODEL, "setups": chosen, "runs": a.runs, "questions": len(questions),
              "started": started, "prices": PRICES, "max_calls": a.max_calls, "budget_usd": a.budget_usd,
              "max_searches": a.max_searches, "max_fetches": a.max_fetches, "dry_run": a.dry_run}
    answered = 0
    with a.out.open("w") as f:
        f.write(json.dumps(header) + "\n")
        for q in questions:  # every setup answers a question before the next one, so all see the same web
            for run in range(1, a.runs + 1):
                for s in chosen:
                    if not guard.allows():
                        break
                    rec = ask(client, setups[s], q, Toolbox(layer), guard)
                    rec.update({"type": "answer", "run": run, "kind": q["kind"]})
                    f.write(json.dumps(rec, default=str) + "\n")
                    f.flush()
                    answered += 1
    stopped = "" if guard.allows() else " (stopped at the call or budget cap)"
    print(f"{answered} answers, {guard.calls} calls, US${guard.spent:.4f}{stopped} -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
