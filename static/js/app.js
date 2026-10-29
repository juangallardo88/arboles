/* Application controller: talks to the Flask API and renders the side panels. */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = Format.escape;
  const P = Format.probability;

  const state = {
    tree: null,
    analysis: null,
    structure: null,
    selected: null,
    addKind: "BASIC",
    activeCut: null,
    traversalTimer: null,
  };

  const view = new TreeView($("#treeSvg"), $("#viewport"), { onSelect: selectEvent });

  /* -------------------------------------------------------------- */
  /* API                                                             */
  /* -------------------------------------------------------------- */
  async function api(method, url, body) {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  async function mutate(method, url, body) {
    try {
      const data = await api(method, url, body);
      applySnapshot(data);
      if (data.message) toast(data.message);
      if (data.focus !== undefined) selectEvent(data.focus, { center: true });
      return true;
    } catch (error) {
      toast(error.message, true);
      return false;
    }
  }

  function applySnapshot(data) {
    state.tree = data.tree;
    state.analysis = data.analysis;
    state.structure = data.structure;
    if (state.selected && !state.structure.nodes[state.selected]) state.selected = null;
    view.render(state.tree, state.analysis.probabilities, state.structure);
    view.select(state.selected);
    renderHeader();
    renderLegend();
    renderEventPanel();
    renderAddPanel();
    renderRiskPanel();
    renderStructurePanel();
    $("#asciiView").textContent = state.structure.ascii;
    runSearch();
  }

  /* -------------------------------------------------------------- */
  /* Helpers                                                         */
  /* -------------------------------------------------------------- */
  function findNode(id, node = state.tree) {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const found = findNode(id, child);
      if (found) return found;
    }
    return null;
  }

  function allNodes(node = state.tree, out = []) {
    out.push(node);
    (node.children || []).forEach((child) => allNodes(child, out));
    return out;
  }

  function chip(id) {
    const role = state.structure.nodes[id]?.role || "";
    return `<button type="button" class="chip ${role}" data-goto="${esc(id)}">${esc(id)}</button>`;
  }

  function chips(ids) {
    return ids.length ? `<div class="chips">${ids.map(chip).join("")}</div>` : `<span class="muted">none</span>`;
  }

  let toastTimer;
  function toast(message, isError = false) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.toggle("error", isError);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function switchTab(name) {
    $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $$(".tab-body").forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
  }

  function selectEvent(id, { center = false } = {}) {
    state.selected = id || null;
    view.select(state.selected);
    renderEventPanel();
    if (id) {
      if (center) view.centerOn(id);
      switchTab("event");
    }
  }

  /* -------------------------------------------------------------- */
  /* Header & legend                                                 */
  /* -------------------------------------------------------------- */
  function renderHeader() {
    const p = state.analysis.top_event_probability;
    $("#topRiskValue").textContent = P(p);
    $("#topRiskValue").style.color = Format.heat(p);
    $("#topRiskHint").textContent = Format.oneIn(p);
  }

  function renderLegend() {
    const legend = $("#legend");
    if (view.mode === "class") {
      legend.innerHTML = `
        <span><i style="background:#f5b301"></i>Root (raíz)</span>
        <span><i style="background:#7fa6d6"></i>Branch (rama)</span>
        <span><i style="background:#6cb33f"></i>Leaf (hoja)</span>`;
    } else {
      legend.innerHTML = `
        <span><i style="background:#3c5bd6"></i>OR gate</span>
        <span><i style="background:#0b8f8f"></i>AND gate</span>
        <span><i class="circle" style="border:2px solid #8597a3"></i>Basic event</span>
        <span>low <span class="scale"></span> high risk</span>`;
    }
  }

  /* -------------------------------------------------------------- */
  /* Event panel                                                     */
  /* -------------------------------------------------------------- */
  function renderEventPanel() {
    const panel = $("#eventPanel");
    const node = state.selected && findNode(state.selected);
    if (!node) {
      panel.innerHTML = `<div class="empty">Select an event in the tree to see its details.<br><br>
        Tip: drag to pan, scroll to zoom, use <b>−</b> / <b>+</b> on a gate to collapse it.</div>`;
      return;
    }
    const info = state.structure.nodes[node.id];
    const p = state.analysis.probabilities[node.id];
    const imp = state.analysis.importance.find((row) => row.id === node.id);
    const gates = allNodes().filter((n) => n.kind !== "BASIC" && n.id !== node.id
      && !(state.structure.nodes[n.id].ancestors.includes(node.id)));
    const roleName = { root: "Root (top event)", branch: "Branch", leaf: "Leaf" }[info.role];

    panel.innerHTML = `
      <div class="event-head">
        <span class="kind-pill ${node.kind}">${node.kind}</span>
        <div>
          <h2>${esc(node.label)}</h2>
          <div class="sub">${esc(node.id)} · ${roleName}</div>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat"><div class="k">Probability</div><div class="v" style="color:${Format.heat(p)}">${P(p)}</div></div>
        <div class="stat"><div class="k">Level</div><div class="v">${info.level}</div></div>
        <div class="stat"><div class="k">Degree</div><div class="v">${info.degree}</div></div>
      </div>

      ${imp ? `<p class="hint" style="margin-top:10px">Fussell-Vesely importance: <b>${(imp.fussell_vesely * 100).toFixed(1)}%</b> of the top-event risk goes through this event.
        Birnbaum: ${imp.birnbaum.toFixed(4)}.</p>` : ""}

      <h3>Position in the tree</h3>
      <dl class="kv">
        <dt>Path</dt><dd><div class="path">${[...info.ancestors, node.id].map(chip).join("›")}</div></dd>
        <dt>Parent</dt><dd>${info.parent ? chip(info.parent) : "— (root)"}</dd>
        <dt>Children</dt><dd>${chips(info.children)}</dd>
        <dt>Siblings</dt><dd>${chips(info.siblings)}</dd>
        <dt>Subtree weight</dt><dd>${info.subtree_weight} node(s), height ${info.height}</dd>
      </dl>

      <hr class="divider">
      <h3 style="margin-top:0">Edit</h3>
      <form class="form" id="editForm">
        <label>Label <input name="label" maxlength="80" value="${esc(node.label)}" required></label>
        <label>Type
          <select name="kind" ${info.role === "root" ? "disabled" : ""}>
            ${["OR", "AND", "BASIC"].map((k) => `<option value="${k}" ${k === node.kind ? "selected" : ""}
              ${k === "BASIC" && node.children?.length ? "disabled" : ""}>${k === "BASIC" ? "Basic event" : `${k} gate`}</option>`).join("")}
          </select>
        </label>
        <label class="prob-field" ${node.kind === "BASIC" ? "" : "hidden"}>Probability
          <div class="row">
            <input name="probability" type="number" step="any" min="0" max="1" value="${node.probability ?? 0.01}">
          </div>
          <input name="probabilityRange" type="range" min="-6" max="0" step="0.01"
            value="${Math.log10(Math.max(node.probability || 0.01, 1e-6))}" aria-label="Probability (log scale)">
          <span class="hint">Slide on a log scale for a quick "what if" analysis.</span>
        </label>
        <label>Notes <textarea name="description" rows="3">${esc(node.description)}</textarea></label>
        <button class="btn primary" type="submit">Save changes</button>
      </form>

      ${node.kind !== "BASIC" ? `<button class="btn ghost" id="addHere" type="button" style="margin-top:10px;width:100%">+ Add a child event here</button>` : ""}

      ${info.role !== "root" ? `
        <hr class="divider">
        <h3 style="margin-top:0">Move subtree</h3>
        <div class="row">
          <select id="moveTarget">
            ${gates.map((g) => `<option value="${g.id}" ${g.id === info.parent ? "selected" : ""}>${g.id} · ${esc(g.label)}</option>`).join("")}
          </select>
          <button class="btn" id="moveBtn" type="button">Move</button>
        </div>
        <button class="btn danger" id="deleteBtn" type="button" style="margin-top:14px;width:100%">
          Delete ${info.subtree_weight > 1 ? `subtree (${info.subtree_weight} events)` : "event"}
        </button>` : ""}
    `;

    const form = $("#editForm");
    const kindSelect = form.elements.kind;
    const probInput = form.elements.probability;
    const range = form.elements.probabilityRange;
    kindSelect.addEventListener("change", () => {
      $(".prob-field", form).hidden = kindSelect.value !== "BASIC";
    });
    range.addEventListener("input", () => {
      probInput.value = Number(10 ** Number(range.value)).toPrecision(2);
    });
    range.addEventListener("change", () => form.requestSubmit());
    probInput.addEventListener("input", () => {
      const v = Number(probInput.value);
      if (v > 0) range.value = Math.log10(v);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const body = {
        label: form.elements.label.value,
        description: form.elements.description.value,
      };
      if (!kindSelect.disabled) body.kind = kindSelect.value;
      if (kindSelect.value === "BASIC") body.probability = Number(probInput.value);
      mutate("PATCH", `/api/events/${encodeURIComponent(node.id)}`, body);
    });

    $("#addHere")?.addEventListener("click", () => {
      switchTab("add");
      $("#addParent").value = node.id;
      $("#addForm").elements.label.focus();
    });
    $("#moveBtn")?.addEventListener("click", () => {
      mutate("POST", `/api/events/${encodeURIComponent(node.id)}/move`, { new_parent_id: $("#moveTarget").value });
    });
    $("#deleteBtn")?.addEventListener("click", () => {
      const count = info.subtree_weight;
      if (confirm(`Delete ${node.id}${count > 1 ? ` and its ${count - 1} descendant(s)` : ""}?`)) {
        mutate("DELETE", `/api/events/${encodeURIComponent(node.id)}`);
      }
    });
  }

  /* -------------------------------------------------------------- */
  /* Add panel                                                       */
  /* -------------------------------------------------------------- */
  function renderAddPanel() {
    const select = $("#addParent");
    const previous = select.value || state.selected;
    const gates = allNodes().filter((n) => n.kind !== "BASIC");
    select.innerHTML = gates.map((g) => `<option value="${g.id}">${g.id} · ${esc(g.label)} (${g.kind})</option>`).join("");
    if (gates.some((g) => g.id === previous)) select.value = previous;
    updateAddKind();
  }

  function updateAddKind() {
    $$("#addKind button").forEach((b) => b.classList.toggle("active", b.dataset.kind === state.addKind));
    $("#addProbField").hidden = state.addKind !== "BASIC";
    $("#addKindHint").textContent = {
      BASIC: "A root cause with its own failure probability (leaf of the tree).",
      OR: "The output happens if ANY of its inputs happens.",
      AND: "The output happens only if ALL of its inputs happen at the same time (redundancy).",
    }[state.addKind];
  }

  $$("#addKind button").forEach((button) => button.addEventListener("click", () => {
    state.addKind = button.dataset.kind;
    updateAddKind();
  }));

  $("#addForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const ok = await mutate("POST", "/api/events", {
      parent_id: form.elements.parent_id.value,
      kind: state.addKind,
      label: form.elements.label.value,
      probability: state.addKind === "BASIC" ? Number(form.elements.probability.value) : null,
      description: form.elements.description.value,
    });
    if (ok) {
      form.elements.label.value = "";
      form.elements.description.value = "";
    }
  });

  /* -------------------------------------------------------------- */
  /* Risk panel                                                      */
  /* -------------------------------------------------------------- */
  function renderRiskPanel() {
    const a = state.analysis;
    const spof = a.single_points_of_failure;
    const maxFV = Math.max(...a.importance.map((r) => r.fussell_vesely), 1e-9);

    $("#riskPanel").innerHTML = `
      <h2>Risk analysis</h2>
      <p class="muted">Probability that the ICU loses its oxygen supply, computed bottom-up
        with a post-order traversal (OR: 1 − ∏(1 − p), AND: ∏ p).</p>
      <div class="big-number" style="color:${Format.heat(a.top_event_probability)}">${P(a.top_event_probability)}</div>
      <div class="big-caption">${Format.oneIn(a.top_event_probability)} · ${a.cut_sets.length} minimal cut sets</div>

      ${a.warnings.map((w) => `<div class="alert warn" style="margin-top:12px">${esc(w)}</div>`).join("")}

      <h3>Single points of failure</h3>
      ${spof.length
        ? `<div class="alert danger">${spof.length} basic event(s) can cause the top event <b>on their own</b>:
           ${spof.map(chip).join(" ")}</div>`
        : `<div class="alert ok">No single basic event can cause the top event by itself.</div>`}

      <h3>Minimal cut sets</h3>
      <p class="hint" style="margin-bottom:10px">Smallest combinations of root causes that produce the top event. Hover or click one to trace it in the tree.</p>
      <div id="cutList">
        ${a.cut_sets.map((cut, i) => `
          <div class="cut-row ${state.activeCut === i ? "active" : ""}" data-cut="${i}">
            <div class="cut-top">
              <span class="cut-ids">{ ${cut.events.join(", ")} }</span>
              <span class="cut-order">order ${cut.order}</span>
            </div>
            <div class="cut-labels">${cut.labels.map(esc).join(" + ")}</div>
            <div class="bar"><span style="width:${(cut.share * 100).toFixed(1)}%"></span></div>
            <div class="cut-meta"><span>P = ${P(cut.probability)}</span><span>${(cut.share * 100).toFixed(1)}% of risk</span></div>
          </div>`).join("")}
      </div>

      <h3>Importance of each basic event</h3>
      <p class="hint" style="margin-bottom:10px">Fussell-Vesely: share of the risk that goes through the event. Fix the top ones first.</p>
      ${a.importance.map((row) => `
        <div class="imp-row" data-goto="${row.id}" title="${esc(row.label)} · Birnbaum ${row.birnbaum.toFixed(4)}">
          <span class="id">${row.id}</span>
          <div>
            <div class="name">${esc(row.label)}</div>
            <div class="bar"><span style="width:${(row.fussell_vesely / maxFV * 100).toFixed(1)}%"></span></div>
          </div>
          <span class="val">${(row.fussell_vesely * 100).toFixed(1)}%</span>
        </div>`).join("")}
    `;

    $$(".cut-row").forEach((row) => {
      const index = Number(row.dataset.cut);
      row.addEventListener("mouseenter", () => view.setHighlight(a.cut_sets[index].events));
      row.addEventListener("mouseleave", () => {
        if (state.activeCut === null) view.setHighlight(null);
        else view.setHighlight(a.cut_sets[state.activeCut].events);
      });
      row.addEventListener("click", () => {
        state.activeCut = state.activeCut === index ? null : index;
        $$(".cut-row").forEach((r) => r.classList.toggle("active", Number(r.dataset.cut) === state.activeCut));
        view.setHighlight(state.activeCut === null ? null : a.cut_sets[index].events);
      });
    });
    if (state.activeCut !== null) {
      if (a.cut_sets[state.activeCut]) view.setHighlight(a.cut_sets[state.activeCut].events);
      else state.activeCut = null;
    }
  }

  /* -------------------------------------------------------------- */
  /* Structure panel (concepts from class)                           */
  /* -------------------------------------------------------------- */
  const TRAVERSALS = [
    ["pre_order", "Pre-order", "root → children (left to right)"],
    ["in_order", "In-order", "first child → root → other children"],
    ["post_order", "Post-order", "children → root (used to compute probabilities)"],
    ["level_order", "Level order", "level by level (breadth-first)"],
  ];

  function renderStructurePanel() {
    const s = state.structure;
    $("#structurePanel").innerHTML = `
      <h2>Tree structure</h2>
      <p class="muted">The class concepts measured on this fault tree with <code>anytree</code>.
        Switch to <b>Class view</b> in the canvas to color the nodes by role.</p>

      <div class="stat-grid">
        <div class="stat"><div class="k">Root</div><div class="v">${s.root}</div><div class="s">raíz</div></div>
        <div class="stat"><div class="k">Weight</div><div class="v">${s.weight}</div><div class="s">peso · nodes</div></div>
        <div class="stat"><div class="k">Height</div><div class="v">${s.height}</div><div class="s">altura · levels</div></div>
        <div class="stat"><div class="k">Order</div><div class="v">${s.order}</div><div class="s">orden · max children</div></div>
        <div class="stat"><div class="k">Leaves</div><div class="v">${s.leaves.length}</div><div class="s">hojas</div></div>
        <div class="stat"><div class="k">Branches</div><div class="v">${s.branches.length}</div><div class="s">ramas</div></div>
      </div>

      <h3>Leaves (basic events)</h3>
      ${chips(s.leaves)}
      <h3>Branches (intermediate gates)</h3>
      ${chips(s.branches)}

      <h3>Levels</h3>
      ${s.levels.map((l) => `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:7px">
          <b style="width:56px;font-size:12px;color:var(--ink-2);padding-top:3px">Level ${l.level}</b>${chips(l.nodes)}</div>`).join("")}

      <h3>Traversals</h3>
      ${TRAVERSALS.map(([key, name, hint]) => `
        <div class="traversal">
          <div class="traversal-head">
            <div><b>${name}</b> <span class="hint">${hint}</span></div>
            <button class="btn small" type="button" data-play="${key}">▶ Play</button>
          </div>
          <div class="seq">${s.traversals[key].join(" → ")}</div>
        </div>`).join("")}
    `;
    $$("[data-play]").forEach((b) => b.addEventListener("click", () => playTraversal(b.dataset.play)));
  }

  function stopTraversal() {
    clearInterval(state.traversalTimer);
    state.traversalTimer = null;
    $("#traversalBanner").hidden = true;
    view.setVisit(null);
  }

  function playTraversal(key) {
    stopTraversal();
    const sequence = state.structure.traversals[key];
    const name = TRAVERSALS.find(([k]) => k === key)[1];
    view.collapsed.clear();
    const order = new Map(sequence.map((id, i) => [id, i + 1]));
    const shown = new Set();
    let step = 0;
    const banner = $("#traversalBanner");
    banner.hidden = false;
    const tick = () => {
      if (step >= sequence.length) {
        banner.textContent = `${name}: done · click anywhere to clear`;
        clearInterval(state.traversalTimer);
        state.traversalTimer = null;
        view.setVisit({ order, shown, current: null });
        return;
      }
      const id = sequence[step];
      shown.add(id);
      banner.textContent = `${name} · step ${step + 1}/${sequence.length} · visiting ${id}`;
      view.setVisit({ order, shown, current: id });
      step += 1;
    };
    tick();
    state.traversalTimer = setInterval(tick, 650);
  }

  /* -------------------------------------------------------------- */
  /* Search                                                          */
  /* -------------------------------------------------------------- */
  let searchTimer;
  async function runSearch() {
    const q = $("#searchInput").value.trim();
    if (!q) {
      view.setMatches([]);
      $("#searchCount").textContent = "";
      return;
    }
    try {
      const { results } = await api("GET", `/api/search?q=${encodeURIComponent(q)}`);
      view.setMatches(results);
      $("#searchCount").textContent = `${results.length} match${results.length === 1 ? "" : "es"}`;
      if (results.length) view.centerOn(results[0]);
    } catch (error) {
      toast(error.message, true);
    }
  }
  $("#searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 220);
  });
  $("#searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && view.matches.size) selectEvent([...view.matches][0], { center: true });
  });

  /* -------------------------------------------------------------- */
  /* Global wiring                                                   */
  /* -------------------------------------------------------------- */
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  $$(".canvas-toolbar .segmented button").forEach((b) => b.addEventListener("click", () => {
    $$(".canvas-toolbar .segmented button").forEach((x) => x.classList.toggle("active", x === b));
    view.setMode(b.dataset.mode);
    renderLegend();
  }));

  $("#zoomIn").addEventListener("click", () => view.zoomBy(1.2));
  $("#zoomOut").addEventListener("click", () => view.zoomBy(1 / 1.2));
  $("#fitBtn").addEventListener("click", () => view.fit());
  $("#treeSvg").addEventListener("click", () => {
    if (state.traversalTimer === null && view.visit) stopTraversal();
  });

  // Chips and importance rows jump to the event.
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-goto]");
    if (!target) return;
    state.selected = target.dataset.goto;
    view.select(state.selected);
    view.centerOn(state.selected);
    renderEventPanel();
    switchTab("event");
  });

  $("#exportBtn").addEventListener("click", () => { window.location.href = "/api/export"; });
  $("#importInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      state.selected = null;
      if (await mutate("POST", "/api/import", data)) view.fit();
    } catch {
      toast("The file is not valid JSON.", true);
    }
    event.target.value = "";
  });
  $("#resetBtn").addEventListener("click", async () => {
    if (!confirm("Restore the original case study? Your changes will be lost.")) return;
    state.selected = null;
    view.collapsed.clear();
    if (await mutate("POST", "/api/reset")) view.fit();
  });
  $("#copyAscii").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.structure.ascii);
      toast("Text tree copied.");
    } catch {
      toast("Could not copy to the clipboard.", true);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      stopTraversal();
      state.activeCut = null;
      view.setHighlight(null);
      $$(".cut-row").forEach((r) => r.classList.remove("active"));
    }
  });

  /* Boot */
  api("GET", "/api/tree")
    .then((data) => {
      applySnapshot(data);
      requestAnimationFrame(() => view.fit());
    })
    .catch((error) => toast(`Could not load the tree: ${error.message}`, true));
})();
