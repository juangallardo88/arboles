"""Tree theory concepts seen in class, measured on the fault tree.

Conventions used (same as the class slides):
* The root is on level 1, its children on level 2, and so on.
* Height = number of levels of the longest path from the root to a leaf.
* Weight = total number of nodes (root and leaves included).
* Degree of a node = number of children. Order of the tree = maximum degree.

anytree counts depth from 0 and height in edges, so we add 1 where needed.
"""

from __future__ import annotations

from anytree import LevelOrderGroupIter, Node, PostOrderIter, PreOrderIter, RenderTree


def node_role(node: Node) -> str:
    if node.is_root:
        return "root"
    if node.is_leaf:
        return "leaf"
    return "branch"


def in_order(node: Node) -> list[str]:
    """Generalised in-order traversal: first child, node, remaining children.

    For a binary tree it is exactly left - root - right, as seen in class.
    """
    if node.is_leaf:
        return [node.name]
    first, *rest = node.children
    result = in_order(first) + [node.name]
    for child in rest:
        result += in_order(child)
    return result


def describe_node(node: Node) -> dict:
    return {
        "id": node.name,
        "role": node_role(node),
        "level": node.depth + 1,
        "degree": len(node.children),
        "height": node.height + 1,
        "parent": node.parent.name if node.parent else None,
        "children": [child.name for child in node.children],
        "siblings": [sibling.name for sibling in node.siblings],
        "ancestors": [ancestor.name for ancestor in node.ancestors],
        "subtree_weight": 1 + len(node.descendants),
    }


def describe_structure(root: Node) -> dict:
    nodes = list(PreOrderIter(root))
    leaves = [n.name for n in root.leaves]
    branches = [n.name for n in nodes if not n.is_root and not n.is_leaf]
    levels = [
        {"level": index + 1, "nodes": [n.name for n in group]}
        for index, group in enumerate(LevelOrderGroupIter(root))
    ]
    ascii_lines = [
        f"{prefix}{node.name} [{node.kind}] {node.label}"
        + (f"  (p={node.probability:g})" if node.probability is not None else "")
        for prefix, _, node in RenderTree(root)
    ]
    return {
        "root": root.name,
        "weight": len(nodes),
        "height": root.height + 1,
        "order": max(len(n.children) for n in nodes),
        "leaves": leaves,
        "branches": branches,
        "levels": levels,
        "nodes": {n.name: describe_node(n) for n in nodes},
        "traversals": {
            "pre_order": [n.name for n in nodes],
            "in_order": in_order(root),
            "post_order": [n.name for n in PostOrderIter(root)],
            "level_order": [name for level in levels for name in level["nodes"]],
        },
        "ascii": "\n".join(ascii_lines),
    }
