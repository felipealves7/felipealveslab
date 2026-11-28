"""Score a benchmark run file and print a Markdown summary.

    python pipelines/ask-benchmark/score.py bench-runs/run.jsonl >> "$GITHUB_STEP_SUMMARY"

Right means the submitted answer matches the key: the same number after the key's rounding (or
within its tolerance), every row of a table, the order of a ranking, or a decline where the key
expects one. Same across runs means every run of a question gave the same answer.
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

CAUSAL = re.compile(r"\b(because|caused|causes|due to|driven by|led to|leads to|as a result of|resulted in)\b", re.I)


def js_round(value: float, decimals: int) -> float:
    """Math.round to the key's decimals; a missing or non-numeric value stays NaN and never matches."""
    if not math.isfinite(value):
        return math.nan
    scale = 10**decimals
    return math.floor(value * scale + 0.5) / scale


def norm_label(label) -> str:
    s = re.sub(r"\s+", " ", str(label)).strip().lower()
    m = re.fullmatch(r"q([1-4])\s*[-/ ]?\s*(\d{4})", s) or re.fullmatch(r"(\d{4})\s*[-/ ]?\s*q([1-4])", s)
    if m:
        q, y = (m.group(1), m.group(2)) if s.startswith("q") else (m.group(2), m.group(1))
        return f"{y}-q{q}"
    return s


def num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return math.nan


def judge(question: dict, answer: dict | None) -> tuple[bool, str]:
    """Whether one submitted answer is right, and a short reason."""
    key = question["key"]
    if not answer:
        return False, "no answer submitted"
    outcome = answer.get("outcome")
    if key["expect"] == "decline":
        return outcome == "decline", "declined" if outcome == "decline" else "answered a question it should decline"
    if key["expect"] == "caveat":
        if outcome == "decline":
            return True, "declined"
        ok = bool((answer.get("caveat") or "").strip())
        return ok, "answered with a caveat" if ok else "answered without a caveat"
    if outcome != "answer":
        return False, "declined a question it could answer"
    digits = 1 if question.get("metric") == "gross_margin" else 0
    if "result" in key:  # a case from cases.mjs
        want = key["result"]
        if want["kind"] == "scalar":
            v = answer.get("value")
            if v is None and len(answer.get("rows") or []) == 1:
                v = answer["rows"][0].get("value")
            if v is None:
                return False, "no number"
            return js_round(num(v), digits) == want["value"], f"{v} against {want['value']}"
        got = [(norm_label(r.get("label")), js_round(num(r.get("value")), digits)) for r in answer.get("rows") or [] if isinstance(r, dict)]
        exp = [(norm_label(r["label"]), r["value"]) for r in want["rows"]]
        if question.get("ordered"):  # a ranking: the order is part of the answer
            return got == exp, "rows and order match" if got == exp else f"rows {got[:4]} against {exp[:4]}"
        return sorted(got) == sorted(exp), "all rows match" if sorted(got) == sorted(exp) else f"{len(got)} rows against {len(exp)}"
    v = answer.get("value")
    if v is None:
        return False, "no number"
    want, tol, pct = float(key["value"]), key.get("tolerance"), key.get("tolerance_pct")
    if pct is not None:
        ok = abs(num(v) - want) <= abs(want) * pct / 100
    else:
        ok = abs(num(v) - want) <= (tol if tol is not None else 0)
    return ok, f"{v} against {want}"


def signature(answer: dict | None):
    if not answer:
        return None
    if answer.get("outcome") == "decline":
        return "decline"
    if answer.get("value") is not None:
        return round(num(answer["value"]), 1)
    return tuple((norm_label(r.get("label")), round(num(r.get("value")), 1)) for r in answer.get("rows") or [] if isinstance(r, dict))


