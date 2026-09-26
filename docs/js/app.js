/* SUV Market Dashboard — no dependencies, no blocking third-party calls.
   Data: data/dashboard.json?t=<now> (cache-busted on every load). */
(function () {
  "use strict";

  var state = {
    market: "madison",          // madison | detroit | compare
    model: "all",
    title: "all",
    radius: 150,
    yearMin: 2017,
    yearMax: 2024,
    sortKey: "price",
    sortDir: 1,
  };

  var DATA = null;

  function $(id) { return document.getElementById(id); }
  function median(xs) {
    xs = xs.filter(function (x) { return x != null && isFinite(x); }).sort(function (a, b) { return a - b; });
    if (!xs.length) return null;
    var m = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
  }
  function fmt$ (n) {
    if (n == null) return "–";
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function fmtN(n) {
    if (n == null) return "–";
    return Math.round(n).toLocaleString("en-US");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function inWindow(r) {
    return r.year != null && r.year >= state.yearMin && r.year <= state.yearMax;
  }
  function baseFilter(r) {
    if (r.outlier) return false;
    if (!inWindow(r)) return false;
    if (state.model !== "all" && r.model !== state.model) return false;
    if (state.title !== "all" && r.titleStatus !== state.title) return false;
    return true;
  }
  function localRows(metro) {
    return DATA.listings.filter(function (r) {
      if (r.market !== "local" || r.metro !== metro) return false;
      if (!baseFilter(r)) return false;
      if (r.distanceMi != null && r.distanceMi > state.radius) return false;
      return true;
    });
  }
  function nationalRows() {
    return DATA.listings.filter(function (r) {
      return r.market === "national" && baseFilter(r);
    });
  }

  /* ---------- KPIs ---------- */
  function kpiCard(label, value, sub) {
    return '<div class="kpi"><div class="label">' + esc(label) + '</div>' +
      '<div class="value">' + value + '</div>' +
      (sub ? '<div class="sub">' + sub + "</div>" : "") + "</div>";
  }

  function renderKPIs() {
    var el = $("kpis");
    if (state.market === "compare") return renderCompareKPIs(el);
    var rows = localRows(state.market);
    var nat = nationalRows();
    var natMed = median(nat.map(function (r) { return r.price; }));
    var med = median(rows.map(function (r) { return r.price; }));
    var name = state.market === "madison" ? "Madison" : "Detroit";
    var html = "";
    html += kpiCard("Listings (" + name + ")", fmtN(rows.length),
      "within " + state.radius + " mi");
    html += kpiCard("Median price", fmt$(med), null);
    html += kpiCard("Median miles", fmtN(median(rows.map(function (r) { return r.mileage; }))), null);
    if (natMed != null && med != null) {
      var d = med - natMed, pct = (100 * d / natMed);
      var cls = d >= 0 ? "delta-up" : "delta-down";
      var arrow = d >= 0 ? "▲" : "▼";
      html += kpiCard("vs national (" + fmt$(natMed) + ")",
        '<span class="' + cls + '">' + arrow + " " + fmt$(Math.abs(d)) + "</span>",
        '<span class="' + cls + '">' + pct.toFixed(1) + "%</span> " + fmtN(nat.length) + " nat. listings");
    } else {
      html += kpiCard("vs national", "–", fmtN(nat.length) + " nat. listings");
    }
    el.innerHTML = html;
  }

  function renderCompareKPIs(el) {
    var m = localRows("madison"), d = localRows("detroit");
    var nat = nationalRows();
    var mMed = median(m.map(function (r) { return r.price; }));
    var dMed = median(d.map(function (r) { return r.price; }));
    var nMed = median(nat.map(function (r) { return r.price; }));
    function row(label, a, b, fmt) {
      return "<tr><td>" + esc(label) + "</td><td>" + fmt(a) + "</td><td>" + fmt(b) + "</td></tr>";
    }
    var prem = "";
    if (mMed != null && dMed != null && dMed > 0) {
      var usd = mMed - dMed, pct = 100 * usd / dMed;
      var cls = usd >= 0 ? "delta-up" : "delta-down";
      prem = '<tr><td>WI premium</td><td colspan="2"><span class="' + cls + '">' +
        (usd >= 0 ? "+" : "−") + fmt$(Math.abs(usd)).slice(0) + " (" + pct.toFixed(1) + "%)</span></td></tr>";
    }
    el.innerHTML =
      '<div class="kpi wide"><div class="label">Madison vs Detroit &middot; within ' + state.radius + ' mi</div>' +
      '<table class="cmp"><tr><th></th><th>Madison</th><th>Detroit</th></tr>' +
      row("Listings", m.length, d.length, fmtN) +
      row("Median price", mMed, dMed, fmt$) +
      row("Median miles", median(m.map(function (r) { return r.mileage; })),
        median(d.map(function (r) { return r.mileage; })), fmtN) +
      (nMed != null ? row("National median", nMed, nMed, fmt$) : "") +
      prem + "</table></div>";
  }

  /* ---------- Charts ---------- */
  function renderHist() {
    var el = $("hist");
    var groups = state.market === "compare"
      ? [{ label: "Madison", rows: localRows("madison"), alt: false },
         { label: "Detroit", rows: localRows("detroit"), alt: true }]
      : [{ label: state.market, rows: localRows(state.market), alt: false }];
    var all = [];
    groups.forEach(function (g) { all = all.concat(g.rows.map(function (r) { return r.price; })); });
    if (!all.length) { el.innerHTML = '<p class="muted">No listings match.</p>'; return; }
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var BINS = 12, span = (hi - lo) || 1;
    var bins = groups.map(function () { return new Array(BINS).fill(0); });
    groups.forEach(function (g, gi) {
      g.rows.forEach(function (r) {
        var b = Math.min(BINS - 1, Math.floor((r.price - lo) / span * BINS));
        bins[gi][b]++;
      });
    });
    var max = Math.max.apply(null, bins.map(function (b) { return Math.max.apply(null, b); }).concat([1]));
    var html = "";
    for (var i = 0; i < BINS; i++) {
      var x0 = Math.round(lo + span * i / BINS / 100) / 10;
      html += '<div class="bar" title="' + bins.map(function (b, gi) { return groups[gi].label + ": " + b[i]; }).join(", ") + '">';
      // stack: draw tallest first so both visible
      var parts = bins.map(function (b, gi) {
        var h = Math.round(b[i] / max * 100);
        return '<div class="fill' + (groups[gi].alt ? " alt" : "") + '" style="height:' + Math.max(h, b[i] ? 3 : 0) + '%"></div>';
      });
      html += parts.join("") + '<div class="x">$' + x0 + "k</div></div>";
    }
    html += "";
    el.innerHTML = html +
      (groups.length > 1 ? '<div class="legend"><span><span class="sw" style="background:#0b5fff"></span>Madison</span><span><span class="sw" style="background:#9db9f0"></span>Detroit</span></div>' : "");
  }

  function renderByYear() {
    var el = $("byYear");
    var groups = state.market === "compare"
      ? [{ label: "Madison", rows: localRows("madison"), alt: false },
         { label: "Detroit", rows: localRows("detroit"), alt: true }]
      : [{ label: state.market, rows: localRows(state.market), alt: false }];
    var years = [];
    for (var y = state.yearMin; y <= state.yearMax; y++) years.push(y);
    var meds = groups.map(function (g) {
      return years.map(function (yr) {
        return median(g.rows.filter(function (r) { return r.year === yr; }).map(function (r) { return r.price; }));
      });
    });
    var allM = [];
    meds.forEach(function (m) { m.forEach(function (v) { if (v != null) allM.push(v); }); });
    if (!allM.length) { el.innerHTML = '<p class="muted">No listings match.</p>'; return; }
    var max = Math.max.apply(null, allM);
    var html = years.map(function (yr, i) {
      var parts = meds.map(function (m, gi) {
        var v = m[i], h = v == null ? 0 : Math.round(v / max * 100);
        return '<div class="fill' + (groups[gi].alt ? " alt" : "") + '" style="height:' + Math.max(h, v ? 3 : 0) + '%" title="' +
          groups[gi].label + " " + yr + ": " + fmt$(v) + '"></div>';
      }).join("");
      return '<div class="bar">' + parts + '<div class="x">' + yr + "</div></div>";
    }).join("");
    el.innerHTML = html +
      (groups.length > 1 ? '<div class="legend"><span><span class="sw" style="background:#0b5fff"></span>Madison</span><span><span class="sw" style="background:#9db9f0"></span>Detroit</span></div>' : "");
  }

  /* ---------- Table ---------- */
  function pill(t) {
    var c = t === "clean" ? "clean" : t === "salvage" ? "salvage" : "unknown";
    return '<span class="pill ' + c + '">' + esc(t) + "</span>";
  }

  function renderTable() {
    var rows = state.market === "compare"
      ? localRows("madison").concat(localRows("detroit"))
      : localRows(state.market);
    var k = state.sortKey, dir = state.sortDir;
    rows.sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av == null) return 1; if (bv == null) return -1;
      return (av - bv) * dir;
    });
    $("listCount").textContent = "· " + rows.length + " vehicles";
    var showMkt = state.market === "compare";
    var html = rows.slice(0, 200).map(function (r) {
      return "<tr data-url=\"" + esc(r.url) + "\">" +
        '<td class="price">' + fmt$(r.price) + "</td>" +
        "<td>" + (r.year || "–") + "</td>" +
        "<td>" + esc(r.title.length > 42 ? r.title.slice(0, 42) + "…" : r.title) + "</td>" +
        "<td>" + fmtN(r.mileage) + "</td>" +
        "<td>" + pill(r.titleStatus) + "</td>" +
        "<td>" + (r.distanceMi != null ? Math.round(r.distanceMi) + " mi" : "–") + "</td>" +
        "<td>" + esc((r.location || "").split(",")[0]) + (showMkt ? " (" + (r.metro === "madison" ? "MAD" : "DET") + ")" : "") + "</td></tr>";
    }).join("");
    var tb = document.querySelector("#listings tbody");
    tb.innerHTML = html || '<tr><td colspan="7" class="muted">No listings match these filters.</td></tr>';
    tb.querySelectorAll("tr[data-url]").forEach(function (tr) {
      tr.addEventListener("click", function () { window.open(tr.getAttribute("data-url"), "_blank"); });
    });
    if (rows.length > 200) {
      tb.innerHTML += '<tr><td colspan="7" class="muted">Showing 200 of ' + rows.length + " — tighten filters to see more.</td></tr>";
    }
  }

  function renderAll() {
    if (!DATA) return;
    renderKPIs();
    renderHist();
    renderByYear();
    renderTable();
  }

  /* ---------- Wiring ---------- */
  function seg(selector, key) {
    document.querySelectorAll(selector + " button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(selector + " button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state[key] = btn.getAttribute("data-" + key);
        renderAll();
      });
    });
  }

  function initControls() {
    seg(".seg[aria-label='Market']", "market");
    seg(".seg[aria-label='Model']", "model");
    seg(".seg[aria-label='Title status']", "title");
    var r = $("radius");
    r.addEventListener("input", function () {
      state.radius = parseInt(r.value, 10);
      $("radiusVal").textContent = r.value;
      renderAll();
    });
    var y0 = $("yearMin"), y1 = $("yearMax");
    for (var y = 2017; y <= 2024; y++) {
      y0.add(new Option(y, y)); y1.add(new Option(y, y));
    }
    y0.value = "2017"; y1.value = "2024";
    function years() {
      var a = parseInt(y0.value, 10), b = parseInt(y1.value, 10);
      if (a > b) { if (this === y0) b = a; else a = b; y0.value = a; y1.value = b; }
      state.yearMin = a; state.yearMax = b; renderAll();
    }
    y0.addEventListener("change", years); y1.addEventListener("change", years);
    document.querySelectorAll("#listings th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-sort");
        if (state.sortKey === k) state.sortDir *= -1;
        else { state.sortKey = k; state.sortDir = 1; }
        renderTable();
      });
    });
  }

  function load() {
    // Render controls immediately; data arrives when it arrives (never block first paint).
    initControls();
    fetch("data/dashboard.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (json) {
        DATA = json;
        var u = json.meta && json.meta.updatedAt ? new Date(json.meta.updatedAt) : null;
        $("updatedAt").textContent = u ? u.toLocaleString() : "unknown";
        renderAll();
      })
      .catch(function () {
        $("updatedAt").textContent = "couldn't load data";
        $("kpis").innerHTML = '<div class="kpi wide"><div class="label">Error</div><div class="value">Data unavailable</div><div class="sub">Check back after the next daily scan.</div></div>';
      });
  }

  document.addEventListener("DOMContentLoaded", load);
})();
