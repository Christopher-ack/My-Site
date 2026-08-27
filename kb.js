/* =========================================================
   KNOWLEDGE BASE

   One file feeds this page:

     kb-data.json   folders and pages. A page holds its title,
                    its folder, and its write-up as HTML.

   Three panes, left to right: folders, the pages in the chosen
   folder, and the page itself. A page opens in view mode and
   only becomes editable when asked.

   Two ideas do most of the work here:

   Pages link to pages. Type @ (or [[) while editing, pick a page
   from the list, and a link lands in the text. The link stores the
   page's id, never its title, so renaming a page fixes every link
   to it instead of breaking them. "Linked from" at the foot of a
   page is read back out of the other pages, so it can't drift.

   Everything has an address. Folders and pages are hash routes,
   so a link can point at one page rather than at this pane.

   Saving works the way the Demos and Links pages do: PUT the whole
   file back. A plain static host will refuse that, so the page keeps
   your edits for the session and hands you the updated file to swap
   in whenever you're done.
   ========================================================= */
(function () {
  var DATA_FILE = "kb-data.json";
  var $ = function (s) { return document.querySelector(s); };

  var DOC = { version: 1, updated: null, folders: [], pages: [] };
  var folderById_ = {};
  var pageById_ = {};
  var unsaved = 0;              /* edits made since the file last accepted a write */
  var loaded = false;

  /* What's on screen. current is the page object itself, not an id, so a
     rename can't strand it. */
  var current = null;
  var editing = false;
  var isDraft = false;          /* a new page, still discardable */
  var state = { folder: null, query: "" };

  /* -------------------------------------------------------
     Helpers
  ------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function index() {
    folderById_ = {};
    pageById_ = {};
    /* Folders read alphabetically everywhere — the rail, the file
       picker, and whichever one opens by default. Sorting here rather
       than at each render means a folder added or renamed lands in the
       right place straight away, and the saved file stays tidy too. */
    DOC.folders.sort(function (a, b) {
      return String(a.label).localeCompare(String(b.label), undefined,
        { sensitivity: "base", numeric: true });
    });
    DOC.folders.forEach(function (f) { folderById_[f.id] = f; });
    DOC.pages.forEach(function (p) { pageById_[p.id] = p; });
  }
  function folderById(id) { return folderById_[id] || null; }
  function pageById(id) { return pageById_[id] || null; }
  function folderOf(p) {
    return (p && folderById(p.folder)) ||
           { id: "", label: "No folder", color: "#94a3b8" };
  }
  function pagesIn(folderId) {
    return DOC.pages.filter(function (p) { return p.folder === folderId; });
  }

  /* A folder invented in the rail still needs a colour. Hash the name so
     the same word always lands on the same hue. */
  function colorFor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return "hsl(" + (Math.abs(hash) % 360) + ", 70%, 60%)";
  }
  function slug(name, taken) {
    var base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder";
    var id = "f-" + base, n = 2;
    while (taken(id)) id = "f-" + base + "-" + n++;
    return id;
  }

  /* Yesterday reads better as "Yesterday" than as a date. Anything
     older is a date, because that's what you'd actually look for. */
  function fmtWhen(iso) {
    if (!iso) return "\u2014";
    var d = new Date(iso);
    if (isNaN(d)) return "\u2014";
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return days + " days ago";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  /* HTML in, readable text out — for snippets, search and word counts. */
  var scratch = document.createElement("div");
  function textOf(html) {
    scratch.innerHTML = html || "";
    return (scratch.textContent || "").replace(/\s+/g, " ").trim();
  }

  /* ---- Routes ---- */
  function folderUrl(id) { return "#/f/" + encodeURIComponent(id); }
  function pageUrl(id) { return "#/p/" + encodeURIComponent(id); }
  function editUrl(id) { return pageUrl(id) + "/edit"; }
  function absUrl(hash) { return location.href.split("#")[0].split("?")[0] + hash; }

  var ICON_KEBAB =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">' +
    '<circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/>' +
    '<circle cx="12" cy="19" r="1.8"/></svg>';

  /* Same handle as the task board and the script builder, so the
     gesture reads the same everywhere on the site. */
  var ICON_GRIP =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">' +
    '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/>' +
    '<circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/>' +
    '<circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';

  /* One triangle, rotated by CSS when the branch is open. */
  var ICON_TWISTY =
    '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">' +
    '<path d="M9 5l8 7-8 7z"/></svg>';

  /* Indent tucks the page under the one above; promote lifts it back
     out. The arrows point the way the row will move. */
  var ICON_INDENT =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 5h16M10 12h10M10 19h10"/><path d="M4 9v6l4-3z" fill="currentColor" stroke="none"/></svg>';

  var ICON_PROMOTE =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 5h16M4 12h10M4 19h10"/><path d="M20 9v6l-4-3z" fill="currentColor" stroke="none"/></svg>';

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
  function confirmWrite(stamp) {
    return fetch(DATA_FILE, { cache: "no-store" })
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
      return confirmWrite(stamp);
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
     Elements
  ------------------------------------------------------- */
  var folderList = $("#folderList"), pageList = $("#pageList"), pagesHead = $("#pagesHead");
  var countEl = $("#count");
  var folderRow = $("#newFolderRow"), folderInput = $("#newFolderName");
  var docHead = $("#docHead"), docBlank = $("#docBlank"), docScroll = $("#docScroll");
  var docTitle = $("#docTitle"), titleInput = $("#titleInput"), docMeta = $("#docMeta");
  var crumb = $("#crumb"), moveRow = $("#moveRow"), folderSelect = $("#fFolder");
  var viewer = $("#viewer"), editor = $("#editor"), toolbar = $("#toolbar");
  var editBtn = $("#editBtn"), saveBtn = $("#saveBtn"), cancelBtn = $("#cancelBtn");
  var backlinksEl = $("#backlinks"), backlinkList = $("#backlinkList");

  /* -------------------------------------------------------
     Rail one: folders
  ------------------------------------------------------- */
  function renderFolders() {
    if (!DOC.folders.length) {
      folderList.innerHTML =
        '<p class="kb-rail-empty">No folders yet. Add one to start filing pages.</p>';
      return;
    }

    folderList.innerHTML = DOC.folders.map(function (f) {
      var n = pagesIn(f.id).length;
      var on = !state.query && f.id === state.folder;
      return '<div class="kb-row' + (on ? " on" : "") + '">' +
               '<a class="kb-row-link" href="' + esc(folderUrl(f.id)) + '">' +
                 '<span class="kb-dot" style="--dot-color:' + esc(f.color) + '"></span>' +
                 '<span class="kb-row-body"><span class="kb-row-name">' +
                   esc(f.label) + "</span></span>" +
                 '<span class="kb-row-count">' + n + "</span>" +
               "</a>" +
               '<button class="icon-btn kb-row-menu" type="button" data-folder="' + esc(f.id) + '" ' +
                 'aria-haspopup="true" aria-expanded="false" aria-label="Folder actions">' + ICON_KEBAB +
               "</button>" +
             "</div>";
    }).join("");
  }

  /* -------------------------------------------------------
     Rail two: pages

     With a search term this reads every folder, because a name you
     only half-remember isn't filed anywhere in particular.
  ------------------------------------------------------- */
  function pagesShown() {
    var q = state.query.trim().toLowerCase();

    if (q) {
      return DOC.pages.filter(function (p) {
        var hay = [p.title, folderOf(p).label, textOf(p.body)].join(" ").toLowerCase();
        return hay.indexOf(q) > -1;
      }).sort(byTitle);
    }
    return pagesIn(state.folder).sort(byTitle);
  }

  function byTitle(a, b) {
    return String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
  }

  /* -------------------------------------------------------
     The page tree

     A page stores one extra field: parent, the id of the page it sits
     under, or null at the top. Nothing stores an explicit position —
     sibling order is the order the pages happen to sit in DOC.pages,
     read back through a filter. That falls out nicely: moving a parent
     never has to move its children, because a child's place among its
     own siblings hasn't changed. Only the one row being moved is ever
     spliced.

     Bad data is treated as flat rather than fatal. A parent that has
     been deleted, moved to another folder, or wired into a loop makes
     the child a top-level page instead of hiding it.
  ------------------------------------------------------- */
  var collapsed = {};           /* pageId -> true. Session only, not saved. */

  function rawParent(p) { return (p && p.parent) || null; }

  function parentOf(p) {
    var pid = rawParent(p);
    if (!pid) return null;
    var par = pageById(pid);
    if (!par || par.folder !== p.folder) return null;   /* gone, or filed elsewhere */

    /* Walk up. Meeting p again means a loop, so treat p as top-level. */
    var seen = {}, hop = par, guard = 0;
    while (hop && guard++ < 200) {
      if (hop.id === p.id || seen[hop.id]) return null;
      seen[hop.id] = true;
      hop = pageById(rawParent(hop));
    }
    return par;
  }

  function parentIdOf(p) { var par = parentOf(p); return par ? par.id : null; }

  /* Children of one page, or of the folder itself when parentId is null,
     in the order DOC.pages holds them. */
  function childrenOf(parentId, folderId) {
    return DOC.pages.filter(function (p) {
      return p.folder === folderId && parentIdOf(p) === parentId;
    });
  }

  function siblingsOf(p) { return childrenOf(parentIdOf(p), p.folder); }

  function depthOf(p) {
    var d = 0, hop = parentOf(p), guard = 0;
    while (hop && guard++ < 200) { d++; hop = parentOf(hop); }
    return d;
  }

  /* Every page under p, at any depth, parents before children. */
  function descendantsOf(p) {
    var out = [];
    (function walk(id) {
      childrenOf(id, p.folder).forEach(function (kid) { out.push(kid); walk(kid.id); });
    })(p.id);
    return out;
  }

  /* ---- Moving a page inside DOC.pages ----
     Sibling order is array order, so a move is a splice. A page travels
     with its subtree as one block: nesting would still read correctly
     without that, since the tree is built from parent ids rather than
     from adjacency, but keeping the array in tree order means the saved
     file reads top to bottom the way the rail does, and a page promoted
     out of a deleted parent simply stays where it already was. */
  function blockOf(p) { return [p].concat(descendantsOf(p)); }

  function pullBlock(p) {
    var block = blockOf(p);           /* read before anything moves */
    block.forEach(function (b) {
      var i = DOC.pages.indexOf(b);
      if (i > -1) DOC.pages.splice(i, 1);
    });
    return block;
  }

  function spliceIn(at, block) {
    DOC.pages.splice.apply(DOC.pages, [at, 0].concat(block));
  }

  function putBefore(p, ref) {
    var block = pullBlock(p);
    var i = DOC.pages.indexOf(ref);
    spliceIn(i < 0 ? DOC.pages.length : i, block);
  }

  /* After ref and everything beneath it, so a promoted page lands below
     the whole subtree it came out of rather than in the middle of it. */
  function putAfterSubtree(p, ref) {
    var block = pullBlock(p);         /* out first, so ref's subtree excludes it */
    var last = -1;
    blockOf(ref).forEach(function (b) {
      var i = DOC.pages.indexOf(b);
      if (i > last) last = i;
    });
    spliceIn(last < 0 ? DOC.pages.length : last + 1, block);
  }

  /* The visible list, flattened depth-first. Collapsed branches stop the
     walk, so what this returns is exactly what the rail draws. */
  function pageTree(folderId) {
    var out = [];
    (function walk(parentId, depth) {
      childrenOf(parentId, folderId).forEach(function (p) {
        var kids = childrenOf(p.id, folderId);
        out.push({ page: p, depth: depth, kids: kids.length });
        if (kids.length && !collapsed[p.id]) walk(p.id, depth + 1);
      });
    })(null, 0);
    return out;
  }

  /* Open every ancestor of a page, so arriving by link or by search
     never lands on a row that isn't drawn. */
  function revealPage(p) {
    var hop = parentOf(p), guard = 0;
    while (hop && guard++ < 200) { delete collapsed[hop.id]; hop = parentOf(hop); }
  }

  var flatRows = [];            /* what's drawn, in order — the drag code reads this */

  function renderPages() {
    var searching = !!state.query.trim();

    /* Search flattens on purpose: a half-remembered name isn't filed
       anywhere in particular, so hierarchy would only get in the way. */
    var rows = searching
      ? pagesShown().map(function (p) { return { page: p, depth: 0, kids: 0 }; })
      : pageTree(state.folder);

    flatRows = searching ? [] : rows;

    pagesHead.textContent = searching
      ? rows.length + (rows.length === 1 ? " match" : " matches")
      : "Pages";

    if (!rows.length) {
      pageList.innerHTML = '<p class="kb-rail-empty">' + (
        searching ? "No page says that. Try fewer words."
        : DOC.folders.length ? "Nothing in this folder yet. The + above starts a page."
        : "Add a folder first, then a page can go in it."
      ) + "</p>";
      return;
    }

    pageList.innerHTML = rows.map(function (row, i) {
      var p = row.page;
      var on = current && p.id === current.id;
      /* Searching across folders, the folder is the useful second line.
         Inside one folder, the first words of the page are. */
      var sub = searching ? folderOf(p).label : (textOf(p.body).slice(0, 70) || "Empty page");

      /* Indent is only offered when there is a row above to go under,
         and that row has to be a sibling — you can't leapfrog a level. */
      var prev = i > 0 ? rows[i - 1] : null;
      var canIndent = !searching && !!prev && prev.depth >= row.depth;
      var canPromote = !searching && row.depth > 0;

      var twisty = row.kids
        ? '<button class="kb-twisty' + (collapsed[p.id] ? "" : " open") + '" type="button" ' +
            'data-twisty="' + esc(p.id) + '" tabindex="-1" ' +
            'aria-label="' + (collapsed[p.id] ? "Expand" : "Collapse") + " " +
            esc(p.title || "Untitled page") + '">' + ICON_TWISTY + "</button>"
        : '<span class="kb-twisty-gap"></span>';

      return '<div class="kb-row kb-page-row' + (on ? " on" : "") + '" ' +
               'data-id="' + esc(p.id) + '" data-depth="' + row.depth + '" ' +
               'style="--depth:' + row.depth + '">' +
               (searching ? "" :
                 '<button class="kb-grip" type="button" data-grip="' + esc(p.id) + '" ' +
                   'aria-label="Reorder ' + esc(p.title || "Untitled page") +
                   '. Arrow keys move it, left and right change its level.">' +
                   ICON_GRIP + "</button>") +
               twisty +
               '<a class="kb-row-link" href="' + esc(pageUrl(p.id)) + '">' +
                 '<span class="kb-row-body">' +
                   '<span class="kb-row-name">' + esc(p.title || "Untitled page") + "</span>" +
                   '<span class="kb-row-sub">' + esc(sub) + "</span>" +
                 "</span>" +
               "</a>" +
               '<span class="kb-row-tools">' +
                 (canPromote
                   ? '<button class="icon-btn kb-nest-btn" type="button" data-promote="' + esc(p.id) + '" ' +
                       'tabindex="-1" title="Promote out of ' +
                       esc((parentOf(p) || {}).title || "the page above") +
                       '" aria-label="Promote this page one level">' + ICON_PROMOTE + "</button>"
                   : "") +
                 (canIndent
                   ? '<button class="icon-btn kb-nest-btn" type="button" data-indent="' + esc(p.id) + '" ' +
                       'tabindex="-1" title="Make a child of ' +
                       esc(prev.page.title || "the page above") +
                       '" aria-label="Make this a child of the page above">' + ICON_INDENT + "</button>"
                   : "") +
               "</span>" +
             "</div>";
    }).join("");
  }

  function renderRails() { renderFolders(); renderPages(); renderCount(); }

  /* -------------------------------------------------------
     Nesting: indent and promote

     Indent makes a page a child of the row above it. Promote lifts it
     back out to sit beside its old parent. Both only ever move the one
     page — its own children ride along.
  ------------------------------------------------------- */
  function indentPage(p) {
    var sibs = siblingsOf(p);
    var at = sibs.indexOf(p);
    if (at < 1) {
      toast("warn", "Nothing above it at this level to go under");
      return;
    }
    var newParent = sibs[at - 1];

    p.parent = newParent.id;
    delete collapsed[newParent.id];        /* show what just went inside */

    /* Last child of its new parent. */
    var kids = childrenOf(newParent.id, p.folder).filter(function (k) { return k !== p; });
    putAfterSubtree(p, kids.length ? kids[kids.length - 1] : newParent);

    afterNestChange(p);
  }

  function promotePage(p) {
    var oldParent = parentOf(p);
    if (!oldParent) return;

    p.parent = rawParent(oldParent) ? parentIdOf(oldParent) : null;
    if (!p.parent) delete p.parent;

    /* Straight below the subtree it came out of. */
    putAfterSubtree(p, oldParent);
    afterNestChange(p);
  }

  function afterNestChange(p) {
    index();
    renderRails();
    if (current && current.id === p.id) paintDoc();   /* the crumb shows the trail */
    saveDoc();
  }

  pageList.addEventListener("click", function (e) {
    var t = e.target.closest("[data-indent],[data-promote],[data-twisty]");
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();

    if (t.dataset.twisty) {
      var id = t.dataset.twisty;
      if (collapsed[id]) delete collapsed[id]; else collapsed[id] = true;
      renderPages();
      return;
    }
    var p = pageById(t.dataset.indent || t.dataset.promote);
    if (!p) return;
    if (t.dataset.indent) indentPage(p); else promotePage(p);
  });

  /* -------------------------------------------------------
     Reordering by drag

     Drag changes order, the buttons change level. Keeping those apart
     means a drag can't silently re-parent a page: the only landing
     spots offered are the gaps between its own siblings.

     The demos script builder shuffles rows in the DOM as you drag. That
     won't do here, because a row can have a subtree under it that would
     have to move too. So this draws an insertion line instead and does
     the move once, on drop.
  ------------------------------------------------------- */
  var pdrag = null;
  var dropLine = null;
  var suppressRowClick = false;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  /* Where the dragged page could go: one gap per sibling boundary. Each
     gap remembers the y to draw the line at and the sibling index the
     page would take. */
  function dropGaps(p) {
    var sibs = siblingsOf(p).filter(function (s) { return s !== p; });
    if (!sibs.length) return [];

    var gaps = [];
    sibs.forEach(function (s, k) {
      var row = pageList.querySelector('.kb-page-row[data-id="' + s.id + '"]');
      if (!row) return;
      var box = row.getBoundingClientRect();
      if (k === 0) gaps.push({ index: 0, y: box.top, depth: depthOf(s) });

      /* The gap after a sibling sits below everything nested under it. */
      var last = row;
      var kids = descendantsOf(s);
      kids.forEach(function (kid) {
        var kr = pageList.querySelector('.kb-page-row[data-id="' + kid.id + '"]');
        if (kr && kr.getBoundingClientRect().bottom > last.getBoundingClientRect().bottom) last = kr;
      });
      gaps.push({ index: k + 1, y: last.getBoundingClientRect().bottom, depth: depthOf(s) });
    });
    return gaps;
  }

  function showDropLine(gap) {
    if (!dropLine) {
      dropLine = document.createElement("div");
      dropLine.className = "kb-drop-line";
      document.body.appendChild(dropLine);
    }
    var box = pageList.getBoundingClientRect();
    var inset = 10 + gap.depth * 16;
    dropLine.style.left = (box.left + inset) + "px";
    dropLine.style.width = Math.max(24, box.width - inset - 10) + "px";
    dropLine.style.top = gap.y + "px";
  }

  function hideDropLine() {
    if (dropLine) { dropLine.remove(); dropLine = null; }
  }

  pageList.addEventListener("pointerdown", function (e) {
    if (e.button != null && e.button !== 0) return;
    if (state.query.trim()) return;              /* search view has no order to change */

    var grip = e.target.closest(".kb-grip");
    var row = e.target.closest(".kb-page-row");
    if (!row) return;

    /* Without a mouse only the grip drags, or the rail couldn't scroll. */
    if (!grip && !finePointer.matches) return;
    if (!grip && e.target.closest(".kb-row-tools, .kb-twisty")) return;
    if (grip) e.preventDefault();

    var p = pageById(row.dataset.id);
    if (!p) return;

    var rect = row.getBoundingClientRect();
    pdrag = {
      page: p, row: row,
      x0: e.clientX, y0: e.clientY,
      ox: e.clientX - rect.left, oy: e.clientY - rect.top,
      w: rect.width, h: rect.height,
      gaps: null, at: null, moved: false, ghost: null
    };
  });

  function startPageDrag() {
    pdrag.moved = true;
    closeMenus();

    /* A parent drags as one thing, so the ghost says how much is coming. */
    var kids = descendantsOf(pdrag.page).length;
    var ghost = pdrag.row.cloneNode(true);
    ghost.classList.add("kb-row-ghost");
    ghost.style.width = pdrag.w + "px";
    if (kids) {
      var badge = document.createElement("span");
      badge.className = "kb-ghost-count";
      badge.textContent = "+" + kids;
      ghost.appendChild(badge);
    }
    document.body.appendChild(ghost);

    pdrag.ghost = ghost;
    pdrag.gaps = dropGaps(pdrag.page);
    pdrag.row.classList.add("dragging");
    document.body.classList.add("dragging-page");

    /* Nothing to reorder against: let the drag run, just show no line. */
    if (!pdrag.gaps.length) toast("ok", "Nothing beside it to reorder against");
  }

  document.addEventListener("pointermove", function (e) {
    if (!pdrag) return;
    if (!pdrag.moved) {
      if (Math.abs(e.clientX - pdrag.x0) + Math.abs(e.clientY - pdrag.y0) < 6) return;
      startPageDrag();
    }
    if (e.cancelable) e.preventDefault();

    pdrag.ghost.style.left = (e.clientX - pdrag.ox) + "px";
    pdrag.ghost.style.top = (e.clientY - pdrag.oy) + "px";

    if (!pdrag.gaps.length) return;

    /* Nearest gap wins — simpler to aim at than a hit box per row. */
    var best = null;
    pdrag.gaps.forEach(function (g) {
      var d = Math.abs(g.y - e.clientY);
      if (!best || d < best.d) best = { d: d, gap: g };
    });
    pdrag.at = best.gap;
    showDropLine(best.gap);
  }, { passive: false });

  function endPageDrag(commit) {
    if (!pdrag) return;
    var d = pdrag;
    pdrag = null;

    if (!d.moved) return;

    if (d.ghost) d.ghost.remove();
    hideDropLine();
    d.row.classList.remove("dragging");
    document.body.classList.remove("dragging-page");
    suppressRowClick = true;                 /* a drag is never also a click */

    if (!commit || !d.at) { renderPages(); return; }

    var sibs = siblingsOf(d.page).filter(function (s) { return s !== d.page; });
    var k = d.at.index;
    if (k >= sibs.length) putAfterSubtree(d.page, sibs[sibs.length - 1]);
    else putBefore(d.page, sibs[k]);

    index();
    renderPages();
    saveDoc();

    var moved = pageList.querySelector('.kb-grip[data-grip="' + d.page.id + '"]');
    if (moved) moved.focus();
  }

  document.addEventListener("pointerup", function () { endPageDrag(true); });
  document.addEventListener("pointercancel", function () { endPageDrag(false); });
  document.addEventListener("click", function () { suppressRowClick = false; }, true);

  /* A click that finished a drag shouldn't also follow the link. */
  pageList.addEventListener("click", function (e) {
    if (suppressRowClick && e.target.closest(".kb-row-link")) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  /* Keyboard: the grip is focusable, so the whole gesture is reachable
     without a pointer. Up and down reorder, left and right change level. */
  pageList.addEventListener("keydown", function (e) {
    var grip = e.target.closest(".kb-grip");
    if (!grip) return;

    var p = pageById(grip.dataset.grip);
    if (!p) return;

    var step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (step) {
      e.preventDefault();
      var sibs = siblingsOf(p);
      var at = sibs.indexOf(p), to = at + step;
      if (to < 0 || to >= sibs.length) return;
      if (step > 0) putAfterSubtree(p, sibs[to]);
      else putBefore(p, sibs[to]);
      index();
      renderPages();
      saveDoc();
      var again = pageList.querySelector('.kb-grip[data-grip="' + p.id + '"]');
      if (again) again.focus();
      return;
    }

    if (e.key === "ArrowRight") { e.preventDefault(); indentPage(p); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); promotePage(p); }
    else return;

    var back = pageList.querySelector('.kb-grip[data-grip="' + p.id + '"]');
    if (back) back.focus();
  });

  /* The whole file in one line, so the head bar says something the rails
     can't: how much is in here altogether. */
  function renderCount() {
    var p = DOC.pages.length, f = DOC.folders.length;
    countEl.textContent = p + (p === 1 ? " page" : " pages") +
                          " \u00b7 " + f + (f === 1 ? " folder" : " folders");
  }

  $("#search").addEventListener("input", function () {
    state.query = this.value;
    renderPages();
    renderFolders();       /* the selected folder stops being the subject */
  });

  /* -------------------------------------------------------
     The page: view and edit are the same pane, one switch apart
  ------------------------------------------------------- */
  function wordCount(html) {
    var t = textOf(html);
    return t ? t.split(/\s+/).length : 0;
  }

  function paintDoc() {
    if (!current) {
      docHead.hidden = true;
      docScroll.hidden = true;
      toolbar.hidden = true;
      docBlank.hidden = false;
      return;
    }

    docHead.hidden = false;
    docScroll.hidden = false;
    docBlank.hidden = true;

    var f = folderOf(current);
    crumb.innerHTML = '<span class="kb-dot" style="--dot-color:' + esc(f.color) + '"></span>' +
                      "<span>" + esc(f.label) + "</span>";

    docTitle.textContent = current.title || "Untitled page";
    docTitle.hidden = editing;
    titleInput.hidden = !editing;
    toolbar.hidden = !editing;
    moveRow.hidden = !editing;
    viewer.hidden = editing;
    editor.hidden = !editing;
    editBtn.hidden = editing;
    saveBtn.hidden = !editing;
    cancelBtn.hidden = !editing;

    var words = wordCount(editing ? current.body : current.body);
    docMeta.textContent = isDraft
      ? "New page \u2014 not saved yet"
      : (words ? words + (words === 1 ? " word \u00b7 " : " words \u00b7 ") : "") +
        "updated " + fmtWhen(current.updated || current.created);

    if (editing) {
      titleInput.value = current.title || "";
      editor.innerHTML = current.body || "";
      hydrateLinks(editor);
      renderFolderSelect();
      backlinksEl.hidden = true;
      syncToolbar();
    } else {
      var body = (current.body || "").trim();
      viewer.innerHTML = body ||
        '<p class="doc-empty">Nothing written yet. Press Edit to start.</p>';
      hydrateLinks(viewer);
      renderBacklinks();
    }

    docScroll.scrollTop = 0;
  }

  function renderFolderSelect() {
    folderSelect.innerHTML = DOC.folders.map(function (f) {
      return '<option value="' + esc(f.id) + '"' +
             (f.id === current.folder ? " selected" : "") + ">" + esc(f.label) + "</option>";
    }).join("");
  }

  /* A page link stores an id and the title it had when it was made. The id
     is the truth, so on the way to the screen the text is refreshed from
     the page itself — rename a page and every link to it follows. */
  function hydrateLinks(root) {
    [].forEach.call(root.querySelectorAll("a.page-link[data-page]"), function (a) {
      var p = pageById(a.getAttribute("data-page"));
      if (p) {
        a.textContent = p.title || "Untitled page";
        a.setAttribute("href", pageUrl(p.id));
        a.classList.remove("is-missing");
        a.title = "Open " + (p.title || "this page");
        return;
      }
      /* The page is gone. Say so, and stop pretending to be a link. */
      a.classList.add("is-missing");
      a.removeAttribute("href");
      a.title = "This page has been deleted";
    });

    /* Ordinary web links leave the site, so they open in their own tab. */
    [].forEach.call(root.querySelectorAll('a[href^="http"]'), function (a) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });
  }

  /* Read the links back out of every other page. Nothing is stored, so
     this can't disagree with the links themselves. */
  function backlinksOf(id) {
    var re = new RegExp('data-page="' + reEsc(id) + '"');
    return DOC.pages.filter(function (p) {
      return p.id !== id && re.test(p.body || "");
    }).sort(byTitle);
  }

  function renderBacklinks() {
    var list = backlinksOf(current.id);
    backlinksEl.hidden = list.length === 0;
    backlinkList.innerHTML = list.map(function (p) {
      var f = folderOf(p);
      return '<a class="kb-backlink" href="' + esc(pageUrl(p.id)) + '">' +
               '<span class="kb-dot" style="--dot-color:' + esc(f.color) + '"></span>' +
               esc(p.title || "Untitled page") +
             "</a>";
    }).join("");
  }

  /* ---- Unsaved work ---- */
  function draftIsEmpty() {
    return !titleInput.value.trim() && !textOf(editor.innerHTML);
  }
  function dirty() {
    if (!editing || !current) return false;
    if (isDraft) return !draftIsEmpty();
    return titleInput.value.trim() !== (current.title || "") ||
           editor.innerHTML !== (current.body || "") ||
           folderSelect.value !== current.folder;
  }
  function dropDraft() {
    var i = DOC.pages.indexOf(current);
    if (i > -1) DOC.pages.splice(i, 1);
    index();
    current = null;
    editing = false;
    isDraft = false;
  }

  /* ---- Buttons ---- */
  editBtn.addEventListener("click", function () {
    if (current) navigate(editUrl(current.id));
  });

  cancelBtn.addEventListener("click", function () {
    if (!current) return;
    if (isDraft) {
      var folder = current.folder;
      dropDraft();
      renderRails();
      replaceHash(folderUrl(folder));
      return;
    }
    /* Nothing to undo: the record was never touched, so leaving edit
       mode is enough — paintDoc redraws from the record. */
    editing = false;
    paintDoc();
    replaceHash(pageUrl(current.id));
  });

  saveBtn.addEventListener("click", function () {
    if (!current) return;

    var movedFolder = folderSelect.value && folderSelect.value !== current.folder
      ? folderSelect.value : null;

    current.title = titleInput.value.trim() || "Untitled page";
    current.body = editor.innerHTML;
    current.updated = new Date().toISOString();

    if (movedFolder) {
      /* Refiling a page takes everything under it — leaving children
         behind would break the tree they were part of. The page itself
         lands at the top level of its new folder, since its old parent
         isn't there. */
      var moving = descendantsOf(current);
      current.folder = movedFolder;
      delete current.parent;
      moving.forEach(function (kid) { kid.folder = movedFolder; });
      if (moving.length) {
        toast("ok", moving.length === 1
          ? "Its child came along"
          : "Its " + moving.length + " children came along");
      }
    }

    var wasDraft = isDraft;
    isDraft = false;
    editing = false;
    index();

    state.folder = current.folder;      /* don't file it out of sight */
    state.query = "";
    $("#search").value = "";

    paintDoc();
    renderRails();
    replaceHash(pageUrl(current.id));
    saveDoc();
    if (wasDraft) toast("pending", "Saving the new page\u2026");
  });

  titleInput.addEventListener("input", function () {
    docTitle.textContent = this.value || "Untitled page";
  });
  titleInput.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    editor.focus();
  });

  /* -------------------------------------------------------
     New page, new folder
  ------------------------------------------------------- */
  function newPage() {
    if (!DOC.folders.length) {
      toast("warn", "Add a folder first \u2014 a page has to live somewhere");
      openFolderInput("new");
      return;
    }
    var folder = state.folder || DOC.folders[0].id;
    var now = new Date().toISOString();
    var p = {
      id: "p" + Date.now().toString(36),
      folder: folder,
      title: "",
      body: "",
      created: now,
      updated: now
    };
    /* New pages start at the top level; nesting is a deliberate act. */
    /* It joins the list straight away so the rail shows what you're
       working on. Cancel takes it back out; only Save writes the file. */
    DOC.pages.push(p);
    index();
    current = p;
    isDraft = true;
    editing = true;
    state.folder = folder;
    state.query = "";
    $("#search").value = "";

    paintDoc();
    renderRails();
    replaceHash(editUrl(p.id));
    titleInput.focus();
  }

  $("#newPageBtn").addEventListener("click", newPage);

  /* The nav's New → Page calls this. If the file hasn't landed yet the
     request waits for it rather than opening onto nothing. */
  var pendingDraft = false;
  window.KbPage = {
    openDraft: function () {
      if (loaded) newPage(); else pendingDraft = true;
    }
  };
  function draftWasRequested() {
    return /(^|[?&])new=page(&|$)/.test(location.search);
  }

  /* One input, two jobs: naming a new folder and renaming an old one. */
  function openFolderInput(mode, id) {
    folderRow.hidden = false;
    folderInput.dataset.mode = mode;
    folderInput.dataset.id = id || "";
    folderInput.value = mode === "rename" ? ((folderById(id) || {}).label || "") : "";
    folderInput.placeholder = mode === "rename" ? "New name\u2026" : "Folder name\u2026";
    folderInput.focus();
    folderInput.select();
  }
  function closeFolderInput() {
    folderRow.hidden = true;
    folderInput.value = "";
    folderInput.dataset.mode = "";
    folderInput.dataset.id = "";
  }

  function commitFolderInput() {
    var name = folderInput.value.trim();
    var mode = folderInput.dataset.mode, id = folderInput.dataset.id;
    if (!name) { closeFolderInput(); return; }

    if (mode === "rename") {
      var f = folderById(id);
      closeFolderInput();
      if (!f || f.label === name) return;
      f.label = name;
      index();                            /* a new name means a new place in the list */
      renderRails();
      if (current) paintDoc();          /* the crumb says the folder name */
      saveDoc();
      return;
    }

    var clash = null;
    DOC.folders.forEach(function (f2) {
      if (f2.label.toLowerCase() === name.toLowerCase()) clash = f2;
    });
    closeFolderInput();
    if (clash) {
      navigate(folderUrl(clash.id));
      toast("ok", clash.label + " already exists \u2014 opened it instead");
      return;
    }

    var folder = {
      id: slug(name, function (candidate) { return !!folderById(candidate); }),
      label: name,
      color: colorFor(name)
    };
    DOC.folders.push(folder);
    index();
    renderRails();
    navigate(folderUrl(folder.id));
    saveDoc();
  }

  $("#newFolderBtn").addEventListener("click", function () {
    if (!folderRow.hidden && folderInput.dataset.mode === "new") { closeFolderInput(); return; }
    openFolderInput("new");
  });

  folderInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); commitFolderInput(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFolderInput(); }
  });
  /* Clicking away with something typed means it, so keep it. */
  folderInput.addEventListener("blur", function () {
    if (!folderRow.hidden) commitFolderInput();
  });

  /* -------------------------------------------------------
     Menus. One panel each, positioned per row.
  ------------------------------------------------------- */
  var pageMenu = $("#pageMenu"), folderMenu = $("#folderMenu");
  var openMenu = null, menuBtn = null, menuTarget = null;
  var armTimer = null;

  function placeMenu(panel, btn) {
    var rect = btn.getBoundingClientRect();
    var below = rect.bottom + 6;
    if (below + panel.offsetHeight > window.innerHeight - 8) {
      below = Math.max(8, rect.top - 6 - panel.offsetHeight);
    }
    panel.style.top = below + "px";
    panel.style.left = "auto";
    panel.style.right = Math.max(8, window.innerWidth - rect.right) + "px";
  }

  function showMenu(panel, btn, target) {
    closeMenus();
    openMenu = panel;
    menuBtn = btn;
    menuTarget = target;
    panel.classList.add("open");
    btn.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    placeMenu(panel, btn);
  }

  function closeMenus() {
    clearTimeout(armTimer);
    if (openMenu) {
      var item = openMenu.querySelector(".menu-item-danger");
      if (item) { item.classList.remove("armed"); item.textContent = item.dataset.label; }
      openMenu.classList.remove("open");
    }
    if (menuBtn) {
      menuBtn.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    }
    openMenu = null; menuBtn = null; menuTarget = null;
  }

  /* Remember the resting label so arming can put it back. */
  [].forEach.call(document.querySelectorAll(".menu-item-danger"), function (el) {
    el.dataset.label = el.textContent;
  });

  /* Delete asks once, in place — no dialog stacked on a menu. */
  function armed(item) {
    if (item.classList.contains("armed")) return true;
    item.classList.add("armed");
    item.textContent = "Delete for good?";
    armTimer = setTimeout(function () {
      item.classList.remove("armed");
      item.textContent = item.dataset.label;
    }, 4000);
    return false;
  }

  $("#pageMenuBtn").addEventListener("click", function (e) {
    if (!current) return;
    e.stopPropagation();
    if (openMenu === pageMenu) closeMenus();
    else showMenu(pageMenu, this, current.id);
  });

  folderList.addEventListener("click", function (e) {
    var btn = e.target.closest(".kb-row-menu");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (openMenu === folderMenu && menuTarget === btn.dataset.folder) closeMenus();
    else showMenu(folderMenu, btn, btn.dataset.folder);
  });

  pageMenu.addEventListener("click", function (e) {
    var item = e.target.closest(".menu-item");
    if (!item) return;
    var act = item.dataset.act, p = pageById(menuTarget);
    if (!p) { closeMenus(); return; }

    if (act === "delete") {
      e.stopPropagation();
      if (!armed(item)) return;

      /* Deleting a parent must not take its children with it, and must
         not strand them either. They move up to where their parent was. */
      var orphans = childrenOf(p.id, p.folder);
      var grandparent = rawParent(p) ? parentIdOf(p) : null;
      orphans.forEach(function (kid) {
        if (grandparent) kid.parent = grandparent; else delete kid.parent;
      });

      var i = DOC.pages.indexOf(p);
      if (i > -1) DOC.pages.splice(i, 1);
      index();
      if (orphans.length) {
        toast("ok", orphans.length === 1
          ? "Its child moved up a level"
          : "Its " + orphans.length + " children moved up a level");
      }
      var folder = p.folder;
      current = null;
      editing = false;
      isDraft = false;
      closeMenus();
      renderRails();
      replaceHash(folderUrl(folder));
      saveDoc();
      toast("pending", "Deleted \u2014 saving\u2026");
      return;
    }

    closeMenus();
    if (act === "edit") navigate(editUrl(p.id));
    else if (act === "link") copyLink(pageUrl(p.id));
    else if (act === "duplicate") duplicatePage(p);
  });

  folderMenu.addEventListener("click", function (e) {
    var item = e.target.closest(".menu-item");
    if (!item) return;
    var act = item.dataset.act, f = folderById(menuTarget);
    if (!f) { closeMenus(); return; }

    if (act === "delete") {
      e.stopPropagation();
      var inside = pagesIn(f.id);
      /* Deleting a folder must never quietly take pages with it. */
      if (inside.length) {
        closeMenus();
        toast("warn", f.label + " still holds " + inside.length +
              (inside.length === 1 ? " page. Move or delete it first." : " pages. Move or delete them first."));
        return;
      }
      if (!armed(item)) return;
      var i = DOC.folders.indexOf(f);
      if (i > -1) DOC.folders.splice(i, 1);
      index();
      closeMenus();
      if (state.folder === f.id) state.folder = DOC.folders.length ? DOC.folders[0].id : null;
      renderRails();
      replaceHash(state.folder ? folderUrl(state.folder) : "#/");
      saveDoc();
      return;
    }

    var id = f.id;
    closeMenus();
    if (act === "rename") openFolderInput("rename", id);
    else if (act === "link") copyLink(folderUrl(id));
  });

  function duplicatePage(p) {
    var now = new Date().toISOString();
    var copy = {
      id: "p" + Date.now().toString(36),
      folder: p.folder,
      parent: rawParent(p) ? parentIdOf(p) : null,
      title: (p.title || "Untitled page") + " copy",
      body: p.body || "",
      created: now,
      updated: now
    };
    if (!copy.parent) delete copy.parent;
    DOC.pages.push(copy);
    /* Beside the page it came from, not at the bottom of the folder.
       The copy is childless, so only it needs placing. */
    putAfterSubtree(copy, p);
    index();
    renderRails();
    navigate(pageUrl(copy.id));
    saveDoc();
  }

  /* Anything outside closes whatever's floating. */
  document.addEventListener("click", function (e) {
    if (openMenu && !openMenu.contains(e.target)) closeMenus();
  });
  document.addEventListener("scroll", closeMenus, { passive: true, capture: true });
  window.addEventListener("resize", closeMenus);

  /* ---- Copy link ---- */
  function copyLink(hash) {
    var url = absUrl(hash);

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

  /* =========================================================
     Editor. execCommand is deprecated but still the only thing
     every browser implements for contenteditable.
     ========================================================= */
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
    } else if (cmd === "page") {
      startMention();
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

  /* =========================================================
     The @ picker

     Type @ (or [[) and the next few characters are read as a page
     name. Pick one and a link takes the place of what you typed.
     The link carries the page's id; the text is only a caption,
     refreshed from the page every time it's rendered.
     ========================================================= */
  var mentionEl = $("#mention");
  var mentionCtx = null;      /* where the trigger starts, and what's been typed */
  var mentionHits = [];
  var mentionIndex = 0;

  function mentionIsOpen() { return mentionEl.classList.contains("open"); }

  /* Read backwards from the caret. A trigger only counts at the start of a
     word, so an email address doesn't summon the list. */
  function readTrigger() {
    if (!editing) return null;
    var sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.rangeCount) return null;

    var node = sel.anchorNode;
    if (!node || node.nodeType !== 3 || !editor.contains(node)) return null;

    var before = node.textContent.slice(0, sel.anchorOffset);
    var m = /(?:^|[\s\u00a0(])(@|\[\[)([^@\n[\]]{0,60})$/.exec(before);
    if (!m) return null;

    return {
      node: node,
      end: sel.anchorOffset,
      start: sel.anchorOffset - (m[1] + m[2]).length,
      query: m[2]
    };
  }

  function matchesFor(q) {
    q = q.trim().toLowerCase();
    var pool = DOC.pages.filter(function (p) {
      return !current || p.id !== current.id;     /* a page needn't link to itself */
    });
    if (q) {
      pool = pool.filter(function (p) {
        return String(p.title || "").toLowerCase().indexOf(q) > -1;
      });
      /* A title that starts with what you typed is the likelier one. */
      pool.sort(function (a, b) {
        var sa = String(a.title || "").toLowerCase().indexOf(q) === 0 ? 0 : 1;
        var sb = String(b.title || "").toLowerCase().indexOf(q) === 0 ? 0 : 1;
        return sa - sb || byTitle(a, b);
      });
    } else {
      pool.sort(function (a, b) {
        return String(b.updated || b.created || "").localeCompare(String(a.updated || a.created || ""));
      });
    }
    return pool.slice(0, 8);
  }

  function caretRect() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var r = sel.getRangeAt(0).cloneRange();
    r.collapse(true);

    var rect = null;
    try {
      if (r.getClientRects) rect = r.getClientRects()[0];
      if (!rect && r.getBoundingClientRect) rect = r.getBoundingClientRect();
    } catch (e) { rect = null; }
    if (rect && (rect.width || rect.height || rect.top)) return rect;

    /* An empty line has no caret rectangle of its own; borrow its block's. */
    var el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    return el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  }

  function renderMention() {
    if (!mentionHits.length) {
      mentionEl.innerHTML = '<p class="kb-mention-hint">No page by that name yet. ' +
        "Keep typing, or press Escape to leave the text as it is.</p>";
      return;
    }
    mentionEl.innerHTML = mentionHits.map(function (p, i) {
      return '<button class="kb-option' + (i === mentionIndex ? " on" : "") + '" type="button" ' +
               'role="option" aria-selected="' + (i === mentionIndex ? "true" : "false") + '" data-i="' + i + '">' +
               '<span class="kb-option-name">' + esc(p.title || "Untitled page") + "</span>" +
               '<span class="kb-option-folder">' + esc(folderOf(p).label) + "</span>" +
             "</button>";
    }).join("");
  }

  function positionMention() {
    var rect = caretRect();
    if (!rect) return;
    var h = mentionEl.offsetHeight || 200;
    var top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - 6 - h);
    var left = Math.min(rect.left, window.innerWidth - mentionEl.offsetWidth - 12);
    mentionEl.style.top = top + "px";
    mentionEl.style.left = Math.max(8, left) + "px";
  }

  function scanMention() {
    var ctx = readTrigger();
    if (!ctx) { closeMention(); return; }
    mentionCtx = ctx;
    mentionHits = matchesFor(ctx.query);
    if (mentionIndex >= mentionHits.length) mentionIndex = 0;
    mentionEl.classList.add("open");
    renderMention();
    positionMention();
  }

  function closeMention() {
    mentionEl.classList.remove("open");
    mentionCtx = null;
    mentionHits = [];
    mentionIndex = 0;
  }

  /* The toolbar button types the @ for you, so both routes end up in
     exactly the same place. */
  function startMention() {
    editor.focus();
    var sel = window.getSelection();
    var before = "";
    if (sel && sel.anchorNode && sel.anchorNode.nodeType === 3) {
      before = sel.anchorNode.textContent.slice(0, sel.anchorOffset);
    }
    if (before && !/[\s\u00a0(]$/.test(before)) document.execCommand("insertText", false, " ");
    document.execCommand("insertText", false, "@");
    scanMention();
  }

  function pickMention(i) {
    var p = mentionHits[i];
    if (!p || !mentionCtx) { closeMention(); return; }

    var ctx = mentionCtx;
    closeMention();

    /* Take out what was typed, put the link in its place. */
    var r = document.createRange();
    r.setStart(ctx.node, Math.max(0, ctx.start));
    r.setEnd(ctx.node, ctx.end);
    r.deleteContents();

    var a = document.createElement("a");
    a.className = "page-link";
    a.setAttribute("data-page", p.id);
    a.setAttribute("href", pageUrl(p.id));
    a.textContent = p.title || "Untitled page";
    r.insertNode(a);

    /* A space after it, so the next thing typed lands outside the link
       rather than growing it. */
    var space = document.createTextNode("\u00a0");
    a.parentNode.insertBefore(space, a.nextSibling);

    var after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(after);

    editor.focus();
    syncToolbar();
  }

  editor.addEventListener("input", scanMention);
  editor.addEventListener("keyup", function (e) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" ||
        e.key === "Home" || e.key === "End") scanMention();
  });
  editor.addEventListener("blur", function () {
    /* Give a click on the list time to land before the list disappears. */
    setTimeout(function () { if (!mentionEl.contains(document.activeElement)) closeMention(); }, 120);
  });

  /* While the list is open it owns the arrows and Enter. */
  editor.addEventListener("keydown", function (e) {
    if (!mentionIsOpen()) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!mentionHits.length) return;
      e.preventDefault();
      var step = e.key === "ArrowDown" ? 1 : mentionHits.length - 1;
      mentionIndex = (mentionIndex + step) % mentionHits.length;
      renderMention();
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      if (!mentionHits.length) return;
      e.preventDefault();
      pickMention(mentionIndex);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMention();
    }
  });

  /* mousedown, not click: the selection has to survive long enough to be
     replaced, and a click would have moved it first. */
  mentionEl.addEventListener("mousedown", function (e) {
    var opt = e.target.closest(".kb-option");
    if (!opt) return;
    e.preventDefault();
    pickMention(Number(opt.dataset.i));
  });
  mentionEl.addEventListener("mousemove", function (e) {
    var opt = e.target.closest(".kb-option");
    if (!opt) return;
    var i = Number(opt.dataset.i);
    if (i === mentionIndex) return;
    mentionIndex = i;
    renderMention();
  });

  /* Escape closes the topmost thing: the picker, a menu, the naming input. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (mentionIsOpen()) { closeMention(); return; }
    if (openMenu) { var btn = menuBtn; closeMenus(); if (btn) btn.focus(); return; }
    if (!folderRow.hidden) { closeFolderInput(); return; }
  });

  /* =========================================================
     Router

     One direction only: something changes the hash, the router reads
     it, and the router alone decides what's on screen. A reload, a
     back button and a pasted link all land in the same place.
     ========================================================= */
  function parseHash() {
    var raw = String(location.hash || "").replace(/^#\/?/, "");
    if (!raw) return { name: "list" };

    var parts = raw.split("/").filter(Boolean);
    function id(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

    if (parts[0] === "f" && parts[1]) return { name: "folder", folder: id(parts[1]) };
    if (parts[0] === "p" && parts[1]) {
      return { name: "page", page: id(parts[1]), edit: parts[2] === "edit" };
    }
    /* Not one of ours — treat it as the list, but leave the hash alone.
       It may belong to something else on the page. */
    return { name: "list", foreign: true };
  }

  function applyRoute() {
    if (!loaded) return;
    var r = parseHash();

    var page = r.name === "page" ? pageById(r.page) : null;
    if (r.name === "page" && !page) {
      toast("warn", "That link points at a page that isn\u2019t here any more");
      replaceHash("#/");
      return;
    }

    var wantEdit = !!(page && r.edit);

    /* Already showing exactly this. Don't rebuild the editor underneath
       someone who's typing in it. */
    if (page && current === page && editing === wantEdit) { renderRails(); return; }

    /* Leaving an edit. Unsaved work stops the move rather than vanishing;
       an untouched new page is simply dropped. */
    if (editing && current && !(page === current && wantEdit)) {
      if (dirty()) {
        toast("warn", "Save or cancel your changes first");
        replaceHash(editUrl(current.id));
        return;
      }
      if (isDraft) dropDraft();
      editing = false;
    }

    closeMention();

    if (r.name === "folder") {
      var f = folderById(r.folder);
      if (!f) {
        toast("warn", "That link points at a folder that isn\u2019t here any more");
        replaceHash("#/");
        return;
      }
      state.folder = f.id;
      current = null;
      editing = false;
    } else if (page) {
      state.folder = page.folder;
      current = page;
      editing = wantEdit;
      revealPage(page);          /* a collapsed branch must not hide it */
    } else {
      /* The list: keep the folder in view, close the page. */
      if (!state.folder || !folderById(state.folder)) {
        state.folder = DOC.folders.length ? DOC.folders[0].id : null;
      }
      current = null;
      editing = false;
    }

    paintDoc();
    renderRails();

    if (editing) {
      if (!titleInput.value) titleInput.focus(); else editor.focus();
    }
  }

  /* A new address, remembered — back returns to what you were reading. */
  function navigate(hash) {
    if (location.hash === hash) { applyRoute(); return; }
    location.hash = hash;
  }

  /* Same address, corrected. Closing a page shouldn't leave a step in the
     history that reopens it the moment you press back. */
  function replaceHash(hash) {
    if (history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search + hash);
      applyRoute();
    } else {
      location.hash = hash;
    }
  }

  window.addEventListener("hashchange", applyRoute);

  /* The browser's own guard, for the tab closing mid-sentence. */
  window.addEventListener("beforeunload", function (e) {
    if (!dirty()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* -------------------------------------------------------
     Load, then run the first render
  ------------------------------------------------------- */
  fetch(DATA_FILE, { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (doc) {
      DOC = doc || DOC;
      DOC.folders = DOC.folders || [];
      DOC.pages = DOC.pages || [];
      /* parent is optional in the file. Absent means top level, which
         is what every page written before nesting existed will be. */
      index();
      loaded = true;
      state.folder = DOC.folders.length ? DOC.folders[0].id : null;

      status();
      renderRails();
      applyRoute();          /* the address may already be asking for a page */

      if (pendingDraft || draftWasRequested()) {
        pendingDraft = false;
        newPage();
      }
    })
    .catch(function () {
      loaded = false;
      status();
      folderList.innerHTML = '<p class="kb-rail-empty">Couldn\u2019t load ' + esc(DATA_FILE) + ".</p>";
      pageList.innerHTML = "";
      docBlank.querySelector("strong").textContent = "Couldn\u2019t load " + DATA_FILE;
      docBlank.querySelector("span").textContent =
        "Check it's in the same folder as this page, and that the server is serving it.";
    });
})();
