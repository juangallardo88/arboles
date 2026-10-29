/* SVG renderer for the fault tree: tidy layout, FTA gate symbols, pan & zoom. */
class TreeView {
  static BOX_W = 196;
  static BOX_H = 74;
  static GAP_X = 26;
  static GATE_H = 30;
  static LEVEL_H = 160;
  static STACK_INDENT = 22;
  static STACK_GAP = 14;
  static NS = "http://www.w3.org/2000/svg";

  constructor(svg, viewport, { onSelect } = {}) {
    this.svg = svg;
    this.viewport = viewport;
    this.onSelect = onSelect || (() => {});
    this.collapsed = new Set();
    this.view = { x: 40, y: 30, k: 1 };
    this.mode = "logic";
    this.selected = null;
    this.highlight = null; // { nodes:Set, edges:Set } or null
    this.matches = new Set();
    this.visit = null; // { order: Map(id->n), current }
    this.positions = new Map();
    this.bindPanZoom();
  }

  /* ---------------------------------------------------------------- */
  el(tag, attrs = {}, parent) {
    const node = document.createElementNS(TreeView.NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (parent) parent.appendChild(node);
    return node;
  }

  /* Tidy layout: leaves get consecutive x slots, parents are centered.
     A gate whose inputs are all basic events stacks them vertically
     (compact "comb" layout) so wide trees stay readable. */
  layout(root) {
    const { BOX_W, BOX_H, GAP_X, LEVEL_H, STACK_INDENT, STACK_GAP } = TreeView;
    const positions = new Map();
    let nextX = 0;
    const place = (node, depth) => {
      const kids = this.collapsed.has(node.id) ? [] : node.children || [];
      const stacked = kids.length >= 2 && kids.every((child) => child.kind === "BASIC");
      let x;
      if (!kids.length) {
        x = nextX;
        nextX += BOX_W + GAP_X;
      } else if (stacked) {
        x = nextX;
        nextX += BOX_W + STACK_INDENT + GAP_X;
        kids.forEach((child, i) => {
          positions.set(child.id, {
            x: x + STACK_INDENT,
            y: (depth + 1) * LEVEL_H - 30 + i * (BOX_H + STACK_GAP),
            node: child,
            kids: [],
          });
        });
      } else {
        const xs = kids.map((child) => place(child, depth + 1));
        x = (xs[0] + xs[xs.length - 1]) / 2;
      }
      positions.set(node.id, { x, y: depth * LEVEL_H, node, kids, stacked });
      return x;
    };
    place(root, 0);
    return positions;
  }

  render(tree, probabilities, structure) {
    this.tree = tree;
    this.probabilities = probabilities;
    this.structure = structure;
    this.draw();
  }

  draw() {
    if (!this.tree) return;
    const { BOX_W, BOX_H, GATE_H } = TreeView;
    this.viewport.replaceChildren();
    this.positions = this.layout(this.tree);

    const edges = this.el("g", {}, this.viewport);
    const nodes = this.el("g", {}, this.viewport);

    for (const [id, pos] of this.positions) {
      // Edges from the gate output down to every child (orthogonal elbows).
      if (pos.kids.length) {
        const startX = pos.x + BOX_W / 2;
        const startY = pos.y + BOX_H + GATE_H + 8;
        const midY = startY + 26;
        for (const child of pos.kids) {
          const cp = this.positions.get(child.id);
          const endX = cp.x + BOX_W / 2;
          const spineX = pos.x + TreeView.STACK_INDENT / 2;
          const d = pos.stacked
            ? `M${startX},${startY} V${startY + 8} H${spineX} V${cp.y + BOX_H / 2} H${cp.x}`
            : `M${startX},${startY} V${midY} H${endX} V${cp.y}`;
          const path = this.el("path", { d, class: "edge" }, edges);
          path.dataset.edge = `${id}>${child.id}`;
        }
      }
      nodes.appendChild(this.drawNode(pos));
    }
    this.applyState();
  }

  colorsFor(node) {
    const role = this.structure?.nodes?.[node.id]?.role;
    if (this.mode === "class") {
      const fill = { root: "#fff1c2", branch: "#e5eefa", leaf: "#e3f4d6" }[role];
      const stroke = { root: "#f5b301", branch: "#7fa6d6", leaf: "#6cb33f" }[role];
      return { fill, stroke, accent: stroke };
    }
    if (node.kind === "BASIC") {
      const color = Format.heat(node.probability);
      return { fill: "#ffffff", stroke: "#b8c6cf", accent: color };
    }
    const color = node.kind === "OR" ? "#3c5bd6" : "#0b8f8f";
    return { fill: "#ffffff", stroke: color, accent: color };
  }

  drawNode(pos) {
    const { BOX_W, BOX_H, GATE_H } = TreeView;
    const node = pos.node;
    const p = this.probabilities?.[node.id];
    const colors = this.colorsFor(node);
    const g = this.el("g", { class: "node", transform: `translate(${pos.x},${pos.y})` });
    g.dataset.id = node.id;

    // Gate symbol under the event box (classic FTA notation).
    if (node.kind !== "BASIC") {
      const cx = BOX_W / 2;
      const y0 = BOX_H + 6;
      this.el("line", { x1: cx, y1: BOX_H, x2: cx, y2: y0, class: "edge" }, g);
      const gateColor = node.kind === "OR" ? "#3c5bd6" : "#0b8f8f";
      const d = node.kind === "OR"
        ? `M${cx - 17},${y0 + GATE_H} Q${cx},${y0 + GATE_H - 11} ${cx + 17},${y0 + GATE_H}
           Q${cx + 16},${y0 + 9} ${cx},${y0} Q${cx - 16},${y0 + 9} ${cx - 17},${y0 + GATE_H} Z`
        : `M${cx - 16},${y0 + GATE_H} V${y0 + 15} A16 15 0 0 1 ${cx + 16},${y0 + 15} V${y0 + GATE_H} Z`;
      this.el("path", { d, fill: gateColor, stroke: gateColor, class: "gate-shape" }, g);
      const label = this.el("text", { x: cx, y: y0 + GATE_H - 7, "text-anchor": "middle", class: "gate-text" }, g);
      label.textContent = node.kind;
      this.el("line", { x1: cx, y1: y0 + GATE_H - 2, x2: cx, y2: y0 + GATE_H + 8, class: "edge" }, g);
    }

    // Event box.
    this.el("rect", {
      class: "box", width: BOX_W, height: BOX_H, rx: 10,
      fill: colors.fill, stroke: colors.stroke,
    }, g);
    this.el("rect", { x: 0, y: 0, width: 6, height: BOX_H, rx: 3, fill: colors.accent }, g);

    // Basic event marker: a circle (FTA symbol).
    if (node.kind === "BASIC") {
      this.el("circle", { cx: 22, cy: 17, r: 6, fill: "none", stroke: colors.accent, "stroke-width": 2 }, g);
    }

    const idText = this.el("text", { x: node.kind === "BASIC" ? 34 : 16, y: 21, class: "node-id", fill: "#4a5d69" }, g);
    idText.textContent = node.id;

    const probText = this.el("text", {
      x: BOX_W - 12, y: 21, "text-anchor": "end", class: "node-prob",
      fill: node.kind === "BASIC" ? Format.heat(p) : "#12232e",
    }, g);
    probText.textContent = Format.probability(p);

    const lines = Format.wrap(node.label);
    lines.forEach((line, index) => {
      const t = this.el("text", { x: 16, y: 42 + index * 16, class: "node-label" }, g);
      t.textContent = line;
    });

    const title = this.el("title", {}, g);
    title.textContent = `${node.id} · ${node.label}\n${node.kind} · P = ${Format.probability(p)}`;

    // Collapse / expand toggle for gates.
    if (node.children?.length) {
      const isCollapsed = this.collapsed.has(node.id);
      const toggle = this.el("g", { class: "toggle", transform: `translate(${BOX_W - 14},${BOX_H})` }, g);
      this.el("circle", { r: 9 }, toggle);
      const sign = this.el("text", { y: 4, "text-anchor": "middle" }, toggle);
      sign.textContent = isCollapsed ? "+" : "−";
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggle(node.id);
      });
      if (isCollapsed) {
        const tag = this.el("text", { x: BOX_W / 2, y: BOX_H + GATE_H + 30, "text-anchor": "middle", class: "collapsed-tag" }, g);
        const hidden = (this.structure?.nodes?.[node.id]?.subtree_weight || 1) - 1;
        tag.textContent = `${hidden} hidden event(s)`;
      }
    }

