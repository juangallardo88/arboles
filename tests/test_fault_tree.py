"""Unit tests. Run with:  python -m unittest discover tests"""

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fault_tree import FaultTree, FaultTreeError, analyze, describe_structure  # noqa: E402
from fault_tree.analysis import event_probabilities, minimal_cut_sets  # noqa: E402
from fault_tree.sample_data import OXYGEN_SUPPLY_TREE  # noqa: E402


def sample_tree() -> FaultTree:
    return FaultTree.from_dict(copy.deepcopy(OXYGEN_SUPPLY_TREE))


class GateMathTests(unittest.TestCase):
    def test_or_and_gates(self):
        tree = FaultTree.from_dict(
            {
                "id": "G1", "label": "Top", "kind": "OR",
                "children": [
                    {"id": "E1", "label": "A", "kind": "BASIC", "probability": 0.1},
                    {
                        "id": "G2", "label": "Both", "kind": "AND",
                        "children": [
                            {"id": "E2", "label": "B", "kind": "BASIC", "probability": 0.5},
                            {"id": "E3", "label": "C", "kind": "BASIC", "probability": 0.2},
                        ],
                    },
                ],
            }
        )
        probs = event_probabilities(tree.root)
        self.assertAlmostEqual(probs["G2"], 0.1)
        self.assertAlmostEqual(probs["G1"], 1 - 0.9 * 0.9)
        cuts = minimal_cut_sets(tree.root)
        self.assertCountEqual(cuts, [frozenset({"E1"}), frozenset({"E2", "E3"})])

    def test_cut_sets_are_minimal(self):
        tree = FaultTree.from_dict(
            {
                "id": "G1", "label": "Top", "kind": "AND",
                "children": [
                    {"id": "G2", "label": "x", "kind": "OR", "children": [
                        {"id": "E1", "label": "A", "kind": "BASIC", "probability": 0.1},
                        {"id": "E2", "label": "B", "kind": "BASIC", "probability": 0.1},
                    ]},
                    {"id": "G3", "label": "y", "kind": "OR", "children": [
                        {"id": "E3", "label": "C", "kind": "BASIC", "probability": 0.1},
                        {"id": "E4", "label": "D", "kind": "BASIC", "probability": 0.1},
                    ]},
                ],
            }
        )
        self.assertEqual(len(minimal_cut_sets(tree.root)), 4)


class CaseStudyTests(unittest.TestCase):
    def setUp(self):
        self.tree = sample_tree()

    def test_structure_matches_class_concepts(self):
        info = describe_structure(self.tree.root)
        self.assertEqual(info["root"], "G1")
        self.assertEqual(info["weight"], 19)
        self.assertEqual(info["height"], 5)
        self.assertEqual(info["order"], 3)
        self.assertEqual(info["nodes"]["G1"]["level"], 1)
        self.assertEqual(info["nodes"]["E5"]["level"], 5)
        self.assertIn("E12", info["leaves"])
        self.assertIn("G5", info["branches"])
        self.assertEqual(info["traversals"]["pre_order"][0], "G1")
        self.assertEqual(info["traversals"]["post_order"][-1], "G1")
        self.assertEqual(len(info["traversals"]["in_order"]), 19)

    def test_analysis(self):
        result = analyze(self.tree)
        self.assertGreater(result["top_event_probability"], 0)
        self.assertLess(result["top_event_probability"], 1)
        self.assertIn("E12", result["single_points_of_failure"])
        self.assertEqual(result["warnings"], [])
        shares = sum(row["share"] for row in result["cut_sets"])
        self.assertAlmostEqual(shares, 1.0)

    def test_add_update_delete(self):
        node = self.tree.add_event("G6", "Earthquake", "BASIC", 0.0005)
        self.assertEqual(node.name, "E13")
        self.tree.update_event("E13", probability=0.001, label="Seismic damage")
        self.assertEqual(self.tree.get("E13").probability, 0.001)
        self.assertEqual(self.tree.delete_event("G2"), 11)
        with self.assertRaises(FaultTreeError):
            self.tree.get("E1")

    def test_rules(self):
        with self.assertRaises(FaultTreeError):
            self.tree.add_event("E1", "child of leaf", "BASIC", 0.1)
        with self.assertRaises(FaultTreeError):
            self.tree.add_event("G2", "bad", "BASIC", 2)
        with self.assertRaises(FaultTreeError):
            self.tree.delete_event("G1")
        with self.assertRaises(FaultTreeError):
            self.tree.move_event("G2", "G5")  # inside its own subtree
        with self.assertRaises(FaultTreeError):
            self.tree.update_event("G2", kind="BASIC")

    def test_move_and_search(self):
        self.tree.move_event("E12", "G6")
        self.assertEqual(self.tree.get("E12").parent.name, "G6")
        self.assertIn("E11", self.tree.search("alarm"))

    def test_round_trip(self):
        copy_tree = FaultTree.from_dict(self.tree.to_dict())
        self.assertEqual(copy_tree.to_dict(), self.tree.to_dict())


if __name__ == "__main__":
    unittest.main()
