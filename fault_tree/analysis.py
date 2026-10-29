"""Quantitative and qualitative fault tree analysis.

* Probability of every event, computed bottom-up (post-order traversal):
    - OR gate  : P = 1 - (1 - p1)(1 - p2)...(1 - pn)
    - AND gate : P = p1 * p2 * ... * pn
  (basic events are assumed to be independent and each one appears once).
* Minimal cut sets: the smallest combinations of basic events that, when they
  happen together, cause the top event.
* Importance measures for every basic event:
    - Birnbaum      : P(top | event happens) - P(top | event never happens)
    - Fussell-Vesely: share of the top-event risk that goes through the event
"""

from __future__ import annotations

from itertools import product
from math import prod

from anytree import Node, PostOrderIter

from .model import BASIC, FaultTree

MAX_CUT_SETS = 2000  # safety limit for very large trees


def event_probabilities(root: Node, overrides: dict[str, float] | None = None) -> dict[str, float]:
    """Probability of every event, using a post-order traversal (children first)."""
    overrides = overrides or {}
    values: dict[str, float] = {}
    for node in PostOrderIter(root):
        if node.kind == BASIC:
            values[node.name] = overrides.get(node.name, node.probability or 0.0)
            continue
        children = [values[child.name] for child in node.children]
        if not children:
            values[node.name] = 0.0
        elif node.kind == "AND":
            values[node.name] = prod(children)
        else:  # OR
            values[node.name] = 1.0 - prod(1.0 - p for p in children)
    return values


def _minimize(cut_sets: list[frozenset]) -> list[frozenset]:
    """Remove duplicates and any set that contains a smaller one."""
    unique = sorted(set(cut_sets), key=len)
    minimal: list[frozenset] = []
    for candidate in unique:
        if not any(existing <= candidate for existing in minimal):
            minimal.append(candidate)
    return minimal


def minimal_cut_sets(node: Node) -> list[frozenset]:
    """Top-down recursive expansion of the gates (MOCUS-style)."""
    if node.kind == BASIC:
        return [frozenset({node.name})]
    child_sets = [minimal_cut_sets(child) for child in node.children]
    if not child_sets:
        return []
    if node.kind == "OR":
        combined = [cut for sets in child_sets for cut in sets]
    else:  # AND -> every combination of one cut set per child
        if any(not sets for sets in child_sets):
            return []
        combined = [frozenset().union(*combo) for combo in product(*child_sets)]
    if len(combined) > MAX_CUT_SETS:
        raise OverflowError("Too many cut sets to analyse.")
    return _minimize(combined)


def importance_measures(tree: FaultTree, cut_sets: list[frozenset]) -> list[dict]:
    base = event_probabilities(tree.root)
    top = base[tree.root.name]
    cut_probs = [(cut, prod(base[e] for e in cut)) for cut in cut_sets]
    total_cut_prob = sum(p for _, p in cut_probs) or 1.0

    results = []
    for event in tree.basic_events():
        p_true = event_probabilities(tree.root, {event.name: 1.0})[tree.root.name]
        p_false = event_probabilities(tree.root, {event.name: 0.0})[tree.root.name]
        birnbaum = p_true - p_false
        fussell_vesely = sum(p for cut, p in cut_probs if event.name in cut) / total_cut_prob
        criticality = birnbaum * event.probability / top if top > 0 else 0.0
        results.append(
            {
                "id": event.name,
                "label": event.label,
                "probability": event.probability,
                "birnbaum": birnbaum,
                "fussell_vesely": fussell_vesely,
                "criticality": criticality,
            }
        )
    results.sort(key=lambda item: item["fussell_vesely"], reverse=True)
    return results


def analyze(tree: FaultTree) -> dict:
    probabilities = event_probabilities(tree.root)
    warnings = []
    for node in PostOrderIter(tree.root):
        if node.kind != BASIC and len(node.children) < 2:
            warnings.append(
                f"Gate {node.name} ({node.kind}) has {len(node.children)} input(s); "
                "a gate normally needs at least 2."
            )

    try:
        cuts = minimal_cut_sets(tree.root)
    except OverflowError as error:
        cuts = []
        warnings.append(str(error))

    labels = {e.name: e.label for e in tree.basic_events()}
    cut_rows = []
    for cut in cuts:
        events = sorted(cut)
        cut_rows.append(
            {
                "events": events,
                "labels": [labels[e] for e in events],
                "order": len(events),
                "probability": prod(probabilities[e] for e in events),
            }
        )
    cut_rows.sort(key=lambda row: (-row["probability"], row["order"]))
    total = sum(row["probability"] for row in cut_rows) or 1.0
    for row in cut_rows:
        row["share"] = row["probability"] / total

    return {
        "top_event_probability": probabilities[tree.root.name],
        "probabilities": probabilities,
        "cut_sets": cut_rows,
        "single_points_of_failure": [row["events"][0] for row in cut_rows if row["order"] == 1],
        "importance": importance_measures(tree, cuts),
        "warnings": warnings,
    }
