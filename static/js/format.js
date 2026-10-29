/* Formatting helpers shared by the tree view and the panels. */
const Format = (() => {
  function probability(p) {
    if (p === null || p === undefined || Number.isNaN(p)) return "—";
    if (p === 0) return "0";
    if (p >= 0.001) return `${(p * 100).toFixed(p >= 0.1 ? 1 : 2)}%`;
    return p.toExponential(1);
  }

  function oneIn(p) {
    if (!p) return "never";
    const n = 1 / p;
    if (n < 10) return `about 1 in ${n.toFixed(1)}`;
    return `about 1 in ${Math.round(n).toLocaleString("en-US")}`;
  }

  function mix(a, b, t) {
    const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
    const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
  }

  /* Green -> amber -> red on a log scale (1e-5 ... 1e-1). */
  function heat(p) {
    if (!p) return "#2f9e6e";
    const t = Math.min(1, Math.max(0, (Math.log10(p) + 5) / 4));
    return t < 0.5 ? mix("2f9e6e", "e9a23b", t * 2) : mix("e9a23b", "d64545", (t - 0.5) * 2);
  }

  function escape(text) {
    return String(text ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* Split a label into at most `maxLines` lines of ~`width` characters. */
  function wrap(text, width = 27, maxLines = 2) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, width - 1)}…`;
      return kept;
    }
    return lines;
  }

  return { probability, oneIn, heat, escape, wrap };
})();
