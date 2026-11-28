"""Tests for the four-setup benchmark, with a scripted stand-in for the model: no call leaves CI.

Run from the repository root: python -m unittest discover -s pipelines/ask-benchmark
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "semantic-layer"))

import run  # noqa: E402
import score  # noqa: E402
from semantic_query import SemanticLayer  # noqa: E402
from setups import BLOCKED_DOMAINS, make_setups  # noqa: E402
from tools import Toolbox  # noqa: E402


def usage(i=1000, o=100, searches=0):
    return NS(input_tokens=i, output_tokens=o, server_tool_use=NS(web_search_requests=searches) if searches else None)


def tool_use(name, args, id_="t1"):
    return NS(type="tool_use", id=id_, name=name, input=args)


class ScriptedClient:
    """Plays one scripted step per call. A step is a function of the messages so far."""

    def __init__(self, steps):
        self.steps, self.calls = list(steps), []
        self.messages = self

    def create(self, **kw):
        self.calls.append({**kw, "messages": list(kw["messages"])})  # as sent, before the harness appends to it
        return self.steps.pop(0)(kw["messages"])


def last_tool_result(messages):
    return json.loads(messages[-1]["content"][0]["content"])


class AuthenticationError(Exception):
    """Named like the SDK's error: the harness goes by the name."""


class InternalServerError(Exception):
    pass


class FakeClient:
    """A key check and a model that declines everything; either can be made to fail."""

    def __init__(self, refuse_key=None, fail_calls=None):
        self.refuse_key, self.fail_calls, self.created = refuse_key, fail_calls, 0
        self.models = NS(retrieve=self._retrieve)
        self.messages = NS(create=self._create)

    def _retrieve(self, model_id):
        if self.refuse_key:
            raise self.refuse_key
        return NS(id=model_id)

    def _create(self, **_kw):
        self.created += 1
        if self.fail_calls:
            raise self.fail_calls
        return NS(content=[tool_use("submit_answer", {"outcome": "decline", "explanation": "x"})],
                  stop_reason="tool_use", usage=usage())


class BenchmarkTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.layer = SemanticLayer.open()
        cls.questions = {q["id"]: q for q in run.load_questions()}
        cls.setups = make_setups()

    def test_question_set_takes_its_keys_from_the_cases(self):
        q = self.questions
        self.assertEqual(len(q), 16)
        self.assertEqual(q["O01"]["key"], {"expect": "answer", "result": {"kind": "scalar", "value": 181141}})
        self.assertEqual(q["D01"]["key"], {"expect": "decline"})
        self.assertEqual({k for k, v in q.items() if v.get("ordered")}, {"O04", "O05", "O10"})

    def test_setup_b_cannot_read_the_labs_own_copy_of_the_data(self):
        web = [t for t in self.setups["B"].tools if t.get("type", "").startswith(("web_search", "web_fetch"))]
        self.assertEqual(len(web), 2)
        for t in web:
            self.assertEqual(t["blocked_domains"], BLOCKED_DOMAINS)
        self.assertEqual([t["name"] for t in self.setups["A"].tools], ["submit_answer"])

    def test_setup_c_answers_from_the_semantic_layer(self):
        q = self.questions["O01"]

        def submit_from_result(messages):
            value = last_tool_result(messages)["rows"][0][0]
            return NS(content=[tool_use("submit_answer", {"outcome": "answer", "value": value, "explanation": "Revenue, 2025."}, "t2")],
                      stop_reason="tool_use", usage=usage())

        client = ScriptedClient([
            lambda m: NS(content=[tool_use("query_metrics", {"metrics": ["revenue"], "start_month": "2025-01", "end_month": "2025-12"})],
                         stop_reason="tool_use", usage=usage()),
            submit_from_result,
        ])
        rec = run.ask(client, self.setups["C"], q, Toolbox(self.layer), run.Guard(10, 1.0))
        self.assertEqual(rec["stop"], "submitted")
        self.assertEqual(rec["calls"], 2)
        self.assertEqual(score.judge(q, rec["answer"]), (True, "181141 against 181141"))

    def test_tool_errors_go_back_to_the_model(self):
        client = ScriptedClient([
            lambda m: NS(content=[tool_use("query_metrics", {"metrics": ["ebitda"]})], stop_reason="tool_use", usage=usage()),
            lambda m: NS(content=[tool_use("submit_answer", {"outcome": "decline", "explanation": last_tool_result(m)["error"]}, "t2")],
                         stop_reason="tool_use", usage=usage()),
        ])
        rec = run.ask(client, self.setups["C"], self.questions["D03"], Toolbox(self.layer), run.Guard(10, 1.0))
        self.assertTrue(rec["tool_calls"][0]["error"])
        self.assertIn("Defined metrics", rec["answer"]["explanation"])
        self.assertTrue(score.judge(self.questions["D03"], rec["answer"])[0])

    def test_pause_turn_is_resumed_and_a_missing_submission_nudged_once(self):
        client = ScriptedClient([
            lambda m: NS(content=[NS(type="text", text="Searching")], stop_reason="pause_turn", usage=usage(searches=1)),
            lambda m: NS(content=[NS(type="text", text="I think it is 5.")], stop_reason="end_turn", usage=usage()),
            lambda m: NS(content=[tool_use("submit_answer", {"outcome": "decline", "explanation": "No source."})], stop_reason="tool_use", usage=usage()),
        ])
        rec = run.ask(client, self.setups["B"], self.questions["D02"], Toolbox(), run.Guard(10, 1.0))
        self.assertEqual((rec["calls"], rec["searches"], rec["stop"]), (3, 1, "submitted"))
        self.assertIn("submit_answer", client.calls[2]["messages"][-1]["content"])

    def test_web_tools_fall_back_to_direct_calls_when_the_api_asks(self):
        def refuse(_m):
            raise RuntimeError("400 invalid_request_error: set allowed_callers to ['direct'] for this model")

        client = ScriptedClient([refuse, lambda m: NS(content=[tool_use("submit_answer", {"outcome": "decline", "explanation": "x"})], stop_reason="tool_use", usage=usage())])
        rec = run.ask(client, self.setups["B"], self.questions["D02"], Toolbox(), run.Guard(10, 1.0))
        self.assertEqual((rec["stop"], rec["web_callers"], rec["error"]), ("submitted", "direct", None))
        web = [t for t in client.calls[1]["tools"] if t.get("name") in ("web_search", "web_fetch")]
        self.assertTrue(all(t["allowed_callers"] == ["direct"] for t in web))
        self.assertNotIn("allowed_callers", self.setups["B"].tools[0])

    def test_budget_guard_stops_before_the_next_call(self):
        guard = run.Guard(max_calls=10, budget_usd=0.01)
        client = ScriptedClient([lambda m: NS(content=[tool_use("list_metrics", {})], stop_reason="tool_use", usage=usage(i=150_000, o=1000))])
        rec = run.ask(client, self.setups["C"], self.questions["O01"], Toolbox(self.layer), guard)
        self.assertEqual((rec["stop"], len(client.calls)), ("budget", 1))
        self.assertFalse(guard.allows())

    def test_request_cost_uses_the_prompt_length_tier(self):
        self.assertAlmostEqual(run.request_cost(usage(50_000, 1_000)), 0.005 + 0.0005)
        self.assertAlmostEqual(run.request_cost(usage(150_000, 1_000)), 0.075 + 0.0025)
        self.assertAlmostEqual(run.request_cost(usage(1_000, 0, searches=3)), 0.0001 + 0.03)

    def test_judge_handles_tables_rankings_declines_and_caveats(self):
        q = self.questions
        quarters = q["O03"]["key"]["result"]["rows"]
        shuffled = [{"label": f"Q{r['label'][-1]} 2025", "value": r["value"]} for r in reversed(quarters)]
        self.assertTrue(score.judge(q["O03"], {"outcome": "answer", "rows": shuffled, "explanation": ""})[0])
        top3 = q["O10"]["key"]["result"]["rows"]
        self.assertTrue(score.judge(q["O10"], {"outcome": "answer", "rows": top3, "explanation": ""})[0])
        self.assertFalse(score.judge(q["O10"], {"outcome": "answer", "rows": list(reversed(top3)), "explanation": ""})[0])
        self.assertFalse(score.judge(q["O01"], {"outcome": "decline", "explanation": ""})[0])
        caveat = {"id": "D07", "kind": "decline", "key": {"expect": "caveat"}}
        self.assertFalse(score.judge(caveat, {"outcome": "answer", "value": 1, "explanation": "It fell because of X."})[0])
        self.assertTrue(score.judge(caveat, {"outcome": "answer", "value": 1, "explanation": "", "caveat": "Not causal."})[0])
        fact = {"id": "P01", "kind": "public_fact", "key": {"expect": "answer", "value": -3.3, "tolerance": 0.1, "tolerance_pct": None}}
        self.assertTrue(score.judge(fact, {"outcome": "answer", "value": -3.28, "explanation": ""})[0])
        self.assertFalse(score.judge(fact, {"outcome": "answer", "value": -3.9, "explanation": ""})[0])
        self.assertFalse(score.judge(q["O01"], {"outcome": "answer", "value": "about 181k", "explanation": ""})[0])

    def test_compute_runs_the_approved_calculations(self):
        box = Toolbox(self.layer)
        r = json.loads(box.call("query_metrics", {"metrics": ["revenue", "opex"], "group_by": ["quarter"], "start_month": "2025-01", "end_month": "2025-12"})[0])
        rid = r["result_id"]
        growth = json.loads(box.call("compute", {"function": "growth", "result_id": rid, "value_column": "revenue"})[0])
        self.assertEqual(len(growth["rows"]), 3)
        corr = json.loads(box.call("compute", {"function": "correlation", "result_id": rid, "value_column": "revenue", "other_column": "opex"})[0])
        self.assertEqual(corr["n"], 4)
        self.assertLessEqual(abs(corr["r"]), 1)
        ba = json.loads(box.call("compute", {"function": "before_after", "result_id": rid, "value_column": "revenue", "split_label": "2025-Q3", "control_column": "opex"})[0])
        self.assertEqual((ba["rows_before"], ba["rows_after"]), (2, 2))
        self.assertAlmostEqual(ba["difference_in_differences"], ba["treated"]["difference"] - ba["control"]["difference"], places=5)
        text, is_error = box.call("compute", {"function": "growth", "result_id": "r9", "value_column": "revenue"})
        self.assertTrue(is_error)
        self.assertIn("No stored result", text)

    def run_main(self, client):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        out = Path(tmp.name) / "run.jsonl"
        code = run.main(["--setups", "A", "--only", "O01,D01", "--out", str(out)], client=client)
        lines = [json.loads(line) for line in out.read_text().splitlines()] if out.exists() else []
        return code, lines, score.score(out, list(self.questions.values())) if lines else None

    def test_a_refused_key_stops_the_run_before_any_question(self):
        client = FakeClient(refuse_key=AuthenticationError("Error code: 401 - invalid x-api-key"))
        code, lines, result = self.run_main(client)
        self.assertEqual((code, client.created), (2, 0))
        self.assertEqual([line["type"] for line in lines], ["run", "stop"])
        text = score.markdown(result)
        self.assertIn("No scores: the API refused the run before the first question", text)
        self.assertIn("ANTHROPIC_API_KEY", text)
        self.assertNotIn("| A |", text)

    def test_a_refused_call_stops_the_run_at_once(self):
        client = FakeClient(fail_calls=AuthenticationError("Error code: 401 - invalid x-api-key"))
        code, lines, result = self.run_main(client)
        self.assertEqual((code, client.created), (2, 1))
        self.assertEqual([line["type"] for line in lines], ["run", "answer", "stop"])
        self.assertIn("Stopped early", score.markdown(result))

    def test_answers_that_end_in_an_error_fail_the_run_and_lead_the_summary(self):
        client = FakeClient(fail_calls=InternalServerError("Error code: 500 - overloaded"))
        code, _, result = self.run_main(client)
        self.assertEqual((code, client.created), (1, 2))
        self.assertEqual((result["answers"], result["errors"]), (2, 2))
        text = score.markdown(result)
        self.assertIn("2 of 2 answers ended in an error", text)
        self.assertIn("| A | 0 of 2 | 2 |", text)

    def test_a_clean_run_exits_zero(self):
        client = FakeClient()
        code, _, result = self.run_main(client)
        self.assertEqual((code, client.created), (0, 2))
        text = score.markdown(result)
        self.assertIn("| A | 1 of 2 | 0 |", text)  # both declined: D01 right, O01 wrong
        self.assertNotIn("ended in an error", text)

    def test_dry_run_writes_and_scores_a_run_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "run.jsonl"
            self.assertEqual(run.main(["--dry-run", "--setups", "A,C", "--out", str(out)]), 0)
            result = score.score(out, list(self.questions.values()))
            for name in ("A", "C"):
                s = result["setups"][name]
                self.assertEqual((s["answers"], s["right"], s["right_decline"], s["over_refusals"]), (16, 6, 6, 10))
            self.assertIn("| A | 6 of 16 |", score.markdown(result))


if __name__ == "__main__":
    unittest.main()
