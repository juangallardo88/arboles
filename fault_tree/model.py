"""Fault tree data model.

Every event of the fault tree is an `anytree.Node`:

* ``name``         -> unique identifier (e.g. ``"G1"`` or ``"E4"``)
* ``label``        -> human readable description of the event
* ``kind``         -> ``"AND"`` / ``"OR"`` for gates, ``"BASIC"`` for basic events
* ``probability``  -> failure probability (only for basic events)
* ``description``  -> optional notes

anytree gives us parent/child links, traversal iterators, search helpers,
depth/height calculation and loop detection, so this module only adds the
fault-tree rules on top of it.
"""

from __future__ import annotations

import re
from typing import Any

from anytree import Node, PreOrderIter, find, findall

GATE_KINDS = ("AND", "OR")
BASIC = "BASIC"
KINDS = GATE_KINDS + (BASIC,)


class FaultTreeError(ValueError):
    """Raised when an operation would break the fault tree rules."""


def _clean_label(label: Any) -> str:
    text = str(label or "").strip()
    if not text:
        raise FaultTreeError("The event label cannot be empty.")
    if len(text) > 80:
        raise FaultTreeError("The event label must be 80 characters or fewer.")
    return text


def _clean_kind(kind: Any) -> str:
    value = str(kind or "").strip().upper()
    if value not in KINDS:
        raise FaultTreeError(f"Invalid kind '{kind}'. Use one of: {', '.join(KINDS)}.")
    return value


def _clean_probability(probability: Any) -> float:
    try:
        value = float(probability)
    except (TypeError, ValueError):
        raise FaultTreeError("The probability must be a number between 0 and 1.") from None
    if not 0.0 <= value <= 1.0:
        raise FaultTreeError("The probability must be between 0 and 1.")
    return value


class FaultTree:
    """A fault tree whose root is the undesired *top event*."""

    def __init__(self, root: Node):
        self.root = root

    # ------------------------------------------------------------------ #
    # Serialization
    # ------------------------------------------------------------------ #
    @classmethod
    def from_dict(cls, data: dict) -> "FaultTree":
        """Build a tree from a nested dictionary (the JSON file format)."""
        if not isinstance(data, dict):
            raise FaultTreeError("The tree data must be a JSON object.")
        seen: set[str] = set()
        root = cls._node_from_dict(data, None, seen)
        if root.kind == BASIC:
            raise FaultTreeError("The top event must be a gate (AND / OR).")
        return cls(root)

    @classmethod
    def _node_from_dict(cls, data: dict, parent: Node | None, seen: set[str]) -> Node:
        node_id = str(data.get("id", "")).strip()
        if not node_id:
            raise FaultTreeError("Every event needs an 'id'.")
        if node_id in seen:
            raise FaultTreeError(f"Duplicated event id '{node_id}'.")
        seen.add(node_id)

        kind = _clean_kind(data.get("kind"))
        children = data.get("children") or []
        if kind == BASIC and children:
            raise FaultTreeError(f"Basic event '{node_id}' cannot have children.")

        node = Node(
            node_id,
            parent=parent,
            label=_clean_label(data.get("label")),
            kind=kind,
            probability=_clean_probability(data.get("probability", 0)) if kind == BASIC else None,
            description=str(data.get("description") or "").strip(),
        )
        for child in children:
            cls._node_from_dict(child, node, seen)
        return node

    def to_dict(self, node: Node | None = None) -> dict:
        """Export the tree (or a subtree) as a nested dictionary."""
        node = node or self.root
        data = {
            "id": node.name,
            "label": node.label,
            "kind": node.kind,
            "description": node.description,
        }
        if node.kind == BASIC:
            data["probability"] = node.probability
        else:
            data["children"] = [self.to_dict(child) for child in node.children]
        return data

    # ------------------------------------------------------------------ #
    # Queries
    # ------------------------------------------------------------------ #
    def get(self, node_id: str) -> Node:
        node = find(self.root, filter_=lambda n: n.name == node_id)
        if node is None:
            raise FaultTreeError(f"Event '{node_id}' does not exist.")
        return node

    def search(self, query: str) -> list[str]:
        """Return the ids of events whose id, label or description match."""
        text = (query or "").strip().lower()
        if not text:
            return []
        matches = findall(
            self.root,
            filter_=lambda n: text in n.name.lower()
            or text in n.label.lower()
            or text in n.description.lower(),
        )
        return [node.name for node in matches]

    def basic_events(self) -> list[Node]:
        return [n for n in PreOrderIter(self.root) if n.kind == BASIC]

    def _next_id(self, kind: str) -> str:
        prefix = "E" if kind == BASIC else "G"
        numbers = [
            int(match.group(1))
            for node in PreOrderIter(self.root)
            if (match := re.fullmatch(rf"{prefix}(\d+)", node.name))
        ]
        return f"{prefix}{max(numbers, default=0) + 1}"

    # ------------------------------------------------------------------ #
    # Mutations
    # ------------------------------------------------------------------ #
    def add_event(
        self,
        parent_id: str,
        label: str,
        kind: str,
        probability: Any = None,
        description: str = "",
    ) -> Node:
        parent = self.get(parent_id)
        if parent.kind == BASIC:
            raise FaultTreeError(
                "Basic events are leaves: add the new event under an AND / OR gate."
            )
        kind = _clean_kind(kind)
        return Node(
            self._next_id(kind),
            parent=parent,
            label=_clean_label(label),
            kind=kind,
            probability=_clean_probability(probability) if kind == BASIC else None,
            description=str(description or "").strip(),
        )

    def update_event(self, node_id: str, **changes: Any) -> Node:
        node = self.get(node_id)

        if "kind" in changes and changes["kind"] is not None:
            new_kind = _clean_kind(changes["kind"])
            if new_kind == BASIC and node.children:
                raise FaultTreeError(
                    "This gate has children. Delete or move them before turning it into a basic event."
                )
            if new_kind == BASIC and node.is_root:
                raise FaultTreeError("The top event must stay a gate (AND / OR).")
            if new_kind == BASIC and node.kind != BASIC:
                node.probability = _clean_probability(changes.get("probability") or 0)
            if new_kind != BASIC:
                node.probability = None
            node.kind = new_kind

        if "label" in changes and changes["label"] is not None:
            node.label = _clean_label(changes["label"])
        if "description" in changes and changes["description"] is not None:
            node.description = str(changes["description"]).strip()
        if node.kind == BASIC and changes.get("probability") is not None:
            node.probability = _clean_probability(changes["probability"])
        return node

    def delete_event(self, node_id: str) -> int:
        """Detach a whole subtree. Returns how many events were removed."""
        node = self.get(node_id)
        if node.is_root:
            raise FaultTreeError("The top event cannot be deleted.")
        removed = 1 + len(node.descendants)
        node.parent = None  # anytree detaches the full subtree
        return removed

    def move_event(self, node_id: str, new_parent_id: str) -> Node:
        node = self.get(node_id)
        new_parent = self.get(new_parent_id)
        if node.is_root:
            raise FaultTreeError("The top event cannot be moved.")
        if new_parent.kind == BASIC:
            raise FaultTreeError("The new parent must be an AND / OR gate.")
        if new_parent is node or new_parent in node.descendants:
            raise FaultTreeError("An event cannot be moved inside its own subtree.")
        node.parent = new_parent
        return node
