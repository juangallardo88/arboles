"""JSON persistence for the fault tree."""

from __future__ import annotations

import copy
import json
from pathlib import Path

from .model import FaultTree
from .sample_data import OXYGEN_SUPPLY_TREE


class TreeStorage:
    def __init__(self, path: Path):
        self.path = Path(path)

    def load(self) -> FaultTree:
        if self.path.exists():
            try:
                with self.path.open(encoding="utf-8") as file:
                    return FaultTree.from_dict(json.load(file))
            except (OSError, ValueError):
                pass  # corrupted file -> fall back to the sample case
        return self.reset()

    def save(self, tree: FaultTree) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.path.with_suffix(".tmp")
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(tree.to_dict(), file, indent=2, ensure_ascii=False)
        temp_path.replace(self.path)

    def reset(self) -> FaultTree:
        tree = FaultTree.from_dict(copy.deepcopy(OXYGEN_SUPPLY_TREE))
        self.save(tree)
        return tree
