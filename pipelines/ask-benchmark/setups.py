"""The four setups. The same model and the same questions; only the tools change.

A  the model alone
B  plus web search, web fetch and code execution: the web as the database
C  plus the ledger's semantic layer
D  plus the semantic layer and approved calculations; the indicator catalogue joins when it has series
"""

from __future__ import annotations

from dataclasses import dataclass, field

from tools import COMPUTE, LIST_METRICS, QUERY_METRICS, SUBMIT_ANSWER

MODEL = "claude-haiku-5-5"

# Server tool versions, read on the Claude API docs on 2026-11-26. With these versions code
# execution is free; only tokens and searches are billed.
WEB_SEARCH = "web_search_20260209"
WEB_FETCH = "web_fetch_20260209"
CODE_EXECUTION = "code_execution_20260120"

# The Lab publishes the ledger and the benchmark answers; setup B must not read them back.
BLOCKED_DOMAINS = ["felipealveslab.com", "github.com/felipealves7", "raw.githubusercontent.com/felipealves7"]

CONTEXT = """You answer questions in a benchmark run by the Felipe Alves Lab.

Some questions are about a synthetic ledger: six invented companies (North Hub, Harbour Retail, \
Delta Services, Summit Logistics, Orchard Foods, Lakeside Energy), January 2025 to September 2026, \
amounts in thousands of AED. The questions are asked in October 2026, so "last quarter" means July to \
September 2026 and "last month" means September 2026. Other questions are about public economic data.

Decline when the question is ambiguous, asks for something outside the data, or asks why something \
happened when the data cannot show causes. For a list or a table, give every row, in the order the \
question asks for. Finish by calling submit_answer exactly once."""

TOOL_RULES = {
    "A": "You have no tools besides submit_answer. Answer from what you know only if you are confident; otherwise decline.",
    "B": "You can search the web, fetch pages and run code. Report only numbers you found in a source or computed with code, and list the sources.",
    "C": "You can query the ledger through its semantic layer with list_metrics and query_metrics. Report only numbers the tools returned. For public data you have no tools: answer from what you know only if you are confident; otherwise decline.",
    "D": "You can query the ledger through its semantic layer with list_metrics and query_metrics, and run approved calculations on stored results with compute. Report only numbers the tools returned. For public data you have no tools yet: answer from what you know only if you are confident; otherwise decline.",
}


@dataclass
class Setup:
    name: str
    label: str
    tools: list[dict] = field(default_factory=list)
    uses_semantic_layer: bool = False

    @property
    def system(self) -> str:
        return f"{CONTEXT}\n\n{TOOL_RULES[self.name]}"


def make_setups(max_searches: int = 5, max_fetches: int = 5) -> dict[str, Setup]:
    web = [
        {"type": WEB_SEARCH, "name": "web_search", "max_uses": max_searches, "blocked_domains": BLOCKED_DOMAINS},
        {"type": WEB_FETCH, "name": "web_fetch", "max_uses": max_fetches, "blocked_domains": BLOCKED_DOMAINS},
        {"type": CODE_EXECUTION, "name": "code_execution"},
    ]
    return {
        "A": Setup("A", "Model only", [SUBMIT_ANSWER]),
        "B": Setup("B", "Web search, fetch and code", [*web, SUBMIT_ANSWER]),
        "C": Setup("C", "Semantic layer", [LIST_METRICS, QUERY_METRICS, SUBMIT_ANSWER], uses_semantic_layer=True),
        "D": Setup("D", "Semantic layer and approved calculations", [LIST_METRICS, QUERY_METRICS, COMPUTE, SUBMIT_ANSWER], uses_semantic_layer=True),
    }


def with_direct_web(setup: Setup) -> Setup:
    """B with web search and fetch called directly, for a model that cannot call them from code."""
    tools = [{**t, "allowed_callers": ["direct"]} if t.get("name") in ("web_search", "web_fetch") else t for t in setup.tools]
    return Setup(setup.name, setup.label, tools, setup.uses_semantic_layer)