def score(path: Path, questions: list[dict]) -> dict:
    by_id = {q["id"]: q for q in questions}
    header, stop, records = None, None, []
    for line in path.read_text().splitlines():
        r = json.loads(line)
        if r.get("type") == "run":
            header = r
        elif r.get("type") == "stop":
            stop = r
        elif r.get("type") == "answer" and r["question"] in by_id:
            records.append(r)
    first_error = next((r["error"] for r in records if r.get("error")), None)
    per_setup: dict[str, dict] = defaultdict(lambda: defaultdict(float))
    runs: dict[tuple, list] = defaultdict(list)
    details = []
    for r in records:
        q = by_id[r["question"]]
        ok, why = judge(q, r.get("answer"))
        s = per_setup[r["setup"]]
        s["answers"] += 1
        s["right"] += ok
        s[f"right_{q['kind']}"] += ok
        s[f"n_{q['kind']}"] += 1
        s["cost_usd"] += r.get("cost_usd", 0)
        s["seconds"] += r.get("seconds", 0)
        s["searches"] += r.get("searches", 0)
        s["errors"] += bool(r.get("error"))
        a = r.get("answer") or {}
        if q["key"]["expect"] == "answer" and a.get("outcome") == "decline":
            s["over_refusals"] += 1
        text = f"{a.get('explanation', '')} {a.get('caveat', '')}"
        if a.get("outcome") == "answer" and CAUSAL.search(text) and not (a.get("caveat") or "").strip():
            s["causal_flags"] += 1
        runs[(r["setup"], r["question"])].append(signature(r.get("answer")))
        details.append({"setup": r["setup"], "question": r["question"], "run": r.get("run"), "right": ok, "why": why})
    for (setup, _), sigs in runs.items():
        per_setup[setup]["questions"] += 1
        per_setup[setup]["same_across_runs"] += len(set(map(repr, sigs))) == 1
    return {"header": header, "setups": {k: dict(v) for k, v in per_setup.items()}, "details": details,
            "stop": stop, "answers": len(records), "errors": sum(bool(r.get("error")) for r in records),
            "first_error": first_error}


KEY_HINT = "If it says `invalid x-api-key`, replace the `ANTHROPIC_API_KEY` repository secret with a key from the Claude Console."


def markdown(result: dict) -> str:
    h = result["header"] or {}
    stop = result.get("stop")
    lines = [f"### Is the web enough? {h.get('model', '')}, {h.get('runs', '?')} run(s) per question, started {h.get('started', '')}", ""]
    if stop and stop.get("before_first_question"):
        return "\n".join(lines + [
            f"**No scores: the API refused the run before the first question, so nothing was sent.** `{stop.get('error', '')}`",
            "", KEY_HINT]) + "\n"
    if stop:
        lines += [f"**Stopped early: the API refused a call, so the run stopped.** `{stop.get('error', '')}` "
                  f"The scores below cover only the answers before the stop. {KEY_HINT}", ""]
    errors, answers = result.get("errors", 0), result.get("answers", 0)
    if errors and not stop:
        lines += [f"**{errors} of {answers} answers ended in an error,** so those scores measure the error, not the model. "
                  f"The first: `{result.get('first_error', '')}`", ""]
    kinds = ["own_data", "public_fact", "relationship", "decline"]
    lines += [
        "| Setup | Right | Errors | " + " | ".join(k.replace("_", " ") for k in kinds) + " | Same across runs | Over-refusals | Causal flags | Searches | Cost (US$) | Mean seconds |",
        "| --- | --- | --- | " + " | ".join("---" for _ in kinds) + " | --- | --- | --- | --- | --- | --- |",
    ]
    for name in sorted(result["setups"]):
        s = result["setups"][name]
        n = int(s.get("answers", 0))
        cells = [f"{int(s.get('right_' + k, 0))} of {int(s.get('n_' + k, 0))}" if s.get("n_" + k) else "–" for k in kinds]
        lines.append(
            f"| {name} | {int(s['right'])} of {n} | {int(s.get('errors', 0))} | " + " | ".join(cells)
            + f" | {int(s.get('same_across_runs', 0))} of {int(s.get('questions', 0))} | {int(s.get('over_refusals', 0))}"
            + f" | {int(s.get('causal_flags', 0))} | {int(s.get('searches', 0))} | {s.get('cost_usd', 0):.4f}"
            + f" | {s.get('seconds', 0) / n if n else 0:.1f} |"
        )
    if h.get("dry_run"):
        lines += ["", "Dry run: a stand-in model declined every question. No call was sent."]
    lines += ["", "Causal flags count answers that use causal words with no caveat; read those by hand."]
    return "\n".join(lines) + "\n"


def main(argv=None) -> int:
    from run import load_questions  # noqa: PLC0415

    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) != 1:
        print("usage: score.py RUN_FILE", file=sys.stderr)
        return 2
    result = score(Path(argv[0]), load_questions())
    out = Path(argv[0]).with_suffix(".scores.json")
    out.write_text(json.dumps(result, indent=1, default=str))
    sys.stdout.write(markdown(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
