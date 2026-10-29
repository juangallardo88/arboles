"""Flask web application: REST API + frontend for the oxygen supply fault tree.

Run:
    pip install -r requirements.txt
    python app.py
Then open http://127.0.0.1:5000
"""

from __future__ import annotations

import threading
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, render_template, request

from fault_tree import FaultTree, FaultTreeError, analyze, describe_structure
from fault_tree.storage import TreeStorage

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "fault_tree.json"

app = Flask(__name__)
storage = TreeStorage(DATA_FILE)
tree_lock = threading.Lock()
state = {"tree": storage.load()}


def snapshot(message: str | None = None, focus: str | None = None) -> dict:
    tree: FaultTree = state["tree"]
    return {
        "tree": tree.to_dict(),
        "analysis": analyze(tree),
        "structure": describe_structure(tree.root),
        "message": message,
        "focus": focus,
    }


def api_action(handler):
    """Run a mutation safely: lock, save, and turn errors into JSON."""

    @wraps(handler)
    def wrapper(*args, **kwargs):
        with tree_lock:
            try:
                result = handler(*args, **kwargs)
                storage.save(state["tree"])
                return jsonify(result)
            except FaultTreeError as error:
                return jsonify({"error": str(error)}), 400

    return wrapper


def payload() -> dict:
    return request.get_json(silent=True) or {}


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/tree")
def get_tree():
    with tree_lock:
        return jsonify(snapshot())


@app.post("/api/events")
@api_action
def add_event():
    data = payload()
    node = state["tree"].add_event(
        parent_id=data.get("parent_id", ""),
        label=data.get("label", ""),
        kind=data.get("kind", ""),
        probability=data.get("probability"),
        description=data.get("description", ""),
    )
    return snapshot(f"Event {node.name} added under {node.parent.name}.", node.name)


@app.patch("/api/events/<event_id>")
@api_action
def update_event(event_id: str):
    data = payload()
    node = state["tree"].update_event(
        event_id,
        label=data.get("label"),
        kind=data.get("kind"),
        probability=data.get("probability"),
        description=data.get("description"),
    )
    return snapshot(f"Event {node.name} updated.", node.name)


@app.delete("/api/events/<event_id>")
@api_action
def delete_event(event_id: str):
    tree: FaultTree = state["tree"]
    parent_id = tree.get(event_id).parent.name if not tree.get(event_id).is_root else None
    removed = tree.delete_event(event_id)
    return snapshot(f"{removed} event(s) removed.", parent_id)


@app.post("/api/events/<event_id>/move")
@api_action
def move_event(event_id: str):
    node = state["tree"].move_event(event_id, payload().get("new_parent_id", ""))
    return snapshot(f"Event {node.name} moved under {node.parent.name}.", node.name)


@app.post("/api/import")
@api_action
def import_tree():
    state["tree"] = FaultTree.from_dict(payload())
    return snapshot("Tree imported from JSON.")


@app.post("/api/reset")
@api_action
def reset_tree():
    state["tree"] = storage.reset()
    return snapshot("Case study restored to its original version.")


@app.get("/api/search")
def search():
    with tree_lock:
        return jsonify({"results": state["tree"].search(request.args.get("q", ""))})


@app.get("/api/export")
def export_tree():
    with tree_lock:
        response = jsonify(state["tree"].to_dict())
    response.headers["Content-Disposition"] = "attachment; filename=fault_tree.json"
    return response


if __name__ == "__main__":
    app.run(debug=True, port=5000)
