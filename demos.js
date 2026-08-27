/* =========================================================
   DEMOS PAGE

   Every card — categories included — lives in demos-data.json.
   Nothing about the content is in the HTML.

   Saving works the way the Media Logbook does: PUT the whole
   file back. A plain static host will refuse that, so the page
   keeps your edits for the session and hands you the updated
   file to swap in whenever you're done.
   ========================================================= */
(function () {
  var DATA_FILE = "demos-data.json";
  var $ = function (s) { return document.querySelector(s); };

  var DOC = { version: 1, updated: null, categories: [], personas: [], demos: [] };
  var catById = {};
  var perById = {};
  var unsaved = 0;              /* edits made since the file last accepted a write */
  var loaded = false;

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
  function catOf(demo) {
    return catById[demo.cat] || { id: demo.cat, label: demo.cat || "Uncategorised", color: "#94a3b8" };
  }

  /* Personas sit beside modules: one per demo, its own list in the file.
     A demo is allowed to have none — older cards predate the field. */
  function indexPersonas() {
    perById = {};
    DOC.personas.forEach(function (p) { perById[p.id] = p; });
  }
  function personaOf(demo) {
    if (!demo || !demo.persona) return null;
    return perById[demo.persona] ||
      { id: demo.persona, label: demo.persona, color: colorFor(demo.persona) };
  }
  function demoById(id) {
    for (var i = 0; i < DOC.demos.length; i++) if (DOC.demos[i].id === id) return DOC.demos[i];
    return null;
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

  /* Inline SVG, inherits currentColor — that's what makes the
     green-to-rose recolour and the glow work. */
  var ICON_PLUS =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/>' +
    '<line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
  var ICON_MINUS =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/>' +
    '<line x1="8" y1="12" x2="16" y2="12"/></svg>';
  var ICON_KEBAB =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">' +
    '<circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/>' +
    '<circle cx="12" cy="19" r="1.8"/></svg>';

  /* Same handle as a task card on the board, so the gesture reads
     the same in both places. */
  var ICON_GRIP =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">' +
    '<circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>' +
    '<circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>' +
    '<circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';

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

  /* =========================================================
     SAVED SCRIPTS

     A second file, written the same way. It stores demo ids and
     nothing else, so a script always reads whatever the write-ups
     currently say — rewrite a demo and every script that uses it
     is already up to date.

     Its categories are its own. One script covers several demo
     categories, so the two lists have no reason to match.
     ========================================================= */
  var SCRIPTS_FILE = "scripts-data.json";
  var SDOC = { version: 1, updated: null, categories: [], scripts: [] };
  var scatById = {};
  var editingScriptId = null;   /* the saved script the builder is standing in */

  function indexScriptCats() {
    scatById = {};
    SDOC.categories.forEach(function (c) { scatById[c.id] = c; });
  }
  function scriptById(id) {
    for (var i = 0; i < SDOC.scripts.length; i++) if (SDOC.scripts[i].id === id) return SDOC.scripts[i];
    return null;
  }

  /* A category invented in the modal still needs a color. Hash the name so
     the same word always lands on the same hue. Same rule as the Links page. */
  function colorFor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return "hsl(" + (Math.abs(hash) % 360) + ", 70%, 60%)";
  }
  function slug(name) {
    var base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cat";
    var id = base, n = 2;
    while (scatById[id]) id = base + "-" + n++;
    return id;
  }

  function saveScripts() {
    var stamp = new Date().toISOString();
    SDOC.updated = stamp;
    toast("pending", "Saving\u2026");

    fetch(SCRIPTS_FILE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SDOC, null, 2)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return confirmWrite(SCRIPTS_FILE, stamp);
    }).then(function () {
      toast("ok", "Saved to " + SCRIPTS_FILE);
    }).catch(function () {
      clearTimeout(toastTimer);
      toastEl.className = "toast show is-warn";
      toastTextEl.innerHTML = 'Couldn\u2019t auto-save \u2014 <a href="#" id="toastDownloadScripts">download ' +
                              esc(SCRIPTS_FILE) + "</a>";
      $("#toastDownloadScripts").addEventListener("click", function (e) {
        e.preventDefault();
        var blob = new Blob([JSON.stringify(SDOC, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = SCRIPTS_FILE;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast("ok", "Downloaded " + SCRIPTS_FILE + " \u2014 swap it in to make it permanent");
      });
    });
  }

  /* -------------------------------------------------------
     Rail + grid
  ------------------------------------------------------- */
  var filtersEl = $("#filters"), gridEl = $("#grid"),
      countEl = $("#count"), emptyEl = $("#emptyState");
  var active = new Set();

  /* Tag filter. Modules default to all-on, so "none lit" there means
     no filter. Tags are the other way round: nothing is lit until you
     pick something, and an empty set means the tags aren't filtering
     at all. Several tags read as "any of these", the same way several
     modules do. */
  var tagFilterEl = $("#tagFilter"),
      tagFiltersEl = $("#tagFilters"),
      tagClearBtn = $("#tagClear");
  var activeTags = new Set();

  /* Personas filter the same way tags do — nothing lit means no
     filter, and several lit read as "any of these". */
  var personaFilterEl = $("#personaFilter"),
      personaFiltersEl = $("#personaFilters"),
      personaClearBtn = $("#personaClear");
  var activePersonas = new Set();

  function matchesPersonas(d) {
    if (!activePersonas.size) return true;
    return !!d.persona && activePersonas.has(d.persona);
  }

  /* Tags are free text in the form, so "Keyboard" and "keyboard" are
     the same tag. Match on a folded key, show the first spelling seen. */
  function tagKey(t) { return String(t == null ? "" : t).trim().toLowerCase(); }

  function demoTagKeys(d) {
    return (d.tags || []).map(tagKey).filter(Boolean);
  }

  /* Every tag in the file, alphabetical. The count on a chip is how many
     demos would show if you lit it — so it respects the other two filters
     but not the tag filter itself, which is what makes the numbers useful
     while you're picking. */
  function allTags() {
    var byKey = {};
    DOC.demos.forEach(function (d) {
      var visible = active.has(d.cat) && matchesPersonas(d);
      demoTagKeys(d).forEach(function (k) {
        if (!byKey[k]) {
          /* First spelling wins as the label. */
          var label = (d.tags || []).filter(function (t) { return tagKey(t) === k; })[0];
          byKey[k] = { key: k, label: String(label).trim(), n: 0 };
        }
        if (visible) byKey[k].n++;
      });
    });
    return Object.keys(byKey).sort().map(function (k) { return byKey[k]; });
  }

  /* Personas in the order the file lists them — a hand-kept list, not
     harvested text, so alphabetising it would fight the user's ordering. */
  function allPersonas() {
    return DOC.personas.map(function (p) {
      var n = DOC.demos.filter(function (d) {
        return d.persona === p.id && active.has(d.cat) && matchesTags(d);
      }).length;
      return { id: p.id, label: p.label, color: p.color || colorFor(p.id), n: n };
    });
  }

  function matchesTags(d) {
    if (!activeTags.size) return true;
    return demoTagKeys(d).some(function (k) { return activeTags.has(k); });
  }

  /* Script builder list: demo ids, in the order they'll be read.
     Session only — it isn't part of the saved file. */
  var script = [];
  function inScript(id) { return script.indexOf(id) > -1; }

  function allIds() { return DOC.categories.map(function (c) { return c.id; }); }

  function renderRail() {
    filtersEl.innerHTML = DOC.categories.map(function (c) {
      var n = DOC.demos.filter(function (d) { return d.cat === c.id; }).length;
      var on = active.has(c.id);
      return '<button class="option-row filter-row" type="button" data-cat="' + esc(c.id) + '" ' +
               'style="--dot-color:' + esc(c.color) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
               '<span class="dot' + (on ? " on" : "") + '"></span>' +
               '<span class="option-label">' + esc(c.label) + "</span>" +
               '<span class="filter-count">' + n + "</span>" +
             "</button>";
    }).join("");
  }

  /* Chips rather than rows: a tag is a word, and there are more of
     them than there are modules. Lit chips carry the tag's own colour,
     hashed from the word so it never moves. */
  function renderTagRail() {
    var tags = allTags();

    /* Drop selections whose tag no longer exists anywhere in the file. */
    var live = {};
    tags.forEach(function (t) { live[t.key] = true; });
    activeTags.forEach(function (k) { if (!live[k]) activeTags.delete(k); });

    tagFilterEl.hidden = tags.length === 0;
    tagClearBtn.hidden = activeTags.size === 0;

    tagFiltersEl.innerHTML = tags.map(function (t) {
      var on = activeTags.has(t.key);
      return '<button class="tag-chip' + (on ? " on" : "") + (t.n ? "" : " is-empty") + '" ' +
               'type="button" data-tag="' + esc(t.key) + '" ' +
               'style="--tag-color:' + esc(colorFor(t.key)) + '" ' +
               'aria-pressed="' + (on ? "true" : "false") + '" ' +
               'title="' + esc(t.label) + " \u00b7 " + t.n +
                 (t.n === 1 ? " demo" : " demos") + '">' +
               '<span class="tag-chip-label">' + esc(t.label) + "</span>" +
               '<span class="tag-chip-count">' + t.n + "</span>" +
             "</button>";
    }).join("");
  }

  /* Same chips as tags, but the colour is the persona's own from the
     file rather than a hash, so you can pick it deliberately. */
  function renderPersonaRail() {
    var people = allPersonas();

    /* Drop selections whose persona has left the file. */
    var live = {};
    people.forEach(function (p) { live[p.id] = true; });
    activePersonas.forEach(function (k) { if (!live[k]) activePersonas.delete(k); });

    personaFilterEl.hidden = people.length === 0;
    personaClearBtn.hidden = activePersonas.size === 0;

    personaFiltersEl.innerHTML = people.map(function (p) {
      var on = activePersonas.has(p.id);
      return '<button class="tag-chip persona-chip' + (on ? " on" : "") +
               (p.n ? "" : " is-empty") + '" type="button" data-persona="' + esc(p.id) + '" ' +
               'style="--tag-color:' + esc(p.color) + '" ' +
               'aria-pressed="' + (on ? "true" : "false") + '" ' +
               'title="' + esc(p.label) + " \u00b7 " + p.n +
                 (p.n === 1 ? " demo" : " demos") + '">' +
               '<span class="tag-chip-label">' + esc(p.label) + "</span>" +
               '<span class="tag-chip-count">' + p.n + "</span>" +
             "</button>";
    }).join("");
  }

  function renderGrid() {
    var shown = DOC.demos.filter(function (d) {
      return active.has(d.cat) && matchesPersonas(d) && matchesTags(d);
    });

    gridEl.innerHTML = shown.map(function (d) {
      var c = catOf(d);
      var p = personaOf(d);
      var on = inScript(d.id);
      return '<article class="card demo-card" role="button" tabindex="0" ' +
               'data-id="' + esc(d.id) + '" style="--cat:' + esc(c.color) + '">' +
               '<div class="demo-card-top">' +
                 '<span class="tag" style="--tag-color:' + esc(c.color) + '">' + esc(c.label) + "</span>" +
                 (p ? '<span class="persona-bubble" style="--tag-color:' + esc(p.color) + '">' +
                        esc(p.label) + "</span>" : "") +
                 '<span class="card-top-spacer"></span>' +
                 '<button class="icon-btn script-add' + (on ? " on" : "") + '" type="button" ' +
                   'data-id="' + esc(d.id) + '" aria-pressed="' + (on ? "true" : "false") + '" ' +
                   'aria-label="' + (on ? "Remove from script builder" : "Add to script builder") + '">' +
                   (on ? ICON_MINUS : ICON_PLUS) +
                 "</button>" +
               "</div>" +
               '<h3 class="demo-title">' + esc(d.title) + "</h3>" +
               '<p class="demo-desc">' + esc(d.desc) + "</p>" +
               '<p class="demo-tags">' + (d.tags || []).map(function (t) {
                 /* Mark the tags that put this card here. */
                 var hit = activeTags.has(tagKey(t));
                 return '<span class="demo-tag' + (hit ? " hit" : "") + '"' +
                        (hit ? ' style="--tag-color:' + esc(colorFor(tagKey(t))) + '"' : "") +
                        ">" + esc(t) + "</span>";
               }).join('<span class="demo-tag-sep">\u00b7</span>') + "</p>" +
             "</article>";
    }).join("");

    countEl.textContent = shown.length + (shown.length === 1 ? " demo" : " demos");
    emptyEl.classList.toggle("show", shown.length === 0);

    /* Say which filter is doing the hiding, so the fix is obvious. */
    if (shown.length === 0 && loaded) {
      var culprits = [];
      if (activePersonas.size) culprits.push("persona");
      if (activeTags.size) culprits.push(activeTags.size === 1 ? "tag" : "tags");
      emptyEl.querySelector("span").textContent = culprits.length
        ? "Nothing matches the " + culprits.join(" and ") +
          " you've picked. Clear one, or turn a module back on."
        : "Add a demo, or turn a module back on.";
    }
  }

  /* -------------------------------------------------------
     Script builder
  ------------------------------------------------------- */
  var scriptSection = $("#scriptSection"),
      scriptListEl = $("#scriptList"),
      scriptCountEl = $("#scriptCount");

  function renderScript() {
    /* Drop anything that's since been deleted. */
    script = script.filter(function (id) { return !!demoById(id); });

    scriptSection.hidden = script.length === 0;
    scriptCountEl.textContent = script.length + (script.length === 1 ? " demo" : " demos");

    scriptListEl.innerHTML = script.map(function (id, i) {
      var d = demoById(id), c = catOf(d), m = minsOf(d), p = personaOf(d);
      return '<div class="script-row" data-id="' + esc(id) + '" tabindex="0" ' +
               'aria-label="' + esc(d.title || "Untitled demo") +
               (p ? ", " + esc(p.label) : "") + ", position " +
               (i + 1) + " of " + script.length + '">' +
               '<button class="icon-btn script-grip" type="button" tabindex="-1" ' +
                 'aria-label="Drag to reorder">' + ICON_GRIP +
               "</button>" +
               '<span class="script-row-title">' + esc(d.title || "Untitled demo") + "</span>" +
               (p ? '<span class="persona-bubble" style="--tag-color:' + esc(p.color) + '">' +
                      esc(p.label) + "</span>" : "") +
               '<span class="script-row-desc">' + esc(d.desc) + "</span>" +
               (m ? '<span class="script-row-time">' + fmtTime(m, true) + "</span>" : "") +
               '<span class="tag" style="--tag-color:' + esc(c.color) + '">' + esc(c.label) + "</span>" +
               '<button class="icon-btn script-menu-btn" type="button" data-id="' + esc(id) + '" ' +
                 'aria-haspopup="true" aria-expanded="false" aria-label="More actions">' + ICON_KEBAB +
               "</button>" +
             "</div>";
    }).join("");

    var total = totalMins();
    $("#scriptTotal").innerHTML = total
      ? "Approx. total<b>" + fmtTime(total) + "</b>"
      : "";

    syncEditingPill();
  }

  function totalMins() {
    return script.reduce(function (sum, id) { return sum + minsOf(demoById(id)); }, 0);
  }

  /* Only the one button changes, so a card in view doesn't blink. */
  function syncAddButtons() {
    [].forEach.call(gridEl.querySelectorAll(".script-add"), function (btn) {
      var on = inScript(btn.dataset.id);
      btn.classList.toggle("on", on);
      btn.innerHTML = on ? ICON_MINUS : ICON_PLUS;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? "Remove from script builder" : "Add to script builder");
    });
  }

  function toggleScript(id) {
    var i = script.indexOf(id);
    if (i > -1) script.splice(i, 1); else script.push(id);
    closeRowMenu();
    renderScript();
    syncAddButtons();
  }

  function moveScript(id, step) {
    var i = script.indexOf(id), j = i + step;
    if (i < 0 || j < 0 || j >= script.length) return;
    script.splice(j, 0, script.splice(i, 1)[0]);
    renderScript();
  }

  function focusRow(id) {
    var el = scriptListEl.querySelector('.script-row[data-id="' + id + '"]');
    if (el) el.focus();
  }

  /* -------------------------------------------------------
     Reordering by drag

     Same pointer-event approach as the task board: one code
     path for a mouse and a finger, and what follows the
     pointer is a clone while the original dims in place.

     The board moves a card between columns, so it re-renders
     on drop. Here the order is the only thing changing, so the
     rows are shuffled in the DOM as you go and the array is
     read back from that order once you let go. That way the
     row you're carrying keeps its identity for the whole drag.
  ------------------------------------------------------- */
  var sdrag = null;
  var suppressRowClick = false;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  scriptListEl.addEventListener("pointerdown", function (e) {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest(".script-menu-btn")) return;

    var row = e.target.closest(".script-row");
    if (!row || script.length < 2) return;

    /* Without a mouse, only the grip starts a drag — otherwise
       scrolling the list would fling rows around. */
    var onGrip = !!e.target.closest(".script-grip");
    if (!onGrip && !finePointer.matches) return;
    if (onGrip) e.preventDefault();

    var rect = row.getBoundingClientRect();
    sdrag = {
      id: row.dataset.id,
      row: row,
      x0: e.clientX, y0: e.clientY,
      ox: e.clientX - rect.left,
      oy: e.clientY - rect.top,
      w: rect.width, h: rect.height,
      moved: false, ghost: null
    };
  });

  function startRowDrag() {
    sdrag.moved = true;
    closeRowMenu();

    var ghost = sdrag.row.cloneNode(true);
    ghost.classList.add("script-ghost");
    ghost.removeAttribute("tabindex");
    ghost.style.width = sdrag.w + "px";
    ghost.style.height = sdrag.h + "px";
    document.body.appendChild(ghost);

    sdrag.ghost = ghost;
    sdrag.row.classList.add("dragging");
    document.body.classList.add("dragging-row");
  }

  function moveRowGhost(x, y) {
    sdrag.ghost.style.left = (x - sdrag.ox) + "px";
    sdrag.ghost.style.top = (y - sdrag.oy) + "px";

    /* The ghost has pointer-events: none, so this reads through it. */
    var under = document.elementFromPoint(x, y);
    var over = under && under.closest ? under.closest(".script-row") : null;
    if (!over || over === sdrag.row || !scriptListEl.contains(over)) return;

    /* Past the halfway line, the carried row goes after it. */
    var box = over.getBoundingClientRect();
    var after = y > box.top + box.height / 2;
    scriptListEl.insertBefore(sdrag.row, after ? over.nextSibling : over);
  }

  document.addEventListener("pointermove", function (e) {
    if (!sdrag) return;
    if (!sdrag.moved) {
      if (Math.abs(e.clientX - sdrag.x0) + Math.abs(e.clientY - sdrag.y0) < 6) return;
      startRowDrag();
    }
    if (e.cancelable) e.preventDefault();
    moveRowGhost(e.clientX, e.clientY);
  }, { passive: false });

  function endRowDrag(commit) {
    if (!sdrag) return;
    var d = sdrag;
    sdrag = null;

    if (!d.moved) return;

    if (d.ghost) d.ghost.remove();
    d.row.classList.remove("dragging");
    document.body.classList.remove("dragging-row");

    /* A drag that ends is never also a click. */
    suppressRowClick = true;

    if (commit) {
      /* The DOM is the running order now — read it back. */
      script = [].map.call(scriptListEl.querySelectorAll(".script-row"), function (r) {
        return r.dataset.id;
      });
    }

    renderScript();
    focusRow(d.id);
  }

  document.addEventListener("pointerup", function () { endRowDrag(true); });
  document.addEventListener("pointercancel", function () { endRowDrag(false); });
  document.addEventListener("click", function () { suppressRowClick = false; });

  /* Arrow keys are the drag for anyone not using a pointer. */
  scriptListEl.addEventListener("keydown", function (e) {
    var row = e.target.closest && e.target.closest(".script-row");
    if (!row) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

    e.preventDefault();
    var id = row.dataset.id;
    moveScript(id, e.key === "ArrowDown" ? 1 : -1);
    focusRow(id);
  });

  /* One panel, repositioned per row — right-aligned under its button. */
  var rowMenu = $("#rowMenu"), menuId = null, menuBtn = null;

  function openRowMenu(btn) {
    closeRowMenu();
    menuId = btn.dataset.id;
    menuBtn = btn;

    var i = script.indexOf(menuId);
    rowMenu.querySelector('[data-act="up"]').disabled = i <= 0;
    rowMenu.querySelector('[data-act="down"]').disabled = i === script.length - 1;

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
    rowMenu.classList.remove("open");
    if (menuBtn) {
      menuBtn.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    }
    menuId = null;
    menuBtn = null;
  }

  scriptListEl.addEventListener("click", function (e) {
    if (suppressRowClick) return;
    var btn = e.target.closest(".script-menu-btn");
    if (!btn) return;
    e.stopPropagation();
    if (menuId === btn.dataset.id) closeRowMenu();
    else openRowMenu(btn);
  });

  rowMenu.addEventListener("click", function (e) {
    var item = e.target.closest(".menu-item");
    if (!item || item.disabled) return;
    var act = item.dataset.act, id = menuId;
    closeRowMenu();
    if (act === "remove") toggleScript(id);
    else moveScript(id, act === "up" ? -1 : 1);
  });

  document.addEventListener("click", function (e) {
    if (menuId && !rowMenu.contains(e.target)) closeRowMenu();
  });
  document.addEventListener("scroll", closeRowMenu, { passive: true });
  window.addEventListener("resize", closeRowMenu);

  /* -------------------------------------------------------
     The script itself. One builder, two outputs: the read-only
     modal and the printed page.
  ------------------------------------------------------- */
  function scriptDocHTML() {
    return script.map(function (id) {
      var d = demoById(id);
      var body = (d.body || "").trim();
      var p = personaOf(d);
      return '<section class="script-entry">' +
               '<h2 class="script-entry-title">' + esc(d.title || "Untitled demo") +
                 /* Two demos can share a title and differ only by persona,
                    so the heading has to carry it or the script reads as
                    the same section twice. */
                 (p ? '<span class="script-entry-persona">' + esc(p.label) + "</span>" : "") +
               "</h2>" +
               (body || '<p class="doc-empty">No write-up yet.</p>') +
             "</section>";
    }).join("");
  }

  function scriptMeta() {
    var n = script.length + (script.length === 1 ? " demo." : " demos.");
    var t = totalMins();
    return t ? n + " Approximately " + fmtTime(t) + "." : n;
  }

  /* ---- Read-only modal ---- */
  var scriptOverlay = $("#scriptOverlay"), scriptOpen = false, scriptLastFocus = null;

  function openScript() {
    if (!script.length) return;
    scriptLastFocus = document.activeElement;
    $("#scriptDoc").innerHTML = scriptDocHTML();
    $("#scriptMeta").textContent = scriptMeta();
    $("#scriptScroll").scrollTop = 0;
    scriptOverlay.classList.add("open");
    scriptOpen = true;
    document.body.style.overflow = "hidden";
    $("#scriptDone").focus();
  }

  function closeScript() {
    scriptOverlay.classList.remove("open");
    scriptOpen = false;
    document.body.style.overflow = "";
    if (scriptLastFocus) scriptLastFocus.focus();
  }

  $("#displayBtn").addEventListener("click", openScript);
  $("#scriptDone").addEventListener("click", closeScript);
  $("#scriptClose").addEventListener("click", closeScript);
  scriptOverlay.addEventListener("click", function (e) {
    if (e.target === scriptOverlay) closeScript();
  });

  /* ---- PDF ----
     No library: fill the print root, hand the page to the browser's
     print dialog, and let "Save as PDF" do the rendering. Real text,
     real page breaks, images intact. */
  function exportPDF() {
    if (!script.length) return;
    var when = new Date().toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric"
    });

    $("#printRoot").innerHTML =
      '<div class="print-head"><span>Script</span><span>' +
        esc(scriptMeta()) + " " + esc(when) + "</span></div>" +
      scriptDocHTML();

    /* The saved file takes its name from the document title. */
    var title = document.title;
    document.title = "Script";
    window.print();
    document.title = title;

    toast("ok", "Choose \u201cSave as PDF\u201d in the print dialog");
  }

  $("#pdfBtn").addEventListener("click", exportPDF);
  $("#pdfBtnModal").addEventListener("click", exportPDF);

  window.addEventListener("afterprint", function () { $("#printRoot").innerHTML = ""; });

  function render() { renderRail(); renderPersonaRail(); renderTagRail(); renderGrid(); renderScript(); }

  /* All on: a click means "just this one". None lit is the same
     as no filter, so everything comes back. */
  function toggleCat(id) {
    if (active.size === DOC.categories.length) active = new Set([id]);
    else if (active.has(id)) {
      active.delete(id);
      if (active.size === 0) active = new Set(allIds());
    } else active.add(id);
    render();
  }

  filtersEl.addEventListener("click", function (e) {
    var row = e.target.closest(".filter-row");
    if (row) toggleCat(row.dataset.cat);
  });

  /* Plain on/off, as many as you like. Nothing lit means no persona filter. */
  function togglePersona(id) {
    if (activePersonas.has(id)) activePersonas.delete(id);
    else activePersonas.add(id);
    render();
  }

  personaFiltersEl.addEventListener("click", function (e) {
    var chip = e.target.closest(".persona-chip");
    if (chip) togglePersona(chip.dataset.persona);
  });

  personaClearBtn.addEventListener("click", function () {
    activePersonas.clear();
    render();
  });

  /* Plain on/off, as many as you like. Nothing lit means no tag filter. */
  function toggleTag(key) {
    if (activeTags.has(key)) activeTags.delete(key);
    else activeTags.add(key);
    render();
  }

  tagFiltersEl.addEventListener("click", function (e) {
    var chip = e.target.closest(".tag-chip");
    if (chip) toggleTag(chip.dataset.tag);
  });

  tagClearBtn.addEventListener("click", function () {
    activeTags.clear();
    render();
  });

  gridEl.addEventListener("click", function (e) {
    /* The toggle sits on the card, but it isn't a way into the card. */
    var add = e.target.closest(".script-add");
    if (add) { e.stopPropagation(); toggleScript(add.dataset.id); return; }
    var card = e.target.closest(".demo-card");
    if (card) openCard(card.dataset.id);
  });
  gridEl.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest(".script-add")) return;   /* the button handles itself */
    var card = e.target.closest(".demo-card");
    if (card) { e.preventDefault(); openCard(card.dataset.id); }
  });

  /* -------------------------------------------------------
     Modal: view mode by default, edit mode on request
  ------------------------------------------------------- */
  var overlay = $("#overlay"), modalBox = $("#modalBox");
  var viewer = $("#viewer"), editor = $("#editor");
  var formPane = $("#formPane"), toolbar = $("#toolbar");
  var editBtn = $("#editBtn"), doneBtn = $("#doneBtn"),
      saveBtn = $("#saveBtn"), cancelBtn = $("#cancelBtn"), deleteBtn = $("#deleteBtn");

  var current = null;      /* the record being shown */
  var editing = false;
  var isDraft = false;     /* a new card, not in DOC.demos until saved */
  var lastFocus = null;
  var draftCat = null;
  var draftPersona = null;
  var confirmTimer = null;

  function paintHead() {
    var c = catOf(current);
    modalBox.style.setProperty("--cat", c.color);
    $("#modalTag").textContent = c.label;
    $("#modalTag").style.setProperty("--tag-color", c.color);
    paintHeadPersona();
    $("#modalTitle").textContent = current.title || "Untitled demo";
    $("#modalDesc").textContent = current.desc || "";
    var m = minsOf(current);
    $("#modalTags").textContent =
      (m ? [fmtTime(m, true)] : []).concat(current.tags || []).join(" \u00b7 ");
  }

  /* The head bubble follows whatever the picker says, draft or saved. */
  function paintHeadPersona() {
    var el = $("#modalPersona");
    var p = personaOf(editing ? { persona: draftPersona } : current);
    el.hidden = !p;
    if (!p) return;
    el.textContent = p.label;
    el.style.setProperty("--tag-color", p.color);
  }

  function openCard(id) {
    var d = demoById(id);
    if (!d) return;
    current = d;
    isDraft = false;
    lastFocus = document.activeElement;
    paintHead();
    setMode(false);
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    doneBtn.focus();
  }

  function openDraft() {
    if (!DOC.categories.length) return;
    current = {
      id: "d" + Date.now().toString(36),
      cat: DOC.categories[0].id,
      persona: DOC.personas.length ? DOC.personas[0].id : null,
      title: "", desc: "", mins: 0, tags: [], body: ""
    };
    isDraft = true;
    lastFocus = document.activeElement;
    paintHead();
    setMode(true);
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    $("#fTitle").focus();
  }

  /* The nav's New → Demo calls this. If the file hasn't landed yet the
     request waits for it rather than opening an empty category picker. */
  var pendingDraft = false;
  window.DemoPage = {
    openDraft: function () {
      if (loaded) openDraft(); else pendingDraft = true;
    }
  };

  /* Same request, arriving as a URL because the nav was on another page. */
  function draftWasRequested() {
    return /(^|[?&])new=demo(&|$)/.test(location.search);
  }

  function closeModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    current = null;
    editing = false;
    isDraft = false;
    resetDelete();
    if (lastFocus) lastFocus.focus();
  }

  /* One switch, both directions. */
  function setMode(edit) {
    editing = edit;
    resetDelete();

    viewer.hidden = edit;
    editor.hidden = !edit;
    formPane.hidden = !edit;
    toolbar.hidden = !edit;

    $("#modalDesc").hidden = edit;      /* the form owns these while editing */
    $("#modalTags").hidden = edit;

    editBtn.hidden = edit;
    doneBtn.hidden = edit;
    saveBtn.hidden = !edit;
    cancelBtn.hidden = !edit;
    deleteBtn.hidden = !edit || isDraft;

    if (edit) {
      draftCat = current.cat;
      draftPersona = current.persona || null;
      $("#fTitle").value = current.title || "";
      $("#fMins").value = minsOf(current) || "";
      $("#fDesc").value = current.desc || "";
      $("#fTags").value = (current.tags || []).join(", ");
      renderCatPicker();
      renderPersonaPicker();
      $("#fNewPersona").value = "";
      editor.innerHTML = current.body || "";
      syncToolbar();
    } else {
      var body = (current.body || "").trim();
      viewer.innerHTML = body ||
        '<p class="doc-empty">Nothing written yet. Click Edit to add notes, lists, or screenshots.</p>';
    }
    /* Both directions: the head reads the draft while editing and the
       record once the form is gone. */
    paintHeadPersona();
    $("#modalBody").scrollTop = 0;
  }

  function renderCatPicker() {
    $("#fCat").innerHTML = DOC.categories.map(function (c) {
      var on = (c.id === draftCat);
      return '<button class="option-row cat-option" type="button" data-cat="' + esc(c.id) + '" ' +
               'style="--dot-color:' + esc(c.color) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
               '<span class="dot' + (on ? " on" : "") + '"></span>' +
               '<span class="option-label">' + esc(c.label) + "</span>" +
             "</button>";
    }).join("");
  }

  /* One persona per demo, same shape as the module picker. Clicking the
     lit one clears it, since a demo is allowed to have no persona. */
  function renderPersonaPicker() {
    var el = $("#fPersona");
    if (!DOC.personas.length) {
      el.innerHTML = '<p class="hint" style="margin:6px 8px">' +
        "No personas yet. Add the first one below.</p>";
      return;
    }
    el.innerHTML = DOC.personas.map(function (p) {
      var on = (p.id === draftPersona);
      return '<button class="option-row cat-option" type="button" data-persona="' + esc(p.id) + '" ' +
               'style="--dot-color:' + esc(p.color || colorFor(p.id)) + '" ' +
               'aria-pressed="' + (on ? "true" : "false") + '">' +
               '<span class="dot' + (on ? " on" : "") + '"></span>' +
               '<span class="option-label">' + esc(p.label) + "</span>" +
             "</button>";
    }).join("");
  }

  $("#fPersona").addEventListener("click", function (e) {
    var btn = e.target.closest(".cat-option");
    if (!btn) return;
    var id = btn.dataset.persona;
    draftPersona = (draftPersona === id) ? null : id;   /* click the lit one to clear */
    renderPersonaPicker();
    paintHeadPersona();
  });

  /* A persona invented here is committed as soon as it's added, not when
     the card is saved — otherwise cancelling would strand the reference. */
  function addPersona() {
    var input = $("#fNewPersona");
    var label = input.value.trim();
    if (!label) { input.focus(); return; }

    var existing = null;
    DOC.personas.forEach(function (p) {
      if (p.label.toLowerCase() === label.toLowerCase()) existing = p;
    });
    if (existing) {
      draftPersona = existing.id;
      input.value = "";
      renderPersonaPicker();
      paintHeadPersona();
      toast("ok", existing.label + " already exists \u2014 picked it for you");
      return;
    }

    var base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "persona";
    var id = base, n = 2;
    while (perById[id]) id = base + "-" + n++;

    var p = { id: id, label: label, color: colorFor(id) };
    DOC.personas.push(p);
    indexPersonas();

    draftPersona = id;
    input.value = "";
    renderPersonaPicker();
    paintHeadPersona();
    renderPersonaRail();
    saveDoc();
  }

  $("#addPersonaBtn").addEventListener("click", addPersona);
  $("#fNewPersona").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addPersona();
  });

  $("#fCat").addEventListener("click", function (e) {
    var btn = e.target.closest(".cat-option");
    if (!btn) return;
    draftCat = btn.dataset.cat;
    renderCatPicker();
    /* Head chip follows the choice straight away. */
    var c = catById[draftCat];
    modalBox.style.setProperty("--cat", c.color);
    $("#modalTag").textContent = c.label;
    $("#modalTag").style.setProperty("--tag-color", c.color);
  });

  $("#fTitle").addEventListener("input", function () {
    $("#modalTitle").textContent = this.value || "Untitled demo";
  });

  /* ---- Buttons ---- */
  editBtn.addEventListener("click", function () { setMode(true); });
  doneBtn.addEventListener("click", closeModal);
  $("#modalClose").addEventListener("click", function () {
    if (editing) cancelEdit(); else closeModal();
  });

  cancelBtn.addEventListener("click", cancelEdit);

  function cancelEdit() {
    if (isDraft) { closeModal(); return; }
    paintHead();
    setMode(false);
  }

  saveBtn.addEventListener("click", function () {
    current.title = $("#fTitle").value.trim() || "Untitled demo";
    current.desc = $("#fDesc").value.trim();
    current.mins = Math.max(0, Math.round(Number($("#fMins").value) || 0));
    current.cat = draftCat;
    current.persona = draftPersona || null;
    current.tags = $("#fTags").value.split(",")
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
    current.body = editor.innerHTML;

    if (isDraft) { DOC.demos.push(current); isDraft = false; }
    if (!active.has(current.cat)) active.add(current.cat);   /* don't hide what you just saved */

    /* Same courtesy for personas and tags: if the card you just saved
       matches neither, it would vanish the moment the modal closed. */
    if (!matchesPersonas(current)) activePersonas.clear();
    if (!matchesTags(current)) activeTags.clear();

    paintHead();
    setMode(false);
    render();
    saveDoc();
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
    var i = DOC.demos.indexOf(current);
    if (i > -1) DOC.demos.splice(i, 1);
    closeModal();
    render();
    saveDoc();
  });

  $("#addBtn").addEventListener("click", openDraft);

  /* Backdrop closes a view, but never discards an edit by accident. */
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay && !editing) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    /* Topmost thing first: the row menu, then whichever modal is open. */
    if (menuId) { var btn = menuBtn; closeRowMenu(); if (btn) btn.focus(); return; }
    if (saveOpen) { closeSaveModal(); return; }
    if (scriptOpen) { closeScript(); return; }
    if (!current) return;
    if (editing) cancelEdit(); else closeModal();
  });

  /* -------------------------------------------------------
     Editor. execCommand is deprecated but still the only thing
     every browser implements for contenteditable.
  ------------------------------------------------------- */
  try { document.execCommand("styleWithCSS", false, false); } catch (e) {}
  try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}

  var imgInput = $("#imgInput");

  function exec(cmd, val) {
    editor.focus();
    document.execCommand(cmd, false, val || null);
    syncToolbar();
  }

  function insertImageFile(file) {
    if (!file || file.type.indexOf("image/") !== 0) return;
    var reader = new FileReader();
    reader.onload = function () { exec("insertImage", reader.result); };
    reader.readAsDataURL(file);
  }

  function closestTag(node, tag) {
    var el = node && (node.nodeType === 1 ? node : node.parentNode);
    while (el && el !== editor) {
      if (el.tagName === tag) return el;
      el = el.parentNode;
    }
    return null;
  }

  toolbar.addEventListener("click", function (e) {
    var btn = e.target.closest(".fmt-btn");
    if (!btn) return;
    var cmd = btn.dataset.cmd;

    if (cmd === "heading") {
      var inH = !!closestTag(document.getSelection().anchorNode, "H3");
      exec("formatBlock", inH ? "<p>" : "<h3>");
    } else if (cmd === "link") {
      var url = prompt("Link to where?", "https://");
      if (url) exec("createLink", url);
    } else if (cmd === "image") {
      imgInput.value = "";
      imgInput.click();
    } else {
      exec(cmd);
    }
  });

  imgInput.addEventListener("change", function () { insertImageFile(imgInput.files[0]); });

  /* Paste keeps images, drops everything else's styling. */
  editor.addEventListener("paste", function (e) {
    var items = (e.clipboardData || {}).items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image/") === 0) {
        e.preventDefault();
        insertImageFile(items[i].getAsFile());
        return;
      }
    }
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  editor.addEventListener("dragover", function (e) { e.preventDefault(); });
  editor.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files[0];
    if (f && f.type.indexOf("image/") === 0) { e.preventDefault(); insertImageFile(f); }
  });

  function syncToolbar() {
    if (!editing) return;
    [].forEach.call(toolbar.querySelectorAll(".fmt-btn"), function (btn) {
      var cmd = btn.dataset.cmd, on = false;
      if (cmd === "heading") {
        on = !!closestTag(document.getSelection().anchorNode, "H3");
      } else if (cmd === "bold" || cmd === "italic" ||
                 cmd === "insertUnorderedList" || cmd === "insertOrderedList") {
        try { on = document.queryCommandState(cmd); } catch (e) {}
      }
      btn.classList.toggle("on", on);
    });
  }

  document.addEventListener("selectionchange", function () {
    if (editing && editor.contains(document.getSelection().anchorNode)) syncToolbar();
  });
  editor.addEventListener("keyup", syncToolbar);

  /* =========================================================
     Save script modal. The list is already built by the time this
     opens — all it asks for is the name it gets on the Saved
     scripts page.
     ========================================================= */
  var saveOverlay = $("#saveOverlay"), saveOpen = false;
  var sDraftCats = new Set(), sDraftFav = false, sLastFocus = null;
  var sNewCat = $("#sNewCat"), sFav = $("#sFav");

  function syncEditingPill() {
    var s = editingScriptId ? scriptById(editingScriptId) : null;
    var pill = $("#scriptEditing");
    if (!s) { editingScriptId = null; pill.hidden = true; return; }
    pill.hidden = false;
    $("#scriptEditingName").textContent = s.title || "Untitled script";
  }

  $("#scriptDetach").addEventListener("click", function () {
    editingScriptId = null;
    syncEditingPill();
    toast("ok", "Detached \u2014 the next save starts a new script");
  });

  function renderScriptCatPicker() {
    $("#sCats").innerHTML = SDOC.categories.map(function (c) {
      var on = sDraftCats.has(c.id);
      return '<label class="option-row" style="--dot-color:' + esc(c.color) + '">' +
               '<input type="checkbox" data-cat="' + esc(c.id) + '"' + (on ? " checked" : "") + ">" +
               '<span class="dot' + (on ? " on" : "") + '"></span>' +
               '<span class="option-label">' + esc(c.label) + "</span>" +
             "</label>";
    }).join("") ||
    '<p class="hint" style="margin:6px 8px">No categories yet. Add the first one below.</p>';
  }

  $("#sCats").addEventListener("change", function (e) {
    var box = e.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked) sDraftCats.add(box.dataset.cat);
    else sDraftCats.delete(box.dataset.cat);
    var dot = box.parentNode.querySelector(".dot");
    if (dot) dot.classList.toggle("on", box.checked);
  });

  /* A category invented here is committed as soon as it's added, not when the
     script is saved — otherwise cancelling out would take it back with it. */
  function addScriptCategory() {
    var name = sNewCat.value.trim();
    if (!name) { sNewCat.focus(); return; }

    var existing = null;
    SDOC.categories.forEach(function (c) {
      if (c.label.toLowerCase() === name.toLowerCase()) existing = c;
    });

    if (existing) {
      sDraftCats.add(existing.id);
      sNewCat.value = "";
      renderScriptCatPicker();
      toast("ok", existing.label + " is already a category \u2014 ticked it for you");
      sNewCat.focus();
      return;
    }

    var cat = { id: slug(name), label: name, color: colorFor(name) };
    SDOC.categories.push(cat);
    indexScriptCats();
    sDraftCats.add(cat.id);

    sNewCat.value = "";
    renderScriptCatPicker();
    var grid = $("#sCats");
    grid.scrollTop = grid.scrollHeight;
    sNewCat.focus();
    saveScripts();
  }

  $("#sAddCatBtn").addEventListener("click", addScriptCategory);
  sNewCat.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addScriptCategory();
  });

  function setScriptFavSwitch(on) {
    sDraftFav = on;
    sFav.classList.toggle("on", on);
    sFav.setAttribute("aria-checked", on ? "true" : "false");
  }
  sFav.addEventListener("click", function () { setScriptFavSwitch(!sDraftFav); });

  function openSaveModal() {
    if (!script.length) return;

    var s = editingScriptId ? scriptById(editingScriptId) : null;

    $("#saveModalTitle").textContent = s ? "Update script" : "Save script";
    $("#sName").value = s ? (s.title || "") : "";
    $("#sDesc").value = s ? (s.desc || "") : "";
    sDraftCats = new Set(s ? (s.cats || []) : []);
    sNewCat.value = "";
    setScriptFavSwitch(s ? !!s.fav : false);
    renderScriptCatPicker();

    var t = totalMins();
    $("#sSummary").textContent =
      script.length + (script.length === 1 ? " demo" : " demos") +
      (t ? ", approximately " + fmtTime(t) : "") + ".";

    /* Editing one: the primary button updates it, and there's a way out
       to a copy. Not editing: one button, one meaning. */
    $("#sSave").textContent = s ? "Update script" : "Save script";
    $("#sSaveNew").hidden = !s;

    sLastFocus = document.activeElement;
    saveOverlay.classList.add("open");
    saveOpen = true;
    document.body.style.overflow = "hidden";
    $("#sName").focus();
    $("#sName").select();
  }

  function closeSaveModal() {
    saveOverlay.classList.remove("open");
    saveOpen = false;
    document.body.style.overflow = "";
    if (sLastFocus) sLastFocus.focus();
  }

  function commitScript(asNew) {
    var title = $("#sName").value.trim();
    if (!title) {
      toast("error", "A script needs a name");
      $("#sName").focus();
      return;
    }

    var now = new Date().toISOString();
    var rec = (!asNew && editingScriptId) ? scriptById(editingScriptId) : null;
    var isNew = !rec;

    if (isNew) {
      rec = { id: "s" + Date.now().toString(36), created: now };
      SDOC.scripts.push(rec);
    }

    rec.title = title;
    rec.desc = $("#sDesc").value.trim();
    rec.cats = SDOC.categories                        /* keep the file's order, not click order */
      .filter(function (c) { return sDraftCats.has(c.id); })
      .map(function (c) { return c.id; });
    rec.fav = sDraftFav;
    rec.demos = script.slice();
    rec.mins = totalMins();                           /* a snapshot, so the table reads right
                                                         even if a demo goes missing later */
    rec.updated = now;

    editingScriptId = rec.id;
    closeSaveModal();
    syncEditingPill();
    saveScripts();
  }

  $("#saveScriptBtn").addEventListener("click", openSaveModal);
  $("#sSave").addEventListener("click", function () { commitScript(false); });
  $("#sSaveNew").addEventListener("click", function () { commitScript(true); });
  $("#sCancel").addEventListener("click", closeSaveModal);
  saveOverlay.addEventListener("click", function (e) {
    if (e.target === saveOverlay) closeSaveModal();
  });

  /* Enter anywhere in the form saves, the way a one-screen form should. */
  $("#sName").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); commitScript(false); }
  });
  $("#sDesc").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); commitScript(false); }
  });

  /* -------------------------------------------------------
     Opening a saved script. The Scripts page sends its id
     in the URL; the builder fills itself from it and remembers
     which one it's standing in.
  ------------------------------------------------------- */
  function loadScript(id) {
    var s = scriptById(id);
    if (!s) {
      toast("warn", "That script isn\u2019t in " + SCRIPTS_FILE + " any more");
      return;
    }

    var wanted = s.demos || [];
    script = wanted.filter(function (did) { return !!demoById(did); });
    editingScriptId = s.id;

    renderScript();
    syncAddButtons();

    var lost = wanted.length - script.length;
    if (lost) {
      toast("warn", "Opened \u201c" + s.title + "\u201d \u2014 " + lost +
                    (lost === 1 ? " demo has" : " demos have") + " since been deleted");
    } else {
      toast("ok", "Opened \u201c" + s.title + "\u201d");
    }
  }

  /* Same request as the row menu on the Scripts page. */
  function requestedScriptId() {
    var m = /(^|[?&])script=([^&]+)/.exec(location.search);
    return m ? decodeURIComponent(m[2]) : null;
  }

  /* -------------------------------------------------------
     Load the file, then run the first render
  ------------------------------------------------------- */
  fetch(DATA_FILE, { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (doc) {
      DOC = doc;
      DOC.categories = DOC.categories || [];
      DOC.personas = DOC.personas || [];
      DOC.demos = DOC.demos || [];
      indexCats();
      indexPersonas();
      active = new Set(allIds());
      loaded = true;
      render();
      status();

      if (pendingDraft || draftWasRequested()) {
        pendingDraft = false;
        /* Drop the marker so a refresh doesn't reopen the modal. */
        if (history.replaceState) {
          history.replaceState(null, "", location.pathname + location.hash);
        }
        openDraft();
      }

      /* Scripts second. The page is already usable without them — only
         saving and the Scripts hand-off need this file. */
      return fetch(SCRIPTS_FILE, { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (sdoc) {
          SDOC = sdoc;
          SDOC.categories = SDOC.categories || [];
          SDOC.scripts = SDOC.scripts || [];
          indexScriptCats();

          var want = requestedScriptId();
          if (want) {
            if (history.replaceState) {
              history.replaceState(null, "", location.pathname + location.hash);
            }
            loadScript(want);
          }
        })
        .catch(function () {
          /* No file yet is fine — the first save writes one. A script asked
             for by URL can't be opened, though, so say so. */
          SDOC = { version: 1, updated: null, categories: [], scripts: [] };
          indexScriptCats();
          if (requestedScriptId()) toast("warn", "Couldn\u2019t load " + SCRIPTS_FILE);
        });
    })
    .catch(function () {
      loaded = false;
      status();
      $("#addBtn").disabled = true;
      emptyEl.classList.add("show");
      emptyEl.querySelector("strong").textContent = "Couldn\u2019t load " + DATA_FILE;
      emptyEl.querySelector("span").textContent =
        "Keep it in the same folder as this page, and open the page through a server rather than as a file.";
    });
})();
