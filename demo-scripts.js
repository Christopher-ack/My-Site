/* =========================================================
   SAVED SCRIPTS PAGE

   Two files feed this page:

     scripts-data.json  the running orders — name, categories,
                        and the list of demo ids, in order.
     demos-data.json    read only, for titles, times and write-ups.

   A script stores ids and nothing else, so rewriting a demo
   updates every script that uses it. Editing the running order
   happens in the builder on the Demos page; this page owns the
   name, the categories and the filing.

   Saving works the way the Demos and Links pages do: PUT the whole
   file back. A plain static host will refuse that, so the page keeps
   your edits for the session and hands you the updated file to swap
   in whenever you're done.
   ========================================================= */
(function () {
  var DATA_FILE = "scripts-data.json";
  var DEMOS_FILE = "demos-data.json";
  var $ = function (s) { return document.querySelector(s); };

  var DOC = { version: 1, updated: null, categories: [], scripts: [] };
  var DEMOS = { categories: [], demos: [] };
  var catById = {};
  var demoById_ = {};
  var unsaved = 0;              /* edits made since the file last accepted a write */
  var loaded = false;
  var demosLoaded = false;

  /* -------------------------------------------------------
     Helpers
  ------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function indexCats() {
    catById = {};
    DOC.categories.forEach(function (c) { catById[c.id] = c; });
  }
  function catOf(id) {
    return catById[id] || { id: id, label: id || "Uncategorised", color: "#94a3b8" };
  }
  function catsOf(s) { return (s && s.cats) || []; }
  function scriptById(id) {
    for (var i = 0; i < DOC.scripts.length; i++) if (DOC.scripts[i].id === id) return DOC.scripts[i];
    return null;
  }
  function demoById(id) { return demoById_[id] || null; }

  /* First category paints the tile. No categories still gets a color,
     so a tile is never colorless. */
  function colorOf(s) {
    var c = catsOf(s)[0];
    return c ? catOf(c).color : "#94a3b8";
  }

  /* A category invented in the modal still needs a color. Hash the name
     so the same word always lands on the same hue. */
  function colorFor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return "hsl(" + (Math.abs(hash) % 360) + ", 70%, 60%)";
  }
  function slug(name) {
    var base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cat";
    var id = base, n = 2;
    while (catById[id]) id = base + "-" + n++;
    return id;
  }

  function minsOf(d) { return Math.max(0, Math.round(Number(d && d.mins) || 0)); }

  /* Always stored as minutes; only the reading changes.
     short: "12 min" / "1h 25m".  long: "12 minutes" / "1 hour 25 minutes". */
  function fmtTime(m, short) {
    m = Math.max(0, Math.round(Number(m) || 0));
    var h = Math.floor(m / 60), r = m % 60;
    if (short) return h ? h + "h" + (r ? " " + r + "m" : "") : m + " min";
    var out = [];
    if (h) out.push(h + (h === 1 ? " hour" : " hours"));
    if (r || !h) out.push(r + (r === 1 ? " minute" : " minutes"));
    return out.join(" ");
  }

  /* Yesterday reads better as "Yesterday" than as a date. Anything
     older is a date, because that's what you'd actually look for. */
  function fmtWhen(iso) {
    if (!iso) return "\u2014";
    var d = new Date(iso);
    if (isNaN(d)) return "\u2014";
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return days + " days ago";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  /* What a script actually amounts to right now. Counts are read from
     the demos file, so a deleted demo shows up as a gap rather than
     quietly shrinking the running time. */
  function statsOf(s) {
    var ids = (s && s.demos) || [];
    if (!demosLoaded) {
      return { count: ids.length, missing: 0, mins: Math.max(0, Number(s && s.mins) || 0) };
    }
    var live = ids.filter(function (id) { return !!demoById(id); });
    return {
      count: live.length,
      missing: ids.length - live.length,
      mins: live.reduce(function (sum, id) { return sum + minsOf(demoById(id)); }, 0)
    };
  }

  function builderUrl(id) { return "demos.html?script=" + encodeURIComponent(id); }

  /* Hash routes. Every modal on this page has an address, so a link can
     point at one thing rather than at the page it lives on:

       #/                        the list
       #/script/<id>             the script, read only
       #/script/<id>/details     name, categories, filing

     Tiles and script names are real anchors carrying these, so copy
     link, middle click and open in new tab all behave. */
  function viewUrl(id) { return "#/script/" + encodeURIComponent(id); }
  function detailsUrl(id) { return viewUrl(id) + "/details"; }
  function absUrl(hash) { return location.href.split("#")[0] + hash; }

  var ICON_HEART =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">' +
    '<path d="M12 21s-6.7-4.35-9.65-8.03C.6 10.9.5 7.9 2.5 6.02 4.4 4.24 7.3 4.5 9 6.5l3 3.3 3-3.3' +
    'c1.7-2 4.6-2.26 6.5-.48 2 1.88 1.9 4.88.15 6.95C18.7 16.65 12 21 12 21z"/></svg>';
  var ICON_KEBAB =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">' +
    '<circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/>' +
    '<circle cx="12" cy="19" r="1.8"/></svg>';

  /* -------------------------------------------------------
     Toast
  ------------------------------------------------------- */
  var toastEl = $("#toast"), toastTextEl = $("#toastText"), toastTimer;

  function toast(kind, text) {
    clearTimeout(toastTimer);
    toastEl.className = "toast show is-" + kind;
    toastTextEl.textContent = text;
    if (kind === "ok") toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2500);
  }
  function toastFallback() {
    clearTimeout(toastTimer);
    toastEl.className = "toast show is-warn";
    toastTextEl.innerHTML = 'Couldn\u2019t auto-save \u2014 <a href="#" id="toastDownload">download ' +
                            esc(DATA_FILE) + "</a>";
    $("#toastDownload").addEventListener("click", function (e) {
      e.preventDefault();
      downloadFile();
    });
  }

  /* -------------------------------------------------------
     Save: PUT the file, or hand it over
  ------------------------------------------------------- */
  function status() {
    var dot = $("#dataDot"), label = $("#dataLabel");
    if (!loaded) {
      dot.classList.remove("on");
      label.textContent = "Couldn\u2019t load " + DATA_FILE;
      return;
    }
    if (unsaved > 0) {
      dot.classList.add("on");
      dot.style.setProperty("--dot-color", "var(--accent-warn)");
      label.textContent = unsaved + (unsaved === 1 ? " change" : " changes") + " not in the file";
    } else {
      dot.classList.add("on");
      dot.style.setProperty("--dot-color", "var(--accent-b)");
      label.textContent = DATA_FILE;
    }
  }

  /* A 200 is not proof that anything was written. A read-only static
     server (json-server, for one) answers a PUT with the file's own
     contents and a 200, having written nothing at all. So read the file
     back and check that the timestamp we just set actually landed. */
  function confirmWrite(file, stamp) {
    return fetch(file, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (doc) {
        if (!doc || doc.updated !== stamp) {
          throw new Error("write accepted but the file did not change");
        }
      });
  }

  function saveDoc() {
    var stamp = new Date().toISOString();
    DOC.updated = stamp;
    toast("pending", "Saving\u2026");

    fetch(DATA_FILE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(DOC, null, 2)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return confirmWrite(DATA_FILE, stamp);
    }).then(function () {
      unsaved = 0;
      status();
      toast("ok", "Saved to " + DATA_FILE);
    }).catch(function () {
      unsaved++;
      status();
      toastFallback();
    });
  }

  function downloadFile() {
    var blob = new Blob([JSON.stringify(DOC, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = DATA_FILE;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("ok", "Downloaded " + DATA_FILE + " \u2014 swap it in to make it permanent");
  }

  $("#downloadBtn").addEventListener("click", downloadFile);

  /* -------------------------------------------------------
     State. Everything filters through one object, then render().
  ------------------------------------------------------- */
  var state = {
    cats: new Set(),   /* empty means no category filter at all */
    query: "",
    sort: "title",
    desc: false
  };

  var favSection = $("#favSection"), favGrid = $("#favGrid"), favCountEl = $("#favCount");
  var rowsEl = $("#rows"), countEl = $("#count"), emptyEl = $("#emptyState");

  function visible() {
    var q = state.query.trim().toLowerCase();

    var out = DOC.scripts.filter(function (s) {
      if (state.cats.size) {
        var hit = catsOf(s).some(function (c) { return state.cats.has(c); });
        if (!hit) return false;
      }

      if (!q) return true;
      /* Search reads the category labels and the demo titles too, so
         "logbook" finds a script whose name never says it. */
      var hay = [s.title, s.desc]
        .concat(catsOf(s).map(function (c) { return catOf(c).label; }))
        .concat((s.demos || []).map(function (id) {
          var d = demoById(id);
          return d ? d.title : "";
        }))
        .join(" ").toLowerCase();
      return hay.indexOf(q) > -1;
    });

    out.sort(function (a, b) {
      var r;
      if (state.sort === "updated") {
        r = String(a.updated || a.created || "").localeCompare(String(b.updated || b.created || ""));
        r = -r;   /* newest first when the arrow is up */
      } else {
        r = String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
      }
      return state.desc ? -r : r;
    });
    return out;
  }

  /* ---- Favorites shelf ---- */
  function renderFavs() {
    var favs = DOC.scripts.filter(function (s) { return !!s.fav; });

    favSection.hidden = favs.length === 0;
    favCountEl.textContent = favs.length + (favs.length === 1 ? " script" : " scripts");

    favGrid.innerHTML = favs.map(function (s) {
      var st = statsOf(s);
      var tags = catsOf(s).map(function (id) {
        var c = catOf(id);
        return '<span class="tag" style="--tag-color:' + esc(c.color) + '">' + esc(c.label) + "</span>";
      }).join("");

      return '<a class="card fav-tile" href="' + esc(viewUrl(s.id)) + '" ' +
               'data-id="' + esc(s.id) + '" ' +
               'style="--cat:' + esc(colorOf(s)) + '" title="Read the script">' +
               '<span class="fav-heart" aria-hidden="true">' + ICON_HEART + "</span>" +
               '<span class="fav-title">' + esc(s.title || "Untitled script") + "</span>" +
               '<span class="fav-meta">' + st.count + (st.count === 1 ? " demo" : " demos") +
                 (st.mins ? " \u00b7 " + fmtTime(st.mins, true) : "") + "</span>" +
               (tags ? '<span class="fav-cats">' + tags + "</span>" : "") +
             "</a>";
    }).join("");
  }

  /* ---- Table ---- */
  function renderRows() {
    var shown = visible();

    rowsEl.innerHTML = shown.map(function (s) {
      var st = statsOf(s);
      var tags = catsOf(s).map(function (id) {
        var c = catOf(id);
        return '<span class="tag" style="--tag-color:' + esc(c.color) + '">' + esc(c.label) + "</span>";
      }).join("");

      var demoText = st.count + (st.count === 1 ? " demo" : " demos");
      var timeText = st.mins ? fmtTime(st.mins, true) : "";

      return '<tr data-id="' + esc(s.id) + '">' +
               '<td class="cell-primary">' +
                 '<a class="script-name" href="' + esc(viewUrl(s.id)) + '" ' +
                   'data-id="' + esc(s.id) + '" title="Read the script">' +
                   esc(s.title || "Untitled script") +
                 "</a>" +
                 (s.desc ? '<span class="script-desc">' + esc(s.desc) + "</span>" : "") +
                 '<span class="script-inline-meta">' + esc(demoText) +
                   (timeText ? " \u00b7 " + esc(timeText) : "") +
                   " \u00b7 " + esc(fmtWhen(s.updated || s.created)) + "</span>" +
                 (st.missing ? '<span class="script-gap">' + st.missing +
                   (st.missing === 1 ? " demo has" : " demos have") + " since been deleted</span>" : "") +
               "</td>" +
               '<td class="col-hide-sm"><div class="script-cats">' + tags + "</div></td>" +
               '<td class="col-hide-sm">' +
                 '<span class="script-count">' + esc(demoText) + "</span>" +
                 (timeText ? '<span class="script-time">' + esc(timeText) + "</span>" : "") +
               "</td>" +
               '<td class="col-hide-sm"><span class="script-updated">' +
                 esc(fmtWhen(s.updated || s.created)) + "</span></td>" +
               '<td class="cell-right">' +
                 '<button class="icon-btn fav-btn' + (s.fav ? " on on-love" : "") + '" type="button" ' +
                   'data-id="' + esc(s.id) + '" aria-pressed="' + (s.fav ? "true" : "false") + '" ' +
                   'aria-label="' + (s.fav ? "Remove from favorites" : "Add to favorites") + '">' +
                   ICON_HEART +
                 "</button>" +
               "</td>" +
               '<td class="cell-right">' +
                 '<button class="icon-btn row-menu-btn" type="button" data-id="' + esc(s.id) + '" ' +
                   'aria-haspopup="true" aria-expanded="false" aria-label="More actions">' + ICON_KEBAB +
                 "</button>" +
               "</td>" +
             "</tr>";
    }).join("");

    countEl.textContent = shown.length + (shown.length === 1 ? " script" : " scripts");
    emptyEl.classList.toggle("show", shown.length === 0);
  }

  function render() { renderFavs(); renderRows(); }

  /* -------------------------------------------------------
     Filter bar
  ------------------------------------------------------- */
  var catBtn = $("#catBtn"), catDrop = $("#catDrop"), catBtnLabel = $("#catBtnLabel");

  function syncCatBtn() {
    var n = state.cats.size;
    catBtnLabel.textContent = n ? "Categories \u00b7 " + n : "Categories";
    catBtn.classList.toggle("active", n > 0);
  }

  function renderCatDrop() {
    catDrop.innerHTML = DOC.categories.map(function (c) {
      var on = state.cats.has(c.id);
      var n = DOC.scripts.filter(function (s) { return catsOf(s).indexOf(c.id) > -1; }).length;
      return '<label class="option-row" style="--dot-color:' + esc(c.color) + '">' +
               '<input type="checkbox" data-cat="' + esc(c.id) + '"' + (on ? " checked" : "") + ">" +
               '<span class="dot' + (on ? " on" : "") + '"></span>' +
               '<span class="option-label">' + esc(c.label) + "</span>" +
               '<span class="filter-count">' + n + "</span>" +
             "</label>";
    }).join("");
    syncCatBtn();
  }

  catBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = catDrop.classList.toggle("open");
    catBtn.classList.toggle("open", open);
    catBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  catDrop.addEventListener("click", function (e) { e.stopPropagation(); });
  /* The row the user just clicked stays put — only its dot changes.
     Rebuilding the list here would delete the checkbox mid-click. */
  catDrop.addEventListener("change", function (e) {
    var box = e.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked) state.cats.add(box.dataset.cat);
    else state.cats.delete(box.dataset.cat);
    var dot = box.parentNode.querySelector(".dot");
    if (dot) dot.classList.toggle("on", box.checked);
    syncCatBtn();
    renderRows();
  });

  function closeCatDrop() {
    catDrop.classList.remove("open");
    catBtn.classList.remove("open");
    catBtn.setAttribute("aria-expanded", "false");
  }

  $("#search").addEventListener("input", function () {
    state.query = this.value;
    renderRows();
  });

  /* Two sortable columns, one arrow between them: clicking the other
     column moves the arrow rather than adding a second one. */
  [].forEach.call(document.querySelectorAll(".sort-header"), function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.dataset.sort;
      if (state.sort === key) {
        state.desc = !state.desc;
      } else {
        state.sort = key;
        state.desc = false;
      }
      [].forEach.call(document.querySelectorAll(".sort-header"), function (b) {
        var on = b.dataset.sort === state.sort;
        b.classList.toggle("active", on);
        b.classList.toggle("desc", on && state.desc);
      });
      renderRows();
    });
  });

  /* -------------------------------------------------------
     Row actions
  ------------------------------------------------------- */
  function toggleFav(id) {
    var s = scriptById(id);
    if (!s) return;
    s.fav = !s.fav;
    render();
    saveDoc();
  }

  /* A modified click is the browser's business — new tab, new window,
     copy link. Only a plain left click is ours to intercept. */
  function plainClick(e) {
    return !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
             e.shiftKey || e.altKey);
  }

  rowsEl.addEventListener("click", function (e) {
    var fav = e.target.closest(".fav-btn");
    if (fav) { toggleFav(fav.dataset.id); return; }

    var kebab = e.target.closest(".row-menu-btn");
    if (kebab) {
      e.stopPropagation();
      if (menuId === kebab.dataset.id) closeRowMenu();
      else openRowMenu(kebab);
      return;
    }

    /* The name reads the script. The builder is a click away from inside it. */
    var name = e.target.closest(".script-name");
    if (name && plainClick(e)) {
      e.preventDefault();
      navigate(viewUrl(name.dataset.id));
    }
  });

  favGrid.addEventListener("click", function (e) {
    var tile = e.target.closest(".fav-tile");
    if (!tile || !plainClick(e)) return;
    e.preventDefault();
    navigate(viewUrl(tile.dataset.id));
  });

  /* One panel, repositioned per row — right-aligned under its button. */
  var rowMenu = $("#rowMenu"), menuId = null, menuBtn = null;
  var deleteItem = rowMenu.querySelector('[data-act="delete"]');
  var menuConfirmTimer = null;

  function resetMenuDelete() {
    clearTimeout(menuConfirmTimer);
    deleteItem.classList.remove("armed");
    deleteItem.textContent = "Delete script";
  }

  function openRowMenu(btn) {
    closeRowMenu();
    menuId = btn.dataset.id;
    menuBtn = btn;

    var s = scriptById(menuId);
    rowMenu.querySelector('[data-act="fav"]').textContent =
      s && s.fav ? "Remove from favorites" : "Add to favorites";

    rowMenu.classList.add("open");
    btn.classList.add("open");
    btn.setAttribute("aria-expanded", "true");

    var rect = btn.getBoundingClientRect();
    var below = rect.bottom + 6;
    if (below + rowMenu.offsetHeight > window.innerHeight - 8) {
      below = Math.max(8, rect.top - 6 - rowMenu.offsetHeight);
    }
    rowMenu.style.top = below + "px";
    rowMenu.style.left = "auto";
    rowMenu.style.right = (window.innerWidth - rect.right) + "px";
  }

  function closeRowMenu() {
    if (!menuId) return;
    resetMenuDelete();
    rowMenu.classList.remove("open");
    if (menuBtn) {
      menuBtn.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    }
    menuId = null;
    menuBtn = null;
  }

  rowMenu.addEventListener("click", function (e) {
    var item = e.target.closest(".menu-item");
    if (!item) return;
    var act = item.dataset.act, id = menuId, s = scriptById(id);
    if (!s) { closeRowMenu(); return; }

    /* Delete asks once, in place — no dialog stacked on a menu. */
    if (act === "delete") {
      e.stopPropagation();
      if (!item.classList.contains("armed")) {
        item.classList.add("armed");
        item.textContent = "Delete for good?";
        menuConfirmTimer = setTimeout(resetMenuDelete, 4000);
        return;
      }
      var i = DOC.scripts.indexOf(s);
      if (i > -1) DOC.scripts.splice(i, 1);
      closeRowMenu();
      renderCatDrop();
      render();
      saveDoc();
      return;
    }

    closeRowMenu();

    if (act === "edit") location.href = builderUrl(id);
    else if (act === "view") navigate(viewUrl(id));
    else if (act === "meta") navigate(detailsUrl(id));
    else if (act === "link") copyLink(id);
    else if (act === "fav") toggleFav(id);
    else if (act === "duplicate") duplicate(id);
  });

  function duplicate(id) {
    var s = scriptById(id);
    if (!s) return;
    var now = new Date().toISOString();
    var copy = {
      id: "s" + Date.now().toString(36),
      title: (s.title || "Untitled script") + " copy",
      desc: s.desc || "",
      cats: (s.cats || []).slice(),
      fav: false,
      demos: (s.demos || []).slice(),
      mins: Number(s.mins) || 0,
      created: now,
      updated: now
    };
    DOC.scripts.push(copy);
    render();
    saveDoc();
    navigate(detailsUrl(copy.id));
  }

  /* Anything outside closes whatever's floating. */
  document.addEventListener("click", function (e) {
    if (menuId && !rowMenu.contains(e.target)) closeRowMenu();
    if (catDrop.classList.contains("open") && !catDrop.contains(e.target)) closeCatDrop();
  });
  document.addEventListener("scroll", closeRowMenu, { passive: true });
  window.addEventListener("resize", closeRowMenu);

  /* =========================================================
     Read-only view. Same builder as the Demos page, so what you
     read here is what prints there.
     ========================================================= */
  var scriptOverlay = $("#scriptOverlay"), scriptOpen = false, scriptLastFocus = null;
  var viewing = null;

  function scriptDocHTML(s) {
    var ids = (s.demos || []).filter(function (id) { return !!demoById(id); });
    if (!ids.length) {
      return '<p class="doc-empty">Nothing left to read \u2014 the demos this script pointed at have been deleted.</p>';
    }
    return ids.map(function (id) {
      var d = demoById(id);
      var body = (d.body || "").trim();
      return '<section class="script-entry">' +
               '<h2 class="script-entry-title">' + esc(d.title || "Untitled demo") + "</h2>" +
               (body || '<p class="doc-empty">No write-up yet.</p>') +
             "</section>";
    }).join("");
  }

  function scriptMeta(s) {
    var st = statsOf(s);
    var n = st.count + (st.count === 1 ? " demo." : " demos.");
    var out = st.mins ? n + " Approximately " + fmtTime(st.mins) + "." : n;
    if (st.missing) out += " " + st.missing + (st.missing === 1 ? " demo has" : " demos have") + " been deleted.";
    return out;
  }

  /* showScript / hideScript only touch the DOM. Opening and closing is the
     router's job, so the address bar and the screen can't disagree. */
  function showScript(s) {
    viewing = s;
    scriptLastFocus = document.activeElement;
    $("#scriptTitle").textContent = s.title || "Untitled script";
    $("#scriptMeta").textContent = scriptMeta(s);
    $("#scriptDoc").innerHTML = scriptDocHTML(s);
    $("#editOnDemos").href = builderUrl(s.id);
    $("#scriptScroll").scrollTop = 0;
    scriptOverlay.classList.add("open");
    scriptOpen = true;
    document.body.style.overflow = "hidden";
    $("#scriptDone").focus();
  }

  function hideScript() {
    if (!scriptOpen) return;
    scriptOverlay.classList.remove("open");
    scriptOpen = false;
    viewing = null;
    document.body.style.overflow = "";
    if (scriptLastFocus && scriptLastFocus.focus) scriptLastFocus.focus();
  }

  $("#scriptDone").addEventListener("click", goList);
  $("#scriptClose").addEventListener("click", goList);
  scriptOverlay.addEventListener("click", function (e) {
    if (e.target === scriptOverlay) goList();
  });

  $("#copyLinkBtn").addEventListener("click", function () {
    if (viewing) copyLink(viewing.id);
  });

  /* ---- PDF ----
     No library: fill the print root, hand the page to the browser's
     print dialog, and let "Save as PDF" do the rendering. */
  function exportPDF() {
    if (!viewing) return;
    var when = new Date().toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric"
    });

    $("#printRoot").innerHTML =
      '<div class="print-head"><span>' + esc(viewing.title || "Script") + "</span><span>" +
        esc(scriptMeta(viewing)) + " " + esc(when) + "</span></div>" +
      scriptDocHTML(viewing);

    /* The saved file takes its name from the document title. */
    var title = document.title;
    document.title = viewing.title || "Script";
    window.print();
    document.title = title;

    toast("ok", "Choose \u201cSave as PDF\u201d in the print dialog");
  }

  $("#pdfBtnModal").addEventListener("click", exportPDF);
  window.addEventListener("afterprint", function () { $("#printRoot").innerHTML = ""; });

  /* =========================================================
     Details modal. Name, categories, description, filing.
     The running order itself belongs to the builder.
     ========================================================= */
  var overlay = $("#overlay");
  var deleteBtn = $("#deleteBtn"), saveBtn = $("#saveBtn"), cancelBtn = $("#cancelBtn");
  var fFav = $("#fFav");

  var current = null;
  var draftCats = new Set();
  var draftFav = false;
  var lastFocus = null;
  var confirmTimer = null;

  function renderCatPicker() {
    $("#fCats").innerHTML = DOC.categories.map(function (c) {
      var on = draftCats.has(c.id);
      return '<label class="option-row" style="--dot-color:' + esc(c.color) + '">' +
               '<input type="checkbox" data-cat="' + esc(c.id) + '"' + (on ? " checked" : "") + ">" +
               '<span class="dot' + (on ? " on" : "") + '"></span>' +
               '<span class="option-label">' + esc(c.label) + "</span>" +
             "</label>";
    }).join("") ||
    '<p class="hint" style="margin:6px 8px">No categories yet. Add the first one below.</p>';
  }

  $("#fCats").addEventListener("change", function (e) {
    var box = e.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked) draftCats.add(box.dataset.cat);
    else draftCats.delete(box.dataset.cat);
    var dot = box.parentNode.querySelector(".dot");
    if (dot) dot.classList.toggle("on", box.checked);
  });

  /* A category invented here is committed as soon as it's added, not when
     the script is saved — otherwise cancelling out of the modal would take
     the category with it, and the picker would lie about what exists. */
  var newCatInput = $("#fNewCat");

  function addCategory() {
    var name = newCatInput.value.trim();
    if (!name) { newCatInput.focus(); return; }

    var existing = null;
    DOC.categories.forEach(function (c) {
      if (c.label.toLowerCase() === name.toLowerCase()) existing = c;
    });

    if (existing) {
      draftCats.add(existing.id);
      newCatInput.value = "";
      renderCatPicker();
      toast("ok", existing.label + " is already a category \u2014 ticked it for you");
      newCatInput.focus();
      return;
    }

    var cat = { id: slug(name), label: name, color: colorFor(name) };
    DOC.categories.push(cat);
    indexCats();
    draftCats.add(cat.id);

    newCatInput.value = "";
    renderCatPicker();
    renderCatDrop();          /* the filter bar learns about it too */
    var grid = $("#fCats");
    grid.scrollTop = grid.scrollHeight;
    newCatInput.focus();
    saveDoc();
  }

  $("#addCatBtn").addEventListener("click", addCategory);
  newCatInput.addEventListener("keydown", function (e) {
    /* Enter adds the category; it must not reach the form and save the script. */
    if (e.key !== "Enter") return;
    e.preventDefault();
    addCategory();
  });

  function setFavSwitch(on) {
    draftFav = on;
    fFav.classList.toggle("on", on);
    fFav.setAttribute("aria-checked", on ? "true" : "false");
  }
  fFav.addEventListener("click", function () { setFavSwitch(!draftFav); });

  function showModal(s) {
    current = s;

    var st = statsOf(s);
    $("#fName").value = s.title || "";
    $("#fDesc").value = s.desc || "";
    draftCats = new Set(catsOf(s));
    newCatInput.value = "";
    setFavSwitch(!!s.fav);
    renderCatPicker();
    $("#fSummary").textContent =
      st.count + (st.count === 1 ? " demo" : " demos") +
      (st.mins ? ", approximately " + fmtTime(st.mins) : "") +
      ". Change the running order in the script builder.";

    resetDelete();
    lastFocus = document.activeElement;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    $("#fName").focus();
    $("#fName").select();
  }

  function hideModal() {
    if (!current) return;
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    current = null;
    resetDelete();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function commit() {
    var title = $("#fName").value.trim();
    if (!title) {
      toast("error", "A script needs a name");
      $("#fName").focus();
      return;
    }

    current.title = title;
    current.desc = $("#fDesc").value.trim();
    current.cats = DOC.categories                       /* keep the file's order, not click order */
      .filter(function (c) { return draftCats.has(c.id); })
      .map(function (c) { return c.id; });
    current.fav = draftFav;
    current.updated = new Date().toISOString();

    goList();
    renderCatDrop();
    render();
    saveDoc();
  }

  saveBtn.addEventListener("click", commit);
  $("#fName").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
  });
  $("#fDesc").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
  });

  /* Delete asks once, in place — no dialog stacked on a dialog. */
  function resetDelete() {
    clearTimeout(confirmTimer);
    deleteBtn.classList.remove("armed");
    deleteBtn.textContent = "Delete";
  }
  deleteBtn.addEventListener("click", function () {
    if (!deleteBtn.classList.contains("armed")) {
      deleteBtn.classList.add("armed");
      deleteBtn.textContent = "Delete for good?";
      confirmTimer = setTimeout(resetDelete, 4000);
      return;
    }
    var i = DOC.scripts.indexOf(current);
    if (i > -1) DOC.scripts.splice(i, 1);
    goList();
    renderCatDrop();
    render();
    saveDoc();
  });

  cancelBtn.addEventListener("click", goList);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) goList();
  });

  /* Escape closes the topmost thing: menu, dropdown, then a modal. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (menuId) { var btn = menuBtn; closeRowMenu(); if (btn) btn.focus(); return; }
    if (catDrop.classList.contains("open")) { closeCatDrop(); catBtn.focus(); return; }
    if (current) { goList(); return; }
    if (scriptOpen) goList();
  });

  /* =========================================================
     Router

     One direction only: something changes the hash, the router reads it,
     and the router alone opens or closes a modal. Nothing calls showScript
     or showModal behind its back, so a reload, a back button and a pasted
     link all land in the same place.

     applyRoute is safe to run twice on the same hash — it compares what
     should be open against what is open and only acts on the difference.
     ========================================================= */
  function parseHash() {
    var raw = String(location.hash || "").replace(/^#\/?/, "");
    if (!raw) return { name: "list" };

    var parts = raw.split("/").filter(Boolean);
    if (parts[0] === "script" && parts[1]) {
      var id = parts[1];
      try { id = decodeURIComponent(id); } catch (e) { /* leave it as-is */ }
      return { name: parts[2] === "details" ? "details" : "view", id: id };
    }
    /* Not one of ours — treat it as the list, but leave the hash alone.
       It may belong to something else on the page. */
    return { name: "list", foreign: true };
  }

  function applyRoute() {
    /* Before the file lands there's nothing to open. The load calls back. */
    if (!loaded) return;

    var r = parseHash();

    if (r.name === "view" || r.name === "details") {
      var s = scriptById(r.id);
      if (!s) {
        toast("warn", "That link points at a script that isn\u2019t here any more");
        replaceHash("#/");
        return;
      }
      if (r.name === "view" && !demosLoaded) {
        toast("warn", "Couldn\u2019t load " + DEMOS_FILE + ", so there\u2019s nothing to read");
        replaceHash("#/");
        return;
      }

      if (r.name === "view") {
        hideModal();
        if (!scriptOpen || viewing !== s) showScript(s);
      } else {
        hideScript();
        if (current !== s) { hideModal(); showModal(s); }
      }
      return;
    }

    hideScript();
    hideModal();
  }

  /* A new address, remembered — back returns to what you were reading. */
  function navigate(hash) {
    if (location.hash === hash) { applyRoute(); return; }
    location.hash = hash;
  }

  /* Same address, corrected. Closing a modal shouldn't leave a step in the
     history that reopens it the moment you press back. */
  function replaceHash(hash) {
    if (history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search + hash);
      applyRoute();
    } else {
      location.hash = hash;   /* older browsers: hashchange does the work */
    }
  }

  function goList() { replaceHash("#/"); }

  window.addEventListener("hashchange", applyRoute);

  /* ---- Copy link ---- */
  function copyLink(id) {
    var url = absUrl(viewUrl(id));

    function ok() { toast("ok", "Link copied"); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      var done = false;
      try { done = document.execCommand("copy"); } catch (e) { done = false; }
      document.body.removeChild(ta);
      if (done) ok();
      else toast("warn", "Couldn\u2019t copy \u2014 the link is in the address bar");
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(ok, fallback);
    } else {
      fallback();
    }
  }

  /* -------------------------------------------------------
     Load both files, then run the first render
  ------------------------------------------------------- */
  function loadDemos() {
    return fetch(DEMOS_FILE, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (doc) {
        DEMOS = doc;
        demoById_ = {};
        (DEMOS.demos || []).forEach(function (d) { demoById_[d.id] = d; });
        demosLoaded = true;
      })
      .catch(function () {
        /* The page still works: names, categories and filing all live in
           the scripts file. Only counts, times and the read view need this. */
        demosLoaded = false;
      });
  }

  loadDemos().then(function () {
    return fetch(DATA_FILE, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (doc) {
        DOC = doc;
        DOC.categories = DOC.categories || [];
        DOC.scripts = DOC.scripts || [];
        indexCats();
        loaded = true;
        renderCatDrop();
        render();
        status();

        if (!demosLoaded) toast("warn", "Couldn\u2019t load " + DEMOS_FILE + " \u2014 counts and times may be stale");

        /* The address may already be asking for a modal. */
        applyRoute();
      })
      .catch(function () {
        loaded = false;
        status();
        emptyEl.classList.add("show");
        emptyEl.querySelector("strong").textContent = "Couldn\u2019t load " + DATA_FILE;
        emptyEl.querySelector("span").textContent =
          "Build a script on the Demos page and save it \u2014 that writes the file. Or check it's in the same folder as this page.";
      });
  });
})();
