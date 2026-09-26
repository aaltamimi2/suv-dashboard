/* SUV Market Intel v2 — Leaflet metro grid + deep analytics.
   Data: data/dashboard.json + data/trends.json (cache-busted on every load). */
(function () {
  "use strict";

  /* ---------------- constants ---------------- */
  var METROS = [
    { id: "madison",       label: "Madison",       st: "WI", lat: 43.07313, lng: -89.38644,  focus: true, local: true },
    { id: "detroit",       label: "Detroit",       st: "MI", lat: 42.33168, lng: -83.04800,  focus: true, local: true },
    { id: "chicago",       label: "Chicago",       st: "IL", lat: 41.88425, lng: -87.63245 },
    { id: "milwaukee",     label: "Milwaukee",     st: "WI", lat: 43.04223, lng: -87.90690 },
    { id: "minneapolis",   label: "Minneapolis",   st: "MN", lat: 44.97902, lng: -93.26494 },
    { id: "dallas",        label: "Dallas",        st: "TX", lat: 32.77822, lng: -96.79512 },
    { id: "houston",       label: "Houston",       st: "TX", lat: 29.76078, lng: -95.36952 },
    { id: "atlanta",       label: "Atlanta",       st: "GA", lat: 33.74831, lng: -84.39101 },
    { id: "miami",         label: "Miami",         st: "FL", lat: 25.77481, lng: -80.19773 },
    { id: "denver",        label: "Denver",        st: "CO", lat: 39.74001, lng: -104.99202 },
    { id: "phoenix",       label: "Phoenix",       st: "AZ", lat: 33.44825, lng: -112.07580 },
    { id: "los-angeles",   label: "Los Angeles",   st: "CA", lat: 34.05357, lng: -118.24545 },
    { id: "san-francisco", label: "San Francisco", st: "CA", lat: 37.77712, lng: -122.41966 },
    { id: "new-york",      label: "New York",      st: "NY", lat: 40.71453, lng: -74.00712 },
    { id: "boston",        label: "Boston",        st: "MA", lat: 42.35866, lng: -71.05674 },
    { id: "philadelphia",  label: "Philadelphia",  st: "PA", lat: 39.95222, lng: -75.16218 },
    { id: "seattle",       label: "Seattle",       st: "WA", lat: 47.60357, lng: -122.32945 }
  ];
  var METRO_BY_ID = {};
  METROS.forEach(function (m) { METRO_BY_ID[m.id] = m; });

  var MODEL_LABELS = { "jeep-grand-cherokee": "Grand Cherokee", "chevy-equinox": "Equinox" };
  var TITLE_LABELS = { clean: "Clean", salvage: "Salvage", unknown: "Unknown" };
  var C = { green: "#16a34a", red: "#dc2626", gray: "#94a3b8", blue: "#2563eb", teal: "#0d9488", yellow: "#b45309" };
  var MADISON_C = "#2563eb", DETROIT_C = "#0d9488", NAT_C = "#94a3b8";

  /* ---------------- state ---------------- */
  var state = {
    view: "map",
    model: "all",
    title: "all",
    radius: 150,
    yearMin: 2017,
    yearMax: 2024,
    sortKey: "price",
    sortDir: 1,
    trendModel: "jeep-grand-cherokee"
  };

  var LISTINGS = [];
  var TRENDS = { days: [] };
  var META = {};

  /* ---------------- utils ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function median(xs) {
    xs = xs.filter(function (x) { return x != null && isFinite(x); }).sort(function (a, b) { return a - b; });
    if (!xs.length) return null;
    var m = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
  }
  function fmt$(n) {
    if (n == null || !isFinite(n)) return "–";
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function fmtN(n) {
    if (n == null || !isFinite(n)) return "–";
    return Math.round(n).toLocaleString("en-US");
  }
  function fmtPct(p) {
    if (p == null || !isFinite(p)) return "–";
    return (p >= 0 ? "+" : "") + (100 * p).toFixed(1) + "%";
  }
  function fmtMi(n) {
    if (n == null || !isFinite(n)) return "–";
    return Math.round(n) + " mi";
  }
  function shortTitle(t, n) {
    t = String(t || "");
    return t.length > (n || 44) ? t.slice(0, n || 44) + "…" : t;
  }
  function metroLabel(id) {
    var m = METRO_BY_ID[id];
    return m ? m.label + ", " + m.st : id;
  }

  /* ---------------- filters ---------------- */
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
    return LISTINGS.filter(function (r) {
      if (r.market !== "local" || r.metro !== metro) return false;
      if (!baseFilter(r)) return false;
      if (r.distanceMi != null && r.distanceMi > state.radius) return false;
      return true;
    });
  }
  function nationalRows() {
    return LISTINGS.filter(function (r) { return r.market === "national" && baseFilter(r); });
  }
  function metroRows(id) {
    var m = METRO_BY_ID[id];
    if (!m) return [];
    return m.local ? localRows(id) : nationalRows().filter(function (r) { return r.metro === id; });
  }
  function allFiltered() {
    return LISTINGS.filter(function (r) {
      if (r.market === "local") {
        if (r.metro !== "madison" && r.metro !== "detroit") return false;
        if (r.distanceMi != null && r.distanceMi > state.radius) return false;
      }
      return baseFilter(r);
    });
  }

  /* ---------------- svg helpers ---------------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function svgText(parent, x, y, str, attrs) {
    var t = svgEl("text", Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }
  function niceCeil(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function moneyTick(v) {
    if (Math.abs(v) >= 1000) return "$" + Math.round(v / 1000) + "k";
    return "$" + Math.round(v);
  }

  /* Multi-series line chart. series: [{label, color, points: [[xLabel, y], ...]}] */
  function lineChart(el, series, opts) {
    opts = opts || {};
    el.innerHTML = "";
    var W = Math.max(el.clientWidth || 640, 280), H = opts.height || 260;
    var padL = 52, padR = 12, padT = 14, padB = 30;
    var svg = svgEl("svg", { width: "100%", height: H, viewBox: "0 0 " + W + " " + H, "class": "chart" }, el);
    var allY = [];
    series.forEach(function (s) { s.points.forEach(function (p) { if (p[1] != null) allY.push(p[1]); }); });
    if (!allY.length) {
      svgText(svg, W / 2, H / 2, "Not enough history yet — check back after more daily scans.",
        { "text-anchor": "middle", fill: "#737373", "font-size": "12" });
      return;
    }
    var lo = Math.min.apply(null, allY), hi = Math.max.apply(null, allY);
    if (hi === lo) { hi = lo + 1; lo = lo - 1; }
    var span = hi - lo; lo -= span * 0.15; hi += span * 0.15;
    var xs = series[0].points.map(function (p) { return p[0]; });
    var n = xs.length;
    function X(i) { return padL + (n === 1 ? 0.5 : i / (n - 1)) * (W - padL - padR); }
    function Y(v) { return padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB); }
    var ticks = 4, i, t;
    for (i = 0; i <= ticks; i++) {
      t = lo + (hi - lo) * i / ticks;
      svgEl("line", { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), "class": "grid" }, svg);
      svgText(svg, padL - 8, Y(t) + 3.5, moneyTick(t), { "text-anchor": "end" });
    }
    var step = Math.max(1, Math.ceil(n / 8));
    for (i = 0; i < n; i += step) {
      svgText(svg, X(i), H - 10, xs[i], { "text-anchor": "middle" });
    }
    series.forEach(function (s) {
      var d = "", started = false;
      s.points.forEach(function (p, j) {
        if (p[1] == null) { started = false; return; }
        d += (started ? "L" : "M") + X(j).toFixed(1) + "," + Y(p[1]).toFixed(1) + " ";
        started = true;
      });
      if (d) svgEl("path", { d: d, fill: "none", stroke: s.color, "stroke-width": 2.2, "stroke-linejoin": "round" }, svg);
      s.points.forEach(function (p, j) {
        if (p[1] == null) return;
        var c = svgEl("circle", { cx: X(j), cy: Y(p[1]), r: 3.2, fill: s.color }, svg);
        var tip = svgEl("title", {}, c);
        tip.textContent = p[0] + " · " + s.label + ": " + fmt$(p[1]);
      });
    });
    var lx = padL;
    series.forEach(function (s) {
      svgEl("rect", { x: lx, y: 2, width: 14, height: 4, rx: 2, fill: s.color }, svg);
      var tx = svgText(svg, lx + 19, 8, s.label, { "class": "series-label", fill: "#a3a3a3" });
      lx += 19 + tx.getComputedTextLength() + 18;
    });
  }

  /* Grouped bar chart. groups: [{label, values: [v1, v2]}] */
  function barChart(el, groups, seriesLabels, colors, opts) {
    opts = opts || {};
    el.innerHTML = "";
    var W = Math.max(el.clientWidth || 640, 280), H = opts.height || 240;
    var padL = 52, padR = 12, padT = 26, padB = 30;
    var svg = svgEl("svg", { width: "100%", height: H, viewBox: "0 0 " + W + " " + H, "class": "chart" }, el);
    var allV = [];
    groups.forEach(function (g) { g.values.forEach(function (v) { if (v != null) allV.push(v); }); });
    if (!allV.length) {
      svgText(svg, W / 2, H / 2, "No data for the current filters.", { "text-anchor": "middle", fill: "#737373", "font-size": "12" });
      return;
    }
    var hi = niceCeil(Math.max.apply(null, allV) * 1.08);
    var gw = (W - padL - padR) / groups.length;
    var bw = Math.min(34, (gw * 0.7) / seriesLabels.length);
    function Y(v) { return padT + (1 - v / hi) * (H - padT - padB); }
    var ticks = 4, i, t;
    for (i = 0; i <= ticks; i++) {
      t = hi * i / ticks;
      svgEl("line", { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), "class": "grid" }, svg);
      svgText(svg, padL - 8, Y(t) + 3.5, opts.tickFmt ? opts.tickFmt(t) : moneyTick(t), { "text-anchor": "end" });
    }
    groups.forEach(function (g, gi) {
      var gx = padL + gi * gw;
      svgText(svg, gx + gw / 2, H - 10, g.label, { "text-anchor": "middle" });
      g.values.forEach(function (v, si) {
        if (v == null) return;
        var totalW = bw * seriesLabels.length;
        var x = gx + gw / 2 - totalW / 2 + si * bw;
        var bar = svgEl("rect", { x: x + 1.5, y: Y(v), width: bw - 3, height: H - padB - Y(v), rx: 3, fill: colors[si], opacity: 0.92 }, svg);
        var tip = svgEl("title", {}, bar);
        tip.textContent = g.label + " · " + seriesLabels[si] + ": " + (opts.valFmt ? opts.valFmt(v) : fmt$(v));
      });
    });
    var lx = padL;
    seriesLabels.forEach(function (lab, si) {
      svgEl("rect", { x: lx, y: 2, width: 14, height: 4, rx: 2, fill: colors[si] }, svg);
      var tx = svgText(svg, lx + 19, 8, lab, { "class": "series-label", fill: "#a3a3a3" });
      lx += 19 + tx.getComputedTextLength() + 18;
    });
  }

  /* Overlaid histograms. dists: [{label, color, values: []}], binSize in dollars */
  function histChart(el, dists, binSize) {
    el.innerHTML = "";
    var W = Math.max(el.clientWidth || 640, 280), H = 240;
    var padL = 44, padR = 12, padT = 26, padB = 30;
    var svg = svgEl("svg", { width: "100%", height: H, viewBox: "0 0 " + W + " " + H, "class": "chart" }, el);
    var allV = [];
    dists.forEach(function (d) { d.values.forEach(function (v) { allV.push(v); }); });
    if (!allV.length) {
      svgText(svg, W / 2, H / 2, "No data for the current filters.", { "text-anchor": "middle", fill: "#737373", "font-size": "12" });
      return;
    }
    var lo = Math.floor(Math.min.apply(null, allV) / binSize) * binSize;
    var hi = Math.ceil(Math.max.apply(null, allV) / binSize) * binSize;
    var nb = Math.max(1, Math.round((hi - lo) / binSize));
    var counts = dists.map(function (d) {
      var c = new Array(nb).fill(0);
      d.values.forEach(function (v) {
        var b = Math.min(nb - 1, Math.floor((v - lo) / binSize));
        c[b]++;
      });
      return c;
    });
    var maxC = 1;
    counts.forEach(function (c) { c.forEach(function (v) { if (v > maxC) maxC = v; }); });
    var bw = (W - padL - padR) / nb;
    function Y(v) { return padT + (1 - v / maxC) * (H - padT - padB); }
    var i, t;
    for (i = 0; i <= 3; i++) {
      t = maxC * i / 3;
      svgEl("line", { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), "class": "grid" }, svg);
      svgText(svg, padL - 8, Y(t) + 3.5, String(Math.round(t)), { "text-anchor": "end" });
    }
    var step = Math.max(1, Math.ceil(nb / 10));
    for (i = 0; i < nb; i += step) {
      svgText(svg, padL + i * bw + bw / 2, H - 10, moneyTick(lo + i * binSize), { "text-anchor": "middle" });
    }
    dists.forEach(function (d, di) {
      counts[di].forEach(function (c, b) {
        if (!c) return;
        var bar = svgEl("rect", {
          x: padL + b * bw + 1, y: Y(c), width: bw - 2, height: H - padB - Y(c),
          fill: d.color, opacity: 0.55, rx: 2
        }, svg);
        var tip = svgEl("title", {}, bar);
        tip.textContent = d.label + " · " + moneyTick(lo + b * binSize) + "–" + moneyTick(lo + (b + 1) * binSize) + ": " + c + " listings";
      });
    });
    var lx = padL;
    dists.forEach(function (d) {
      svgEl("rect", { x: lx, y: 2, width: 14, height: 4, rx: 2, fill: d.color }, svg);
      var tx = svgText(svg, lx + 19, 8, d.label, { "class": "series-label", fill: "#a3a3a3" });
      lx += 19 + tx.getComputedTextLength() + 18;
    });
  }

  /* ---------------- map ---------------- */
  var map = null, metroLayer = null;

  function initMap() {
    map = L.map("map", { zoomControl: true, worldCopyJump: true });
    // Same tile layer as the Robinhood flyer map — proven on this Pages setup.
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19
    }).addTo(map);
    map.fitBounds(L.latLngBounds(METROS.map(function (m) { return [m.lat, m.lng]; })).pad(0.12));
    metroLayer = L.layerGroup().addTo(map);
  }

  function priceColor(pct) {
    if (pct == null) return C.gray;
    if (pct <= -0.10) return C.green;
    if (pct >= 0.10) return C.red;
    return C.gray;
  }

  function metroStats() {
    var nat = nationalRows();
    var natMed = median(nat.map(function (r) { return r.price; }));
    return METROS.map(function (m) {
      var rows = metroRows(m.id);
      var prices = rows.map(function (r) { return r.price; });
      var med = median(prices);
      return {
        metro: m, n: rows.length, med: med,
        pct: (med != null && natMed) ? (med - natMed) / natMed : null,
        natMed: natMed
      };
    });
  }

  function renderMap() {
    if (!map) initMap();
    metroLayer.clearLayers();
    var stats = metroStats();
    stats.forEach(function (s) {
      var m = s.metro;
      var r = Math.min(30, 7 + Math.sqrt(s.n) * 1.7);
      var color = priceColor(s.pct);
      var marker = L.circleMarker([m.lat, m.lng], {
        radius: r,
        color: color,
        weight: 2,
        fillColor: color,
        fillOpacity: s.n ? 0.55 : 0.15
      }).addTo(metroLayer);
      var tip = "<b>" + esc(m.label) + ", " + m.st + "</b><br>" +
        fmtN(s.n) + " listings · median " + fmt$(s.med) +
        (s.pct != null ? "<br>" + fmtPct(s.pct) + " vs national" : "");
      marker.bindTooltip(tip, { direction: "top", offset: [0, -r] });
      marker.on("click", function () { showMetroDetail(m.id); });
      if (m.focus) {
        L.circleMarker([m.lat, m.lng], {
          radius: r + 5, color: "#1d4ed8", weight: 2.5, fillOpacity: 0, interactive: false
        }).addTo(metroLayer);
        L.marker([m.lat, m.lng], {
          interactive: false, keyboard: false,
          icon: L.divIcon({
            className: "",
            iconSize: [0, 0],
            iconAnchor: [0, -r - 12],
            html: '<div class="metro-label">' + esc(m.label.toUpperCase()) + '</div>'
          })
        }).addTo(metroLayer);
      }
    });
  }

  function showMetroDetail(id) {
    var m = METRO_BY_ID[id];
    var rows = metroRows(id);
    var prices = rows.map(function (r) { return r.price; });
    var med = median(prices);
    var nat = nationalRows();
    var natMed = median(nat.map(function (r) { return r.price; }));
    var pct = (med != null && natMed) ? (med - natMed) / natMed : null;
    var badge = pct == null ? "neutral" : pct <= -0.10 ? "green" : pct >= 0.10 ? "red" : "neutral";
    var badgeLabel = pct == null ? "no data" : fmtPct(pct) + " vs national";

    var byModel = Object.keys(MODEL_LABELS).map(function (mk) {
      var mp = rows.filter(function (r) { return r.model === mk; }).map(function (r) { return r.price; });
      return { label: MODEL_LABELS[mk], n: mp.length, med: median(mp) };
    });
    var cheapest = rows.slice().sort(function (a, b) { return a.price - b.price; }).slice(0, 5);

    var body = $("detailBody");
    body.innerHTML =
      '<span class="badge ' + badge + '">' + esc(badgeLabel) + "</span>" +
      "<h3>" + esc(m.label) + ", " + esc(m.st) +
      (m.focus ? '<br><span style="font-weight:500;font-size:0.85rem;color:var(--text-secondary)">' +
        (id === "madison" ? "Sell market — Wisconsin premium" : "Source market — buy & repair") + "</span>" : "") + "</h3>" +
      '<div class="meta">' + fmtN(rows.length) + " listings in scope</div>" +
      '<div class="kv">' +
      '<div class="muted">Median price</div><div><strong>' + fmt$(med) + "</strong></div>" +
      '<div class="muted">National median</div><div>' + fmt$(natMed) + "</div>" +
      '<div class="muted">Listings</div><div>' + fmtN(rows.length) + "</div>" +
      byModel.map(function (b) {
        return '<div class="muted">' + esc(b.label) + "</div><div>" + fmt$(b.med) +
          ' <span class="muted">(' + b.n + ")</span></div>";
      }).join("") +
      "</div>" +
      '<div class="muted" style="margin-bottom:8px">Cheapest in ' + esc(m.label) + "</div>" +
      (cheapest.length
        ? '<ul class="mini-list">' + cheapest.map(function (r) {
          return '<li><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' +
            esc(shortTitle(r.title, 34)) + '</a><span class="p">' + fmt$(r.price) + "</span></li>";
        }).join("") + "</ul>"
        : '<p class="empty-state">No listings under the current filters.</p>');
    $("detailPanel").classList.remove("hidden");
    map.panTo([m.lat, m.lng], { animate: true });
  }

  /* ---------------- sidebar ---------------- */
  function renderOverview() {
    var nat = nationalRows();
    var natMed = median(nat.map(function (r) { return r.price; }));
    var mad = localRows("madison"), det = localRows("detroit");
    var madMed = median(mad.map(function (r) { return r.price; }));
    var detMed = median(det.map(function (r) { return r.price; }));
    var prem = (madMed != null && detMed) ? (madMed - detMed) / detMed : null;
    var metros = metroStats().filter(function (s) { return s.n > 0; }).length;
    $("overviewStats").innerHTML =
      stat(fmt$(natMed), "National median", fmtN(nat.length) + " listings") +
      stat(fmtN(mad.length + det.length + nat.length), "Listings in scope", metros + " of 17 metros") +
      stat(fmtPct(prem), "WI premium", "Madison vs Detroit") +
      stat(fmt$(detMed), "Detroit median", fmtN(det.length) + " listings");
    $("updatedAt").textContent = META.updatedAt
      ? "updated " + new Date(META.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "";
    $("dataFooter").textContent = "Daily scans · FB Marketplace · 2017–2024 model years · outliers excluded from medians.";
  }
  function stat(n, l, d) {
    return '<div class="stat"><div class="n">' + esc(n) + '</div><div class="l">' + esc(l) +
      '</div>' + (d ? '<div class="d muted">' + esc(d) + "</div>" : "") + "</div>";
  }

  function renderCheapList() {
    var rows = metroStats().filter(function (s) { return s.n >= 5 && s.pct != null; })
      .sort(function (a, b) { return a.pct - b.pct; }).slice(0, 6);
    $("cheapList").innerHTML = rows.length ? rows.map(function (s, i) {
      return '<li class="clickable" data-metro="' + s.metro.id + '">' +
        '<span class="rank-num">' + String(i + 1).padStart(2, "0") + "</span>" +
        "<span><span class=\"id\">" + esc(s.metro.label.toUpperCase()) + '</span><span class="name">' +
        fmtN(s.n) + " listings · " + fmt$(s.med) + "</span></span>" +
        '<span class="metric" style="color:' + priceColor(s.pct) + '">' + fmtPct(s.pct) + "</span></li>";
    }).join("") : '<li class="empty-state">No metros with 5+ listings under these filters.</li>';
    $("cheapList").querySelectorAll("li[data-metro]").forEach(function (li) {
      li.onclick = function () { setView("map"); showMetroDetail(li.dataset.metro); };
    });
  }

  function renderDeals() {
    var nat = nationalRows();
    var natMedByKey = {};
    nat.forEach(function (r) {
      var k = r.model + "|" + r.titleStatus;
      (natMedByKey[k] = natMedByKey[k] || []).push(r.price);
    });
    Object.keys(natMedByKey).forEach(function (k) { natMedByKey[k] = median(natMedByKey[k]); });
    var locals = localRows("madison").concat(localRows("detroit"));
    var deals = [];
    locals.forEach(function (r) {
      if (r.priceFlag === "review") return; // price quarantined: bio disagrees
      var ref = natMedByKey[r.model + "|" + r.titleStatus];
      if (ref == null || r.price >= ref) return;
      deals.push({ r: r, disc: (ref - r.price) / ref });
    });
    deals.sort(function (a, b) { return b.disc - a.disc; });
    var top = deals.slice(0, 5);
    $("dealList").innerHTML = top.length ? top.map(function (d, i) {
      return '<li><a class="rowlink" href="' + esc(d.r.url) + '" target="_blank" rel="noopener">' +
        '<span class="rank-num">' + String(i + 1).padStart(2, "0") + "</span>" +
        "<span><span class=\"id\">" + fmt$(d.r.price) + " · " + esc(metroLabel(d.r.metro)) + '</span><span class="name">' +
        esc(shortTitle(d.r.title, 40)) + "</span></span>" +
        '<span class="metric up">−' + (100 * d.disc).toFixed(0) + "%</span></a></li>";
    }).join("") : '<li class="empty-state">No listings priced under their national median right now.</li>';
  }

  /* ---------------- compare view ---------------- */
  function renderCompare() {
    var mad = localRows("madison"), det = localRows("detroit");
    var madMed = median(mad.map(function (r) { return r.price; }));
    var detMed = median(det.map(function (r) { return r.price; }));
    var prem = (madMed != null && detMed) ? (madMed - detMed) / detMed : null;
    var premD = (madMed != null && detMed) ? madMed - detMed : null;
    var madMi = median(mad.map(function (r) { return r.mileage; }));
    var detMi = median(det.map(function (r) { return r.mileage; }));
    $("compareSub").textContent = fmtN(mad.length) + " Madison listings vs " + fmtN(det.length) +
      " Detroit listings · radius " + state.radius + " mi";
    $("compareKpis").innerHTML =
      kpi("Madison median", fmt$(madMed), fmtN(mad.length) + " listings · " + fmtMi(madMi) + " median miles") +
      kpi("Detroit median", fmt$(detMed), fmtN(det.length) + " listings · " + fmtMi(detMi) + " median miles") +
      kpi("WI premium", premD != null ? (premD >= 0 ? "+" : "−") + fmt$(Math.abs(premD)) : "–",
        prem != null ? fmtPct(prem) + " over Detroit" : "–") +
      kpi("Spread signal", prem != null && prem > 0.05 ? "FAVORABLE" : prem != null && prem < -0.05 ? "INVERTED" : "NEUTRAL",
        "buy Detroit → sell Madison");
    renderPremiumChart();
    renderDistChart(mad, det);
    renderSplitTable(mad, det);
  }
  function kpi(label, value, sub) {
    return '<div class="kpi"><div class="label">' + esc(label) + '</div><div class="value">' + esc(value) +
      '</div><div class="sub">' + esc(sub) + "</div></div>";
  }

  function renderPremiumChart() {
    var colors = [MADISON_C, DETROIT_C];
    var series = Object.keys(MODEL_LABELS).map(function (mk, i) {
      return {
        label: MODEL_LABELS[mk],
        color: colors[i],
        points: TRENDS.days.map(function (d) {
          var m = d.madison && d.madison[mk], t = d.detroit && d.detroit[mk];
          var v = (m && t && m.med != null && t.med != null) ? m.med - t.med : null;
          return [d.date.slice(5), v];
        })
      };
    });
    lineChart($("premiumChart"), series, { height: 250 });
  }

  function renderDistChart(mad, det) {
    histChart($("distChart"), [
      { label: "Madison", color: MADISON_C, values: mad.map(function (r) { return r.price; }) },
      { label: "Detroit", color: DETROIT_C, values: det.map(function (r) { return r.price; }) }
    ], 2000);
  }

  function renderSplitTable(mad, det) {
    var titles = ["clean", "unknown", "salvage"];
    var rows = [];
    Object.keys(MODEL_LABELS).forEach(function (mk) {
      titles.forEach(function (t) {
        var mp = mad.filter(function (r) { return r.model === mk && r.titleStatus === t; });
        var dp = det.filter(function (r) { return r.model === mk && r.titleStatus === t; });
        var mm = median(mp.map(function (r) { return r.price; }));
        var dm = median(dp.map(function (r) { return r.price; }));
        rows.push({
          label: MODEL_LABELS[mk] + " · " + TITLE_LABELS[t],
          mad: mm, madN: mp.length, det: dm, detN: dp.length,
          prem: (mm != null && dm) ? (mm - dm) / dm : null
        });
      });
    });
    var html = '<table class="split-table"><thead><tr><th>Segment</th><th class="num">Madison</th>' +
      '<th class="num">Detroit</th><th class="num">Premium</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += "<tr><td>" + esc(r.label) + "</td>" +
        '<td class="num"><span class="t">' + fmt$(r.mad) + '</span> <span class="muted">(' + r.madN + ")</span></td>" +
        '<td class="num"><span class="t">' + fmt$(r.det) + '</span> <span class="muted">(' + r.detN + ")</span></td>" +
        '<td class="num"><span class="t" style="color:' + (r.prem == null ? "inherit" : r.prem > 0.05 ? C.green : r.prem < -0.05 ? C.red : "inherit") +
        '">' + fmtPct(r.prem) + "</span></td></tr>";
    });
    $("splitTable").innerHTML = html + "</tbody></table>";
  }

  /* ---------------- trends view ---------------- */
  function renderTrends() {
    var mk = state.trendModel;
    var series = [
      { label: "Madison", color: MADISON_C, key: "madison" },
      { label: "Detroit", color: DETROIT_C, key: "detroit" },
      { label: "National", color: NAT_C, key: "national" }
    ].map(function (s) {
      return {
        label: s.label, color: s.color,
        points: TRENDS.days.map(function (d) {
          var g = d[s.key] && d[s.key][mk];
          return [d.date.slice(5), g ? g.med : null];
        })
      };
    });
    lineChart($("trendChart"), series, { height: 280 });

    var groups = [];
    for (var y = state.yearMin; y <= state.yearMax; y++) {
      var vals = Object.keys(MODEL_LABELS).map(function (mk2) {
        return median(allFiltered().filter(function (r) { return r.model === mk2 && r.year === y; })
          .map(function (r) { return r.price; }));
      });
      groups.push({ label: String(y), values: vals });
    }
    barChart($("yearChart"), groups, [MODEL_LABELS["jeep-grand-cherokee"], MODEL_LABELS["chevy-equinox"]],
      [MADISON_C, DETROIT_C], { height: 250 });
  }

  /* ---------------- listings view ---------------- */
  var SORTS = {
    price: function (r) { return r.price || 0; },
    title: function (r) { return (r.title || "").toLowerCase(); },
    year: function (r) { return r.year || 0; },
    mileage: function (r) { return r.mileage == null ? 1e12 : r.mileage; },
    titleStatus: function (r) { return r.titleStatus || ""; },
    metro: function (r) { return r.metro || ""; },
    distanceMi: function (r) { return r.distanceMi == null ? 1e12 : r.distanceMi; }
  };
  function renderListings() {
    var rows = allFiltered().slice();
    var fn = SORTS[state.sortKey] || SORTS.price;
    rows.sort(function (a, b) {
      var va = fn(a), vb = fn(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * state.sortDir;
    });
    var shown = rows.slice(0, 400);
    $("listingCount").textContent = fmtN(rows.length) + " listings in scope" +
      (rows.length > 400 ? " · showing first 400" : "") + " · click a column to sort";
    $("listingsBody").innerHTML = shown.map(function (r) {
      return "<tr>" +
        '<td class="num"><span class="t"><strong>' + fmt$(r.price) + "</strong></span>" +
        (r.outlier ? '<span class="outlier-flag">outlier</span>' : "") +
        (r.priceFlag === "corrected" ? '<span class="price-flag" title="Card price was wrong; using the price from the listing description">bio ✓</span>' : "") +
        (r.priceFlag === "review" ? '<span class="price-flag warn" title="Card price disagrees with the description; excluded from stats">check price</span>' : "") +
        (r.priceFlag === "unverified" ? '<span class="price-flag dim" title="Far off the median and no price found in the description">unverified</span>' : "") + "</td>" +
        '<td><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(shortTitle(r.title, 52)) + "</a></td>" +
        '<td class="num"><span class="t">' + (r.year || "–") + "</span></td>" +
        '<td class="num"><span class="t">' + (r.mileage != null ? fmtN(r.mileage) : "–") + "</span></td>" +
        '<td><span class="title-pill ' + esc(r.titleStatus) + '">' + esc(TITLE_LABELS[r.titleStatus] || r.titleStatus) + "</span></td>" +
        "<td>" + esc(metroLabel(r.metro)) + (r.market === "national" ? ' <span class="muted">· nat</span>' : "") + "</td>" +
        '<td class="num"><span class="t">' + fmtMi(r.distanceMi) + "</span></td>" +
        "</tr>";
    }).join("") || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">No listings under the current filters.</td></tr>';
    document.querySelectorAll("#listingsTable th[data-sort]").forEach(function (th) {
      var k = th.dataset.sort;
      th.innerHTML = th.textContent.replace(/ [▲▼]/, "") + (state.sortKey === k ? (state.sortDir === 1 ? " ▲" : " ▼") : "");
    });
  }

  /* ---------------- view switching + controls ---------------- */
  function setView(v) {
    state.view = v;
    document.querySelectorAll("#viewSeg button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === v);
    });
    document.querySelectorAll(".view").forEach(function (s) {
      s.classList.toggle("hidden", s.id !== "view-" + v);
    });
    if (v === "map" && map) setTimeout(function () { map.invalidateSize(); }, 50);
    if (v === "compare") renderCompare();
    if (v === "trends") renderTrends();
    if (v === "listings") renderListings();
  }

  function segWire(id, attr, apply) {
    $(id).querySelectorAll("button").forEach(function (b) {
      b.onclick = function () {
        $(id).querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        apply(b.dataset[attr]);
      };
    });
  }

  function renderAll() {
    renderMap();
    renderOverview();
    renderCheapList();
    renderDeals();
    if (state.view === "compare") renderCompare();
    if (state.view === "trends") renderTrends();
    if (state.view === "listings") renderListings();
  }

  function initControls() {
    segWire("viewSeg", "view", setView);
    segWire("modelSeg", "model", function (v) { state.model = v; renderAll(); });
    segWire("titleSeg", "title", function (v) { state.title = v; renderAll(); });
    segWire("trendModelSeg", "model", function (v) { state.trendModel = v; renderTrends(); });

    var yMin = $("yearMin"), yMax = $("yearMax");
    for (var y = 2017; y <= 2024; y++) {
      yMin.add(new Option(y, y));
      yMax.add(new Option(y, y));
    }
    yMin.value = state.yearMin; yMax.value = state.yearMax;
    yMin.onchange = function () { state.yearMin = +yMin.value; if (state.yearMin > state.yearMax) { state.yearMax = state.yearMin; yMax.value = state.yearMax; } renderAll(); };
    yMax.onchange = function () { state.yearMax = +yMax.value; if (state.yearMax < state.yearMin) { state.yearMin = state.yearMax; yMin.value = state.yearMin; } renderAll(); };

    var radius = $("radius");
    radius.oninput = function () { $("radiusVal").textContent = radius.value; };
    radius.onchange = function () { state.radius = +radius.value; renderAll(); };

    document.querySelectorAll("#listingsTable th[data-sort]").forEach(function (th) {
      th.onclick = function () {
        var k = th.dataset.sort;
        if (state.sortKey === k) state.sortDir *= -1;
        else { state.sortKey = k; state.sortDir = 1; }
        renderListings();
      };
    });

    $("closeDetail").onclick = function () { $("detailPanel").classList.add("hidden"); };
    window.addEventListener("resize", function () {
      if (state.view === "compare") renderCompare();
      if (state.view === "trends") renderTrends();
    });
  }

  /* ---------------- load ---------------- */
  async function load() {
    var bust = "?t=" + Date.now();
    try {
      var r = await fetch("data/dashboard.json" + bust, { cache: "no-store" });
      var j = await r.json();
      LISTINGS = j.listings || [];
      META = j.meta || {};
    } catch (e) {
      $("dataFooter").textContent = "Could not load market data — retrying…";
      setTimeout(load, 15000);
      return;
    }
    try {
      var r2 = await fetch("data/trends.json" + bust, { cache: "no-store" });
      TRENDS = await r2.json();
    } catch (e) { TRENDS = { days: [] }; }
    initControls();
    renderAll();
  }

  load();
})();