    // Traversal order badge.
    if (this.visit?.order.has(node.id) && this.visit.shown.has(node.id)) {
      const badge = this.el("g", { class: "order-badge", transform: `translate(${BOX_W - 2},0)` }, g);
      this.el("circle", { r: 11 }, badge);
      const n = this.el("text", { y: 4, "text-anchor": "middle" }, badge);
      n.textContent = this.visit.order.get(node.id);
    }

    g.addEventListener("click", (event) => {
      if (this.justDragged) return;
      event.stopPropagation();
      this.onSelect(node.id);
    });
    return g;
  }

  /* ---------------------------------------------------------------- */
  toggle(id) {
    if (this.collapsed.has(id)) this.collapsed.delete(id);
    else this.collapsed.add(id);
    this.draw();
  }

  expandTo(id) {
    const ancestors = this.structure?.nodes?.[id]?.ancestors || [];
    let changed = false;
    for (const a of ancestors) if (this.collapsed.delete(a)) changed = true;
    if (changed) this.draw();
  }

  setMode(mode) {
    this.mode = mode;
    this.draw();
  }

  select(id) {
    this.selected = id;
    if (id) this.expandTo(id);
    this.applyState();
  }

  setMatches(ids) {
    this.matches = new Set(ids);
    ids.forEach((id) => this.expandTo(id));
    this.applyState();
  }

  /* Highlight some events plus the path from each one up to the root. */
  setHighlight(ids) {
    if (!ids) {
      this.highlight = null;
      this.applyState();
      return;
    }
    const nodes = new Set();
    const edges = new Set();
    for (const id of ids) {
      this.expandTo(id);
      const chain = [...(this.structure.nodes[id]?.ancestors || []), id];
      chain.forEach((n, i) => {
        nodes.add(n);
        if (i > 0) edges.add(`${chain[i - 1]}>${n}`);
      });
    }
    this.highlight = { nodes, edges, targets: new Set(ids) };
    this.applyState();
  }

  setVisit(visit) {
    this.visit = visit;
    this.draw();
  }

  applyState() {
    this.viewport.querySelectorAll(".node").forEach((g) => {
      const id = g.dataset.id;
      g.classList.toggle("selected", id === this.selected);
      g.classList.toggle("match", this.matches.has(id));
      g.classList.toggle("dim", !!this.highlight && !this.highlight.nodes.has(id));
      g.classList.toggle("visit", this.visit?.current === id);
    });
    this.viewport.querySelectorAll(".edge[data-edge]").forEach((path) => {
      const hot = !!this.highlight && this.highlight.edges.has(path.dataset.edge);
      path.classList.toggle("hot", hot);
      path.classList.toggle("dim", !!this.highlight && !hot);
    });
  }

  /* ---------------------------------------------------------------- */
  applyView() {
    const { x, y, k } = this.view;
    this.viewport.setAttribute("transform", `translate(${x},${y}) scale(${k})`);
  }

  zoomBy(factor, cx, cy) {
    const rect = this.svg.getBoundingClientRect();
    const px = cx ?? rect.width / 2;
    const py = cy ?? rect.height / 2;
    const k = Math.min(2.5, Math.max(0.2, this.view.k * factor));
    const ratio = k / this.view.k;
    this.view.x = px - (px - this.view.x) * ratio;
    this.view.y = py - (py - this.view.y) * ratio;
    this.view.k = k;
    this.applyView();
  }

  fit() {
    const rect = this.svg.getBoundingClientRect();
    const box = this.viewport.getBBox();
    if (!box.width || !rect.width) return;
    const pad = 40;
    const k = Math.min(1.3, (rect.width - pad * 2) / box.width, (rect.height - pad * 2 - 40) / box.height);
    this.view.k = Math.max(0.2, k);
    this.view.x = (rect.width - box.width * this.view.k) / 2 - box.x * this.view.k;
    this.view.y = pad - box.y * this.view.k;
    this.applyView();
  }

  centerOn(id) {
    const pos = this.positions.get(id);
    if (!pos) return;
    const rect = this.svg.getBoundingClientRect();
    const k = this.view.k;
    const cx = (pos.x + TreeView.BOX_W / 2) * k + this.view.x;
    const cy = (pos.y + TreeView.BOX_H / 2) * k + this.view.y;
    if (cx < 60 || cx > rect.width - 60 || cy < 60 || cy > rect.height - 60) {
      this.view.x += rect.width / 2 - cx;
      this.view.y += rect.height / 2 - cy;
      this.applyView();
    }
  }

  bindPanZoom() {
    let start = null;
    this.svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      start = { x: event.clientX, y: event.clientY, vx: this.view.x, vy: this.view.y, moved: false };
    });
    window.addEventListener("pointermove", (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < 4) return;
      start.moved = true;
      this.svg.classList.add("dragging");
      this.view.x = start.vx + dx;
      this.view.y = start.vy + dy;
      this.applyView();
    });
    window.addEventListener("pointerup", () => {
      if (!start) return;
      this.justDragged = start.moved;
      setTimeout(() => { this.justDragged = false; }, 0);
      start = null;
      this.svg.classList.remove("dragging");
    });
    this.svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = this.svg.getBoundingClientRect();
      this.zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
    this.svg.addEventListener("click", () => {
      if (!this.justDragged) this.onSelect(null);
    });
  }
}
