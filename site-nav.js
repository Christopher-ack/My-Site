/* =========================================================
   SITE NAV — the only navigation file on the site.

   Every page includes this once. It builds the bar, drops it in,
   and wires up hover / tap / keyboard behaviour.

   To change the menu, edit the NAV array below. Nothing else,
   anywhere, needs touching.

   Structure: flat. Every page is a file in this folder, so every
   href here is just a filename. Paths resolve against this script's
   own URL, so the site works off a host or straight off the filesystem.
   ========================================================= */
(function () {

  /* -------------------------------------------------------
     1. MENU CONTENT — this is the part you edit.

     href    : the page's filename, e.g. "links.html".
     match   : filenames that count as "you are here" for this item.
               Add sub-pages to it: ["links.html", "bookmarks.html"].
     columns : one or more; each becomes a column in the panel.
     feature : optional promoted card on the right. One per menu.
  ------------------------------------------------------- */
  var NAV = [
    {
      label: "Links",
      href: "links.html",
      match: ["links.html"]
      /* No columns and no feature, so this one is a plain link:
         no chevron, no panel, click goes straight to the page.
         Give it a `columns` array again and the menu comes back. */
    },

    {
      label: "Knowledge Base",
      href: "kb.html",
      match: ["kb.html"]
      /* Plain link too. The whole section is one page, so a panel
         listing that one page had nothing to say. */
    },

    {
      label: "Demos",
      href: "demos.html",
      match: ["demos.html", "demo-scripts.html"],
      columns: [
        {
          links: [
            { label: "Demos", href: "demos.html", note: "Demo script builder" },
            { label: "Scripts", href: "demo-scripts.html", note: "Previous and favorite demo scripts." }
          ]
        }
      ],
      /* The tile block. Order here is the order on screen, and the
         pencil on the section edits this list. */
      tiles: [
        { title: "Demo builder", desc: "String blocks into a script.", url: "demos.html", color: "cyan" },
        { title: "Saved scripts", desc: "Everything kept, ready to reopen.", url: "demo-scripts.html", color: "green" },
        { title: "Knowledge Base", desc: "The write-ups behind the demos.", url: "kb.html", color: "purple" },
        { title: "Links", desc: "Reference material worth keeping.", url: "links.html", color: "amber" }
      ],
      feature: {
        title: "Built far enough to click",
        body: "Working prototypes and live examples of the design system.",
        linkLabel: "Open Demos",
        href: "demos.html"
      }
    },

    {
      label: "Tasks",
      href: "tasks.html",
      match: ["tasks.html", "tasks-all.html", "task-board.html"],
      columns: [
        {
          links: [
            { label: "Dashboard", href: "tasks.html", note: "Where everything stands." },
            { label: "All Tasks", href: "tasks-all.html", note: "Every task in one table." },
            { label: "Task Board", href: "task-board.html", note: "Kanban board view." }
          ]
        }
      ],
      tiles: [
        { title: "All Tasks", desc: "Every task in one table.", url: "tasks-all.html", color: "cyan" },
        { title: "Task Board", desc: "Kanban board view.", url: "task-board.html", color: "orange" },
        { title: "Dashboard", desc: "Where everything stands.", url: "tasks.html", color: "sky" }
      ],
      feature: {
        title: "Four columns, one drag",
        body: "Active, pending, complete, canceled. Move a card and the file moves with it.",
        linkLabel: "Open the board",
        href: "task-board.html"
      }
    }
  ];

  var BRAND = "My Site";

  /* The "New" button and its menu.
     Each item is either a plain link (href) or an action name that
     the handler in section 5 knows how to run. An item with neither
     is a placeholder: it shows, greyed, and does nothing. */
  var CTA = {
    label: "New",
    items: [
      { label: "Link", action: "new-link" },
      { label: "Demo", action: "new-demo" },
      { label: "Page", action: "new-page" },
      { label: "Task", action: "new-task" }
    ]
  };


  /* -------------------------------------------------------
     2. Where the site lives.
     This script sits beside every page, so its own URL tells us.
  ------------------------------------------------------- */
  var self = document.currentScript ||
             (function () { var s = document.getElementsByTagName("script"); return s[s.length - 1]; })();
  var ROOT = self.src.replace(/[^/]*$/, "");          // ".../site/"

  /* A bare filename resolves against the site; a full address is left
     alone, so an edited card can point off-site. */
  var url = function (href) {
    return /^([a-z]+:)?\/\//i.test(String(href)) || String(href).charAt(0) === "#"
      ? href : ROOT + href;
  };


  /* -------------------------------------------------------
     3. Build the markup.
  ------------------------------------------------------- */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* An item with no columns is just a link. Same wrapper so the
     "you are here" pass below can still line groups up with NAV. */
  function hasMega(item) { return !!(item.columns && item.columns.length); }

  function buildGroup(item, i) {
    if (!hasMega(item)) {
      return (
        '<div class="nav-group">' +
          '<a class="nav-item" href="' + url(item.href) + '">' + esc(item.label) + "</a>" +
        "</div>"
      );
    }

    var id = "mega-" + item.href.replace(/\.html$/, "");

    var cols = item.columns.map(function (col) {
      var links = col.links.map(function (l) {
        return '<a class="mega-link" href="' + url(l.href) + '"><b>' + esc(l.label) + "</b>" +
               (l.note ? "<span>" + esc(l.note) + "</span>" : "") + "</a>";
      }).join("");
      /* A title is optional now. One column of pages doesn't need a
         heading saying "Pages" — the links say that themselves. */
      var head = col.title ? '<span class="label-caps">' + esc(col.title) + "</span>" : "";
      return '<div class="mega-col">' + head + links + "</div>";
    }).join("");

    var tiles = item.tiles ? buildTiles(i, item.tiles) : "";
    var feature = item.feature ? buildFeature(i, item.feature) : "";

    return (
      '<div class="nav-group">' +
        '<a class="nav-item" href="' + url(item.href) + '" ' +
           'aria-expanded="false" aria-haspopup="true" aria-controls="' + id + '">' +
          esc(item.label) + '<span class="chevron"></span>' +
        "</a>" +
        '<div class="mega" id="' + id + '">' +
          '<div class="mega-inner">' + cols + tiles + feature + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  /* The tile block. Spans the middle two columns and reads as one
     section, so it carries a single pencil rather than one per tile.
     Each tile is an <a>, so middle-click and "open in new tab" work. */
  function buildTiles(i, list) {
    var tiles = list.map(function (t) {
      return '<a class="mega-tile" href="' + url(t.url || "#") + '" ' +
               'style="--tile:' + esc(tileHex(t.color)) + '">' +
               "<b>" + esc(t.title || "Untitled") + "</b>" +
               (t.desc ? "<span>" + esc(t.desc) + "</span>" : "") +
             "</a>";
    }).join("");

    /* Cleared out, the section still has to offer its own pencil. */
    var body = list.length
      ? '<div class="mega-tile-grid">' + tiles + "</div>"
      : '<p class="mega-tile-empty">No tiles yet. The pencil adds them.</p>';

    return (
      '<div class="mega-tiles" data-tiles="' + i + '">' +
        '<button class="mega-feature-edit" type="button" data-edit-tiles="' + i + '" ' +
          'aria-label="Edit these tiles" title="Edit these tiles">' + ICON_PENCIL + "</button>" +
        body +
      "</div>"
    );
  }

  /* The promoted card. Rebuilt on its own whenever the edit modal saves,
     so the panel around it doesn't have to be torn down and reopened. */
  function buildFeature(i, f) {
    return (
      '<aside class="mega-feature" data-feature="' + i + '">' +
        '<button class="mega-feature-edit" type="button" data-edit-feature="' + i + '" ' +
          'aria-label="Edit this card" title="Edit this card">' + ICON_PENCIL + "</button>" +
        "<h4>" + esc(f.title) + "</h4>" +
        "<p>" + esc(f.body) + "</p>" +
        '<a href="' + url(f.href) + '">' + esc(f.linkLabel) + " \u2192</a>" +
      "</aside>"
    );
  }

  /* The palette a tile can wear. Named rather than raw hex, so a saved
     tile keeps meaning if the theme's values ever move. */
  var TILE_COLORS = [
    { id: "cyan",    label: "Cyan",    hex: "#22d3ee" },
    { id: "sky",     label: "Sky",     hex: "#38bdf8" },
    { id: "teal",    label: "Teal",    hex: "#2dd4bf" },
    { id: "green",   label: "Green",   hex: "#34d399" },
    { id: "lime",    label: "Lime",    hex: "#a3e635" },
    { id: "amber",   label: "Amber",   hex: "#fbbf24" },
    { id: "orange",  label: "Orange",  hex: "#f97316" },
    { id: "rose",    label: "Rose",    hex: "#f43f5e" },
    { id: "pink",    label: "Pink",    hex: "#f472b6" },
    { id: "fuchsia", label: "Fuchsia", hex: "#e879f9" },
    { id: "purple",  label: "Purple",  hex: "#8b5cf6" },
    { id: "slate",   label: "Slate",   hex: "#94a3b8" }
  ];
  function tileHex(id) {
    for (var i = 0; i < TILE_COLORS.length; i++) {
      if (TILE_COLORS[i].id === id) return TILE_COLORS[i].hex;
    }
    return TILE_COLORS[0].hex;
  }

  var ICON_GRIP =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">' +
    '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/>' +
    '<circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/>' +
    '<circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';

  var ICON_TRASH =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

  var ICON_PENCIL =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

  /* Menu row under the New button. No href and no action = placeholder. */
  function buildCtaItem(item, i) {
    var live = !!(item.href || item.action);
    return '<button class="menu-item cta-item" type="button" role="menuitem" ' +
             'data-i="' + i + '"' + (live ? "" : " disabled") + ">" +
             esc(item.label) +
           "</button>";
  }

  var html =
    '<header class="site-nav" id="nav">' +
      '<div class="nav-inner">' +
        '<a class="brand" href="' + ROOT + '">' + esc(BRAND) + '<span class="brand-dot"></span></a>' +
        '<div class="nav-collapse" id="collapse">' +
          '<nav class="nav-items" aria-label="Main">' + NAV.map(buildGroup).join("") + "</nav>" +
          '<div class="nav-right">' +
            '<div class="cta-group" id="ctaGroup">' +
              '<button class="btn-primary btn-small cta-btn" id="ctaBtn" type="button" ' +
                 'aria-haspopup="true" aria-expanded="false" aria-controls="ctaMenu">' +
                esc(CTA.label) + '<span class="chevron"></span>' +
              "</button>" +
              '<div class="menu-panel cta-menu" id="ctaMenu" role="menu" aria-labelledby="ctaBtn">' +
                CTA.items.map(buildCtaItem).join("") +
              "</div>" +
            "</div>" +
          "</div>" +
        "</div>" +
        '<button class="icon-btn nav-burger" id="burger" aria-label="Menu" aria-expanded="false" aria-controls="collapse">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
          '<line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></svg>' +
        "</button>" +
      "</div>" +
    "</header>";

  var mount = document.getElementById("nav-mount");
  if (mount) {
    mount.innerHTML = html;
  } else {
    document.body.insertAdjacentHTML("afterbegin", html);
  }


  /* -------------------------------------------------------
     4. Behaviour.
  ------------------------------------------------------- */
  var nav = document.getElementById("nav");
  var collapse = document.getElementById("collapse");
  var burger = document.getElementById("burger");
  var ctaBtn = document.getElementById("ctaBtn");
  var ctaMenu = document.getElementById("ctaMenu");

  /* Interaction is decided by pointer type, layout by width.
     An iPad in landscape is wide enough for the desktop bar but
     cannot hover, so those are two separate questions. */
  var hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  var wideQuery = window.matchMedia("(min-width: 901px)");
  var canHover = function () { return hoverQuery.matches && wideQuery.matches; };

  var groups = [].slice.call(nav.querySelectorAll(".nav-group")).map(function (g) {
    return { root: g, btn: g.querySelector(".nav-item"), panel: g.querySelector(".mega") };
  });

  /* "You are here" — read off the page's own filename, so no page sets it.
     A bare directory URL means index.html, which matches nothing. */
  (function markCurrent() {
    var here = location.href.split(/[?#]/)[0];
    if (here.indexOf(ROOT) !== 0) return;
    var file = here.slice(ROOT.length) || "index.html";
    groups.forEach(function (rec, i) {
      if ((NAV[i].match || [NAV[i].href]).indexOf(file) > -1) rec.btn.classList.add("current");
    });
  })();

  var current = null, openTimer, closeTimer;

  function openMenu(rec) {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    closeCta();
    if (current === rec) return;
    if (current) closeMenu(true);
    rec.btn.classList.add("open");
    rec.btn.setAttribute("aria-expanded", "true");
    rec.panel.classList.add("open");
    nav.classList.add("menu-open");
    current = rec;
  }

  function closeMenu(keepBar) {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    if (!current) return;
    current.btn.classList.remove("open");
    current.btn.setAttribute("aria-expanded", "false");
    current.panel.classList.remove("open");
    current = null;
    if (keepBar !== true) nav.classList.remove("menu-open");
  }

  groups.forEach(function (rec) {
    /* Nothing to open — the anchor does its own job. */
    if (!rec.panel) return;

    rec.btn.addEventListener("click", function (e) {
      /* Hovering already revealed the menu, so a click means "go there". */
      if (canHover()) return;
      /* No hover available: the first tap opens the menu.
         Only a second tap on the same item follows the link. */
      if (current === rec) return;
      e.preventDefault();
      openMenu(rec);
    });

    rec.root.addEventListener("mouseenter", function () {
      if (!canHover()) return;
      clearTimeout(closeTimer);
      openTimer = setTimeout(function () { openMenu(rec); }, current ? 0 : 90);
    });

    rec.root.addEventListener("mouseleave", function () {
      if (!canHover()) return;
      clearTimeout(openTimer);
      closeTimer = setTimeout(closeMenu, 180);
    });
  });

  nav.addEventListener("keydown", function (e) {
    var i = groups.findIndex(function (g) { return g.btn === document.activeElement; });

    if (e.key === "Escape" && current) {
      var btn = current.btn;
      closeMenu();
      btn.focus();
      return;
    }

    /* Down opens the focused item's menu and steps into it. Enter still follows the link. */
    if (e.key === "ArrowDown" && i !== -1 && groups[i].panel) {
      e.preventDefault();
      openMenu(groups[i]);
      var first = groups[i].panel.querySelector("a");
      if (first) first.focus();
      return;
    }

    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || i === -1) return;
    e.preventDefault();
    var next = groups[(i + (e.key === "ArrowRight" ? 1 : groups.length - 1)) % groups.length];
    next.btn.focus();
    if (!current) return;
    if (next.panel) openMenu(next); else closeMenu();
  });

  /* ---- The New menu ---- */
  function openCta() {
    closeMenu();                      /* one thing open at a time */
    ctaMenu.classList.add("open");
    ctaBtn.classList.add("open");
    ctaBtn.setAttribute("aria-expanded", "true");
  }

  function closeCta() {
    ctaMenu.classList.remove("open");
    ctaBtn.classList.remove("open");
    ctaBtn.setAttribute("aria-expanded", "false");
  }

  var ctaOpen = function () { return ctaMenu.classList.contains("open"); };

  ctaBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (ctaOpen()) { closeCta(); return; }
    openCta();
  });

  /* Actions the menu can run.

     Every one of them means the same thing: "open that page's
     new-thing modal, wherever I happen to be standing".

     page : the page that owns the modal.
     flag : the query string that asks for it from another page.
     hook : the global that page publishes once it's ready.

     Add a row here, add an item to CTA above, and have the page
     expose openDraft(). Nothing else needs to change. */
  var ACTIONS = {
    "new-link": { page: "links.html",     flag: "new=link", hook: "LinkPage" },
    "new-demo": { page: "demos.html",     flag: "new=demo", hook: "DemoPage" },
    "new-page": { page: "kb.html",        flag: "new=page", hook: "KbPage" },
    "new-task": { page: "tasks-all.html", flag: "new=task", hook: "TaskBoard" }
  };

  function runAction(name) {
    var a = ACTIONS[name];
    if (!a) return;

    var target = url(a.page);
    var here = location.href.split(/[?#]/)[0];
    var api = window[a.hook];

    /* Already on that page: no reload, just open the modal.
       The page publishes the hook; if it hasn't yet, fall through
       to the URL, which asks for the same thing on the way in. */
    if (here === target && api && api.openDraft) {
      api.openDraft();
      return;
    }
    location.href = target + "?" + a.flag;
  }

  ctaMenu.addEventListener("click", function (e) {
    var btn = e.target.closest(".cta-item");
    if (!btn || btn.disabled) return;
    var item = CTA.items[Number(btn.dataset.i)];
    closeCta();
    collapse.classList.remove("open");   /* the drawer, if we're on mobile */
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    if (!item) return;
    if (item.href) { location.href = url(item.href); return; }
    runAction(item.action);
  });

  /* Arrow keys walk the menu; Escape hands focus back to the button. */
  ctaMenu.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    var items = [].slice.call(ctaMenu.querySelectorAll(".cta-item:not([disabled])"));
    var i = items.indexOf(document.activeElement);
    if (!items.length) return;
    e.preventDefault();
    var step = e.key === "ArrowDown" ? 1 : items.length - 1;
    items[(i + step + items.length) % items.length].focus();
  });

  ctaBtn.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowDown") return;
    e.preventDefault();
    openCta();
    var first = ctaMenu.querySelector(".cta-item:not([disabled])");
    if (first) first.focus();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && ctaOpen()) { closeCta(); ctaBtn.focus(); }
  });

  document.addEventListener("click", function (e) {
    if (!nav.contains(e.target)) { closeMenu(); closeCta(); }
    else if (!ctaMenu.contains(e.target) && e.target !== ctaBtn) closeCta();
  });
  nav.addEventListener("focusout", function (e) {
    if (!nav.contains(e.relatedTarget)) { closeMenu(); closeCta(); }
  });

  burger.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = collapse.classList.toggle("open");
    burger.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", open);
    if (!open) closeMenu();
  });

  var onScroll = function () { nav.classList.toggle("scrolled", window.scrollY > 6); };
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  window.addEventListener("resize", function () {
    closeMenu();
    closeCta();
    collapse.classList.remove("open");
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  });

  /* -------------------------------------------------------
     5. Editing a feature card.

     The cards are content, not code, so they live in a file the way
     every other page's content does: nav-data.json, keyed by the
     section's href. The NAV array above stays the default — the file
     only holds what has been changed, so deleting it restores the
     defaults rather than emptying the menus.

     Saving is the same handshake the rest of the site uses: PUT the
     whole file back. A plain static host refuses that, so the edit
     stays for the session and says so.
  ------------------------------------------------------- */
  var FEATURE_FILE = "nav-data.json";

  /* Built once, reused by every card. The nav injects it because no
     page's markup knows the nav exists. */
  var editor = document.createElement("div");
  editor.className = "modal-overlay";
  editor.id = "navFeatureModal";
  editor.innerHTML =
    '<div class="modal-box nav-feature-modal" role="dialog" aria-modal="true" ' +
       'aria-labelledby="navFeatureTitle">' +
      '<h2 class="modal-title" id="navFeatureTitle">Edit card</h2>' +
      '<div class="field">' +
        '<label class="modal-label" for="navFTitle">Title</label>' +
        '<input class="input" type="text" id="navFTitle" autocomplete="off" />' +
      "</div>" +
      '<div class="field">' +
        '<label class="modal-label" for="navFBody">Description</label>' +
        '<textarea class="input" id="navFBody" rows="3"></textarea>' +
      "</div>" +
      '<div class="field">' +
        '<label class="modal-label" for="navFLabel">Link text</label>' +
        '<input class="input" type="text" id="navFLabel" autocomplete="off" />' +
      "</div>" +
      '<div class="field">' +
        '<label class="modal-label" for="navFHref">Link</label>' +
        '<input class="input" type="text" id="navFHref" autocomplete="off" spellcheck="false" />' +
        '<p class="hint">A page in this folder, like demos.html, or a full web address.</p>' +
      "</div>" +
      '<p class="hint nav-feature-status" id="navFStatus" hidden></p>' +
      '<div class="modal-actions">' +
        '<span class="modal-actions-spacer"></span>' +
        '<button class="btn" type="button" id="navFCancel">Cancel</button>' +
        '<button class="btn-primary" type="button" id="navFSave">Save</button>' +
      "</div>" +
    "</div>";
  document.body.appendChild(editor);

  var fTitle = editor.querySelector("#navFTitle"),
      fBody = editor.querySelector("#navFBody"),
      fLabel = editor.querySelector("#navFLabel"),
      fHref = editor.querySelector("#navFHref"),
      fStatus = editor.querySelector("#navFStatus");
  var editingIndex = null;

  function say(text, kind) {
    fStatus.hidden = !text;
    fStatus.textContent = text || "";
    fStatus.className = "hint nav-feature-status" + (kind ? " is-" + kind : "");
  }

  function openEditor(i) {
    var f = NAV[i] && NAV[i].feature;
    if (!f) return;
    editingIndex = i;
    fTitle.value = f.title || "";
    fBody.value = f.body || "";
    fLabel.value = f.linkLabel || "";
    fHref.value = f.href || "";
    say("");
    closeMenu();                       /* the panel would sit over the modal */
    editor.classList.add("open");
    fTitle.focus();
    fTitle.select();
  }

  function closeEditor() {
    editor.classList.remove("open");
    editingIndex = null;
  }

  /* Redraw just the one card, in place. */
  function repaintFeature(i) {
    var el = nav.querySelector('.mega-feature[data-feature="' + i + '"]');
    if (!el) return;
    var fresh = document.createElement("div");
    fresh.innerHTML = buildFeature(i, NAV[i].feature);
    el.parentNode.replaceChild(fresh.firstChild, el);
  }

  function saveEditor() {
    if (editingIndex == null) return;
    var i = editingIndex;

    var title = fTitle.value.trim();
    if (!title) { say("Give the card a title.", "warn"); fTitle.focus(); return; }
    var href = fHref.value.trim();
    if (!href) { say("Give the link somewhere to go.", "warn"); fHref.focus(); return; }

    NAV[i].feature = {
      title: title,
      body: fBody.value.trim(),
      linkLabel: fLabel.value.trim() || "Open",
      href: href
    };
    repaintFeature(i);

    say("Saving\u2026");
    saveNavFile().then(function () { closeEditor(); })
      .catch(function () {
        say("Couldn't write " + FEATURE_FILE + ". The change is here for this " +
            "session, but it won't survive a reload.", "warn");
      });
  }

  /* Send the whole file, defaults included, so it can be read back
     without needing the array above to agree with it. Both editors go
     through here, so saving one never drops the other's work. */
  function saveNavFile() {
    var payload = { version: 1, updated: new Date().toISOString(), features: {}, tiles: {} };
    NAV.forEach(function (item) {
      if (item.feature) payload.features[item.href] = item.feature;
      if (item.tiles) payload.tiles[item.href] = item.tiles;
    });
    return fetch(url(FEATURE_FILE), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload, null, 2)
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r;
    });
  }

  nav.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-edit-feature]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openEditor(Number(btn.dataset.editFeature));
  });

  editor.querySelector("#navFSave").addEventListener("click", saveEditor);
  editor.querySelector("#navFCancel").addEventListener("click", closeEditor);
  editor.addEventListener("click", function (e) { if (e.target === editor) closeEditor(); });
  editor.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.stopPropagation(); closeEditor(); }
    else if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); saveEditor(); }
  });

  /* Read the overrides back. Anything the file doesn't mention keeps the
     default from the array above. */
  fetch(url(FEATURE_FILE), { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (doc) {
      if (!doc || (!doc.features && !doc.tiles)) return;
      doc.features = doc.features || {};
      NAV.forEach(function (item, i) {
        var saved = doc.features[item.href];
        if (saved && item.feature) {
          item.feature = {
            title: saved.title || item.feature.title,
            body: saved.body != null ? saved.body : item.feature.body,
            linkLabel: saved.linkLabel || item.feature.linkLabel,
            href: saved.href || item.feature.href
          };
          repaintFeature(i);
        }

        /* Tiles are a list, not a set of fields: the file replaces it
           outright, so removing a tile sticks. An empty array is a real
           answer and has to win over the default. */
        var savedTiles = doc.tiles && doc.tiles[item.href];
        if (savedTiles && item.tiles) {
          item.tiles = savedTiles;
          repaintTiles(i);
        }
      });
    })
    .catch(function () { /* no file yet — the defaults stand */ });


  /* -------------------------------------------------------
     6. Editing the tile block.

     A table of rows: title, description, URL, colour. The order of
     the rows is the order on screen, so the rows are draggable —
     same pointer-event handling as the task board and the script
     builder, and the running order is read back off the DOM when
     the drag ends rather than tracked in a parallel array.
  ------------------------------------------------------- */
  var tileEditor = document.createElement("div");
  tileEditor.className = "modal-overlay";
  tileEditor.id = "navTilesModal";
  tileEditor.innerHTML =
    '<div class="modal-box modal-box-large nav-tiles-modal" role="dialog" aria-modal="true" ' +
       'aria-labelledby="navTilesTitle">' +
      '<h2 class="modal-title" id="navTilesTitle">Edit tiles</h2>' +
      '<p class="hint">Drag a row by its handle to change the order they appear in.</p>' +
      '<div class="tile-table">' +
        '<div class="tile-table-head">' +
          "<span></span><span>Title</span><span>Description</span>" +
          "<span>URL</span><span>Color</span><span></span>" +
        "</div>" +
        '<div class="tile-rows" id="navTileRows"></div>' +
      "</div>" +
      '<button class="btn btn-small nav-tile-add" type="button" id="navTileAdd">Add a tile</button>' +
      '<p class="hint nav-feature-status" id="navTStatus" hidden></p>' +
      '<div class="modal-actions">' +
        '<span class="modal-actions-spacer"></span>' +
        '<button class="btn" type="button" id="navTCancel">Cancel</button>' +
        '<button class="btn-primary" type="button" id="navTSave">Save</button>' +
      "</div>" +
    "</div>";
  document.body.appendChild(tileEditor);

  var tileRows = tileEditor.querySelector("#navTileRows");
  var tStatus = tileEditor.querySelector("#navTStatus");
  var tileIndex = null;

  function tSay(text, kind) {
    tStatus.hidden = !text;
    tStatus.textContent = text || "";
    tStatus.className = "hint nav-feature-status" + (kind ? " is-" + kind : "");
  }

  function tileRowHTML(t) {
    t = t || {};
    var opts = TILE_COLORS.map(function (c) {
      return '<option value="' + c.id + '"' +
             (c.id === t.color ? " selected" : "") + ">" + esc(c.label) + "</option>";
    }).join("");
    return (
      '<div class="tile-row">' +
        '<button class="tile-grip" type="button" aria-label="Drag to reorder">' + ICON_GRIP + "</button>" +
        '<input class="input input-small" type="text" data-f="title" value="' +
          esc(t.title || "") + '" placeholder="Tile title" autocomplete="off" />' +
        '<input class="input input-small" type="text" data-f="desc" value="' +
          esc(t.desc || "") + '" placeholder="One line" autocomplete="off" />' +
        '<input class="input input-small" type="text" data-f="url" value="' +
          esc(t.url || "") + '" placeholder="demos.html" autocomplete="off" spellcheck="false" />' +
        '<span class="tile-color">' +
          '<span class="tile-swatch" style="--tile:' + esc(tileHex(t.color)) + '"></span>' +
          '<select class="input input-small" data-f="color">' + opts + "</select>" +
        "</span>" +
        '<button class="icon-btn tile-del" type="button" aria-label="Remove this tile">' +
          ICON_TRASH + "</button>" +
      "</div>"
    );
  }

  function openTilesEditor(i) {
    tileIndex = i;
    var list = (NAV[i] && NAV[i].tiles) || [];
    tileRows.innerHTML = list.map(tileRowHTML).join("");
    tSay("");
    closeMenu();
    tileEditor.classList.add("open");
    var first = tileRows.querySelector('input[data-f="title"]');
    if (first) { first.focus(); first.select(); }
  }

  function closeTilesEditor() {
    tileEditor.classList.remove("open");
    tileIndex = null;
  }

  /* Read the table back, top to bottom. A row with no title and no URL
     is treated as an abandoned blank and dropped rather than saved. */
  function readTileRows() {
    return [].slice.call(tileRows.querySelectorAll(".tile-row")).map(function (row) {
      var get = function (f) {
        var el = row.querySelector('[data-f="' + f + '"]');
        return el ? el.value.trim() : "";
      };
      return { title: get("title"), desc: get("desc"), url: get("url"), color: get("color") };
    }).filter(function (t) { return t.title || t.url; });
  }

  function saveTiles() {
    if (tileIndex == null) return;
    var i = tileIndex;
    var list = readTileRows();

    var bad = null;
    list.forEach(function (t) {
      if (!bad && !t.title) bad = "Every tile needs a title.";
      if (!bad && !t.url) bad = t.title + " has no link.";
    });
    if (bad) { tSay(bad, "warn"); return; }

    NAV[i].tiles = list;
    repaintTiles(i);
    tSay("Saving\u2026");
    saveNavFile().then(function () { closeTilesEditor(); })
      .catch(function () {
        tSay("Couldn't write " + FEATURE_FILE + ". The change is here for this " +
             "session, but it won't survive a reload.", "warn");
      });
  }

  function repaintTiles(i) {
    var el = nav.querySelector('.mega-tiles[data-tiles="' + i + '"]');
    if (!el) return;
    var fresh = document.createElement("div");
    fresh.innerHTML = buildTiles(i, NAV[i].tiles);
    el.parentNode.replaceChild(fresh.firstChild, el);
  }

  nav.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-edit-tiles]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openTilesEditor(Number(btn.dataset.editTiles));
  });

  tileEditor.querySelector("#navTileAdd").addEventListener("click", function () {
    tileRows.insertAdjacentHTML("beforeend", tileRowHTML({ color: "cyan" }));
    var rows = tileRows.querySelectorAll(".tile-row");
    var last = rows[rows.length - 1];
    last.querySelector('input[data-f="title"]').focus();
  });

  tileRows.addEventListener("click", function (e) {
    if (e.target.closest(".tile-del")) e.target.closest(".tile-row").remove();
  });

  /* The swatch follows the picker, so the colour is visible in the table
     rather than only after saving. */
  tileRows.addEventListener("change", function (e) {
    var sel = e.target.closest('[data-f="color"]');
    if (!sel) return;
    var sw = sel.closest(".tile-row").querySelector(".tile-swatch");
    if (sw) sw.style.setProperty("--tile", tileHex(sel.value));
  });

  tileEditor.querySelector("#navTSave").addEventListener("click", saveTiles);
  tileEditor.querySelector("#navTCancel").addEventListener("click", closeTilesEditor);
  tileEditor.addEventListener("click", function (e) {
    if (e.target === tileEditor) closeTilesEditor();
  });
  tileEditor.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.stopPropagation(); closeTilesEditor(); }
  });

  /* ---- Reordering the rows ----
     The rows carry live inputs, so nothing is re-rendered mid-drag: the
     row itself is moved in the DOM and a clone follows the pointer. */
  var tdrag = null;

  tileRows.addEventListener("pointerdown", function (e) {
    if (e.button != null && e.button !== 0) return;
    var grip = e.target.closest(".tile-grip");
    if (!grip) return;
    e.preventDefault();

    var row = grip.closest(".tile-row");
    if (!row || tileRows.querySelectorAll(".tile-row").length < 2) return;

    var rect = row.getBoundingClientRect();
    tdrag = {
      row: row, x0: e.clientX, y0: e.clientY,
      ox: e.clientX - rect.left, oy: e.clientY - rect.top,
      w: rect.width, h: rect.height, moved: false, ghost: null
    };
  });

  document.addEventListener("pointermove", function (e) {
    if (!tdrag) return;

    if (!tdrag.moved) {
      if (Math.abs(e.clientX - tdrag.x0) + Math.abs(e.clientY - tdrag.y0) < 6) return;
      tdrag.moved = true;
      var ghost = tdrag.row.cloneNode(true);
      ghost.classList.add("tile-row-ghost");
      ghost.style.width = tdrag.w + "px";
      ghost.style.height = tdrag.h + "px";
      document.body.appendChild(ghost);
      tdrag.ghost = ghost;
      tdrag.row.classList.add("dragging");
      document.body.classList.add("dragging-tile");
    }

    if (e.cancelable) e.preventDefault();
    tdrag.ghost.style.left = (e.clientX - tdrag.ox) + "px";
    tdrag.ghost.style.top = (e.clientY - tdrag.oy) + "px";

    /* The ghost ignores pointer events, so this reads the row beneath. */
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var over = under && under.closest ? under.closest(".tile-row") : null;
    if (!over || over === tdrag.row || !tileRows.contains(over)) return;

    var box = over.getBoundingClientRect();
    var after = e.clientY > box.top + box.height / 2;
    tileRows.insertBefore(tdrag.row, after ? over.nextSibling : over);
  }, { passive: false });

  function endTileDrag() {
    if (!tdrag) return;
    var d = tdrag;
    tdrag = null;
    if (!d.moved) return;
    if (d.ghost) d.ghost.remove();
    d.row.classList.remove("dragging");
    document.body.classList.remove("dragging-tile");
  }

  document.addEventListener("pointerup", endTileDrag);
  document.addEventListener("pointercancel", endTileDrag);

})();
