"""Fault Tree Analysis (FTA) toolkit built on top of the `anytree` library.

Case study: loss of medical oxygen supply to a hospital Intensive Care Unit (ICU).
"""

from .model import FaultTree, FaultTreeError, GATE_KINDS, BASIC, KINDS
from .analysis import analyze
from .structure import describe_structure

__all__ = [
    "FaultTree",
    "FaultTreeError",
    "GATE_KINDS",
    "BASIC",
    "KINDS",
    "analyze",
    "describe_structure",
]
