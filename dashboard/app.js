// app.js — Token Radar dashboard logic. Reads window.TOKEN_RADAR from
// data.js and renders the board, the live-token view, the peer table, and
// the per-protocol detail drawer. No network: every value comes from data.js.
(function () {
  var DATA = window.TOKEN_RADAR || null;
  var state = { q: "", cat: "", wl: false, sort: "rank", dir: 1 };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(v) {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    return "$" + Math.round(v);
  }

  function moneyFull(v) {
    return "$" + Math.round(v).toLocaleString("en-US");
  }

  function pct(v) {
    if (v === null || v === undefined) return "—";
    var cls = v > 0 ? "pos" : v < 0 ? "neg" : "";
    return '<span class="' + cls + '">' + (v > 0 ? "+" : "") + v.toFixed(1) + "%</span>";
  }

  function bySlug(a, b) {
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  }

  function sortedRows(rows) {
    var key = state.sort;
    var dir = state.dir;
    var copy = rows.slice();
    copy.sort(function (a, b) {
      var av = key === "peer" ? a.multipliers.peer : a[key];
      var bv = key === "peer" ? b.multipliers.peer : b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      var d = av < bv ? -1 : av > bv ? 1 : 0;
      if (d === 0) d = bySlug(a, b);
      return d * dir;
    });
    return copy;
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (q) {
        var hay = (r.name + " " + r.slug + " " + r.category).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderBoard() {
    var rows = sortedRows(filteredRows());
    var html = "";
    rows.forEach(function (r) {
      html += "<tr data-slug=\"" + esc(r.slug) + "\">" +
        "<td class=\"num\">" + r.rank + "</td>" +
        "<td><b>" + esc(r.name) + "</b><span class=\"slug\">" + esc(r.slug) +
        (r.watchlist ? ' <span class="wl">WATCHLIST</span>' : "") + "</span></td>" +
        "<td>" + esc(r.category) + "</td>" +
        "<td class=\"num\">" + money(r.tvl_usd) + "</td>" +
        "<td class=\"num\">" + pct(r.change_7d) + "</td>" +
        "<td class=\"num\"><b>" + money(r.implied_value_usd) + "</b></td>" +
        "<td class=\"num\">" + r.multipliers.peer.toFixed(4) + "</td></tr>";
    });
    document.getElementById("rows").innerHTML = html ||
      '<tr><td colspan="7">No protocols match this filter.</td></tr>';
    document.getElementById("count").textContent =
      rows.length + " of " + DATA.rows.length + " protocols";
    var heads = document.querySelectorAll("#board th[data-sort]");
    heads.forEach(function (th) {
      var k = th.getAttribute("data-sort");
      th.textContent = th.textContent.replace(/ [▲▼]$/, "");
      if (k === state.sort) th.textContent += state.dir === 1 ? " ▲" : " ▼";
    });
  }

  function renderLive() {
    var html = "";
    DATA.live_tokens.forEach(function (t, i) {
      html += "<tr><td class=\"num\">" + (i + 1) + "</td>" +
        "<td><b>" + esc(t.name) + "</b><span class=\"slug\">" + esc(t.slug) + "</span></td>" +
        "<td>" + esc(t.symbol || "—") + "</td>" +
        "<td>" + esc(t.category) + "</td>" +
        "<td class=\"num\">" + money(t.tvl_usd) + "</td>" +
        "<td class=\"num\">" + money(t.mcap_usd) + "</td>" +
        "<td class=\"num\">" + t.ratio.toFixed(4) + "</td></tr>";
    });
    document.getElementById("liverows").innerHTML = html;
  }

  function renderPeers() {
    var html = "";
    DATA.peer_multiples.forEach(function (p) {
      html += "<tr><td>" + esc(p.category) + "</td>" +
        "<td class=\"num\">" + p.live_peers + "</td>" +
        "<td class=\"num\">" + (p.median_ratio === null ? "—" : p.median_ratio.toFixed(4)) + "</td>" +
        "<td class=\"num\"><b>" + p.peer_multiple.toFixed(4) + "</b></td></tr>";
    });
    document.getElementById("peerrows").innerHTML = html;
  }

  function openDetail(slug) {
    var r = null;
    DATA.rows.forEach(function (row) { if (row.slug === slug) r = row; });
    if (!r) return;
    var m = r.multipliers;
    var recomputed = Math.round(r.tvl_usd * m.peer * m.growth * m.maturity * m.size * m.chains);
    var match = recomputed === r.implied_value_usd;
    var steps = "";
    r.farm_steps.forEach(function (s, i) {
      steps += "<li><b>Step " + (i + 1) + ".</b> " + esc(s) + "</li>";
    });
    document.getElementById("detail").innerHTML =
      "<h2>" + esc(r.name) + "</h2>" +
      '<p class="sub">Rank #' + r.rank + " · " + esc(r.category) + " · " + esc(r.slug) +
      (r.watchlist ? ' · <span class="wl">WATCHLIST</span>' : "") + "</p>" +
      '<div class="big">' + moneyFull(r.implied_value_usd) + "</div>" +
      '<div class="kv">' +
      "<div><span>TVL</span><b>" + moneyFull(r.tvl_usd) + "</b></div>" +
      "<div><span>7-day change</span><b>" + (r.change_7d === null ? "not reported" : r.change_7d.toFixed(2) + "%") + "</b></div>" +
      "<div><span>Chains</span><b>" + esc(r.chains.join(", ")) + "</b></div>" +
      "<div><span>Age</span><b>" + r.age_days + " days" + (r.listed_at ? " · since " + esc(r.listed_at) : "") + "</b></div>" +
      "</div>" +
      "<h3>Multiplier breakdown</h3>" +
      '<table><thead><tr><th>Multiplier</th><th class="num">Value</th><th>What it means</th></tr></thead><tbody>' +
      "<tr><td>Peer</td><td class=\"num\">" + m.peer.toFixed(4) + "</td><td>Category peer multiple (mcap / TVL of live-token peers)</td></tr>" +
      "<tr><td>Growth</td><td class=\"num\">" + m.growth.toFixed(4) + "</td><td>From the 7-day TVL change, clamped to −50%…+80%</td></tr>" +
      "<tr><td>Maturity</td><td class=\"num\">" + m.maturity.toFixed(4) + "</td><td>From age in days, capped at 4 years</td></tr>" +
      "<tr><td>Size</td><td class=\"num\">" + m.size.toFixed(4) + "</td><td>TVL in billions to the power −0.07, clamped 0.75–1.20</td></tr>" +
      "<tr><td>Chains</td><td class=\"num\">" + m.chains.toFixed(4) + "</td><td>1 + 0.02 per chain, up to 5 chains</td></tr>" +
      "</tbody></table>" +
      "<p>Recomputed from the stored multipliers: TVL × peer × growth × maturity × size × chains = <b>" +
      moneyFull(recomputed) + "</b> — " +
      (match
        ? '<span class="match">matches the board value exactly.</span>'
        : "<span>board value is " + moneyFull(r.implied_value_usd) + ".</span>") +
      "</p>" +
      "<h3>How to farm it — 7 steps</h3><ol>" + steps + "</ol>" +
      "<p>This protocol records no token in the snapshot. That is a statement about the record, not proof it has none, and the implied value does not predict a launch.</p>";
    document.getElementById("drawer").hidden = false;
    document.getElementById("backdrop").hidden = false;
  }

  function closeDetail() {
    document.getElementById("drawer").hidden = true;
    document.getElementById("backdrop").hidden = true;
  }

  function init() {
    if (!DATA) {
      document.getElementById("rows").innerHTML =
        '<tr><td colspan="7">No data loaded. data.js was not found next to the dashboard.</td></tr>';
      return;
    }
    var top = DATA.rows[0];
    document.getElementById("stats").innerHTML =
      '<div class="stat"><b>' + DATA.protocol_count + '</b><span>Protocols scanned</span></div>' +
      '<div class="stat"><b>' + DATA.watchlist_count + '</b><span>Watchlist</span></div>' +
      '<div class="stat"><b>' + DATA.row_count + '</b><span>Ranked</span></div>' +
      '<div class="stat"><b>' + esc(DATA.as_of) + '</b><span>Snapshot date</span></div>' +
      '<div class="stat"><b>' + money(top.implied_value_usd) + '</b><span>Top: ' + esc(top.name) + '</span></div>';
    var cats = [];
    DATA.rows.forEach(function (r) { if (cats.indexOf(r.category) === -1) cats.push(r.category); });
    cats.sort();
    var sel = document.getElementById("cat");
    cats.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      sel.appendChild(o);
    });
    renderBoard();
    renderLive();
    renderPeers();

    document.getElementById("q").addEventListener("input", function (e) {
      state.q = e.target.value;
      renderBoard();
    });
    sel.addEventListener("change", function (e) {
      state.cat = e.target.value;
      renderBoard();
    });
    document.getElementById("wl").addEventListener("change", function (e) {
      state.wl = e.target.checked;
      renderBoard();
    });
    document.querySelectorAll("#board th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-sort");
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = k === "name" || k === "category" ? 1 : -1; }
        renderBoard();
      });
    });
    document.getElementById("rows").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-slug]");
      if (tr) openDetail(tr.getAttribute("data-slug"));
    });
    document.getElementById("close").addEventListener("click", closeDetail);
    document.getElementById("backdrop").addEventListener("click", closeDetail);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDetail();
    });
    document.querySelectorAll(".tabs button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".tabs button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var view = btn.getAttribute("data-view");
        document.querySelectorAll(".view").forEach(function (s) { s.hidden = true; });
        document.getElementById("view-" + view).hidden = false;
        closeDetail();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
