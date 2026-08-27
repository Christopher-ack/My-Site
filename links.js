/* =========================================================
   LINKS PAGE

   Every row and every category lives in links-data.json.
   Nothing about the content is in the HTML.

   Saving works the way the Demos page does: PUT the whole file
   back. A plain static host will refuse that, so the page keeps
   your edits for the session and hands you the updated file to
   swap in whenever you're done.
   ========================================================= */
(function () {
  var DATA_FILE = "links-data.json";
  var $ = function (s) { return document.querySelector(s); };

  var DOC = { version: 1, updated: null, categories: [], links: [] };
  var catById = {};
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
  function catOf(id) {
    return catById[id] || { id: id, label: id || "Uncategorised", color: "#94a3b8" };
  }
  function catsOf(link) { return (link && link.cats) || []; }
  function linkById(id) {
    for (var i = 0; i < DOC.links.length; i++) if (DOC.links[i].id === id) return DOC.links[i];
    return null;
  }

  /* First category paints the tile. No categories still gets a color,
     so a tile is never colorless. */
  function colorOf(link) {
    var c = catsOf(link)[0];
    return c ? catOf(c).color : "#94a3b8";
  }

  /* A category invented in the modal still needs a color. Hash the name
     so the same word always lands on the same hue, and so two new
     categories don't come out looking like the same one. */
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

  /* A URL the browser will actually accept. Typing "example.com"
     without a scheme is the common case, so assume https. */
  function normalizeUrl(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
    return s;
  }
  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (e) {
      return String(url || "").replace(/^https?:\/\//i, "").split("/")[0];
    }
  }
  /* Shown under the title: host plus path, no scheme, no trailing slash. */
  function prettyUrl(url) {
    return String(url || "")
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/$/, "");
  }

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
    desc: false        /* sort direction on title */
  };

  var favSection = $("#favSection"), favGrid = $("#favGrid"), favCountEl = $("#favCount");
  var rowsEl = $("#rows"), countEl = $("#count"), emptyEl = $("#emptyState");

  function visible() {
    var q = state.query.trim().toLowerCase();

    var out = DOC.links.filter(function (l) {
      if (state.cats.size) {
        var hit = catsOf(l).some(function (c) { return state.cats.has(c); });
        if (!hit) return false;
      }

      if (!q) return true;
      /* Search reads the category labels too, so "design" finds a row
         whose title never says it. */
      var hay = [l.title, l.url, l.desc]
        .concat(catsOf(l).map(function (c) { return catOf(c).label; }))
        .join(" ").toLowerCase();
      return hay.indexOf(q) > -1;
    });

    out.sort(function (a, b) {
      var r = String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
      return state.desc ? -r : r;
    });
    return out;
  }

  /* ---- Favorites shelf ---- */
  function renderFavs() {
    var favs = DOC.links.filter(function (l) { return !!l.fav; });

    favSection.hidden = favs.length === 0;
    favCountEl.textContent = favs.length + (favs.length === 1 ? " link" : " links");

    favGrid.innerHTML = favs.map(function (l) {
      return '<a class="card fav-tile" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" ' +
               'style="--cat:' + esc(colorOf(l)) + '" title="' + esc(l.url) + '">' +
               '<span class="fav-heart" aria-hidden="true">' + ICON_HEART + "</span>" +
               '<span class="fav-title">' + esc(l.title || "Untitled link") + "</span>" +
               '<span class="fav-host">' + esc(hostOf(l.url)) + "</span>" +
             "</a>";
    }).join("");
  }

  /* ---- Table ---- */
  function renderRows() {
    var shown = visible();

    rowsEl.innerHTML = shown.map(function (l) {
      var tags = catsOf(l).map(function (id) {
        var c = catOf(id);
        return '<span class="tag" style="--tag-color:' + esc(c.color) + '">' + esc(c.label) + "</span>";
      }).join("");

      return '<tr data-id="' + esc(l.id) + '">' +
               '<td class="cell-primary">' +
                 '<a class="link-title" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' +
                   esc(l.title || "Untitled link") +
                 "</a>" +
                 '<span class="link-url">' + esc(prettyUrl(l.url)) + "</span>" +
                 (l.desc ? '<span class="link-desc">' + esc(l.desc) + "</span>" : "") +
               "</td>" +
               '<td class="col-hide-sm"><div class="link-cats">' + tags + "</div></td>" +
               '<td class="cell-right">' +
                 '<button class="icon-btn fav-btn' + (l.fav ? " on on-love" : "") + '" type="button" ' +
                   'data-id="' + esc(l.id) + '" aria-pressed="' + (l.fav ? "true" : "false") + '" ' +
                   'aria-label="' + (l.fav ? "Remove from favorites" : "Add to favorites") + '">' +
                   ICON_HEART +
                 "</button>" +
               "</td>" +
               '<td class="cell-right">' +
                 '<button class="icon-btn row-menu-btn" type="button" data-id="' + esc(l.id) + '" ' +
                   'aria-haspopup="true" aria-expanded="false" aria-label="More actions">' + ICON_KEBAB +
                 "</button>" +
               "</td>" +
             "</tr>";
    }).join("");

    countEl.textContent = shown.length + (shown.length === 1 ? " link" : " links");
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
      var n = DOC.links.filter(function (l) { return catsOf(l).indexOf(c.id) > -1; }).length;
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

  $(".sort-header").addEventListener("click", function () {
    state.desc = !state.desc;
    this.classList.toggle("desc", state.desc);
    renderRows();
  });

  /* -------------------------------------------------------
     Row actions
  ------------------------------------------------------- */
  function toggleFav(id) {
    var l = linkById(id);
    if (!l) return;
    l.fav = !l.fav;
    render();
    saveDoc();
  }

  rowsEl.addEventListener("click", function (e) {
    var fav = e.target.closest(".fav-btn");
    if (fav) { toggleFav(fav.dataset.id); return; }

    var kebab = e.target.closest(".row-menu-btn");
    if (kebab) {
      e.stopPropagation();
      if (menuId === kebab.dataset.id) closeRowMenu();
      else openRowMenu(kebab);
    }
    /* The title is an anchor; the browser handles it. */
  });

  /* One panel, repositioned per row — right-aligned under its button. */
  var rowMenu = $("#rowMenu"), menuId = null, menuBtn = null;

  function openRowMenu(btn) {
    closeRowMenu();
    menuId = btn.dataset.id;
    menuBtn = btn;

    var l = linkById(menuId);
    rowMenu.querySelector('[data-act="fav"]').textContent =
      l && l.fav ? "Remove from favorites" : "Add to favorites";

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

  rowMenu.addEventListener("click", function (e) {
    var item = e.target.closest(".menu-item");
    if (!item) return;
    var act = item.dataset.act, id = menuId, l = linkById(id);
    closeRowMenu();
    if (!l) return;

    if (act === "edit") openModal(id);
    else if (act === "open") window.open(l.url, "_blank", "noopener");
    else if (act === "fav") toggleFav(id);
    else if (act === "copy") {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(l.url)
          .then(function () { toast("ok", "URL copied"); })
          .catch(function () { toast("warn", "Couldn\u2019t copy \u2014 " + l.url); });
      } else toast("warn", l.url);
    }
  });

  /* Anything outside closes whatever's floating. */
  document.addEventListener("click", function (e) {
    if (menuId && !rowMenu.contains(e.target)) closeRowMenu();
    if (catDrop.classList.contains("open") && !catDrop.contains(e.target)) closeCatDrop();
  });
  document.addEventListener("scroll", closeRowMenu, { passive: true });
  window.addEventListener("resize", closeRowMenu);

  /* -------------------------------------------------------
     Modal. One panel, reused. Always opens ready to edit,
     because there's nothing to read here that the row
     doesn't already show.
  ------------------------------------------------------- */
  var overlay = $("#overlay");
  var deleteBtn = $("#deleteBtn"), saveBtn = $("#saveBtn"), cancelBtn = $("#cancelBtn");
  var fFav = $("#fFav");

  var current = null;      /* the record being edited */
  var isDraft = false;     /* a new link, not in DOC.links until saved */
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
    }).join("");
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
     the link is saved — otherwise cancelling out of the modal would take
     the category with it, and the picker would lie about what exists. */
  var newCatInput = $("#fNewCat");

  function addCategory() {
    var name = newCatInput.value.trim();
    if (!name) { newCatInput.focus(); return; }

    /* Already there under any casing? Just tick it. */
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
    /* Enter adds the category; it must not reach the form and save the link. */
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

  function openModal(id) {
    var l = id ? linkById(id) : null;
    isDraft = !l;
    current = l || { id: "l" + Date.now().toString(36), title: "", url: "", cats: [], desc: "", fav: false };

    $("#modalTitle").textContent = isDraft ? "Add link" : "Edit link";
    $("#fTitle").value = current.title || "";
    $("#fUrl").value = current.url || "";
    $("#fDesc").value = current.desc || "";
    draftCats = new Set(catsOf(current));
    newCatInput.value = "";
    setFavSwitch(!!current.fav);
    renderCatPicker();

    deleteBtn.hidden = isDraft;
    resetDelete();

    lastFocus = document.activeElement;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    $("#fTitle").focus();
  }

  /* The nav's New → Link calls this. If the file hasn't landed yet the
     request waits for it rather than opening an empty category picker. */
  var pendingDraft = false;
  window.LinkPage = {
    openDraft: function () {
      if (loaded) openModal(null); else pendingDraft = true;
    }
  };

  /* Same request, arriving as a URL because the nav was on another page. */
  function draftWasRequested() {
    return /(^|[?&])new=link(&|$)/.test(location.search);
  }

  function closeModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    current = null;
    isDraft = false;
    resetDelete();
    if (lastFocus) lastFocus.focus();
  }

  saveBtn.addEventListener("click", function () {
    var url = normalizeUrl($("#fUrl").value);
    if (!url) {
      toast("error", "A link needs a URL");
      $("#fUrl").focus();
      return;
    }

    current.title = $("#fTitle").value.trim() || hostOf(url);
    current.url = url;
    current.desc = $("#fDesc").value.trim();
    current.cats = DOC.categories                       /* keep the file's order, not click order */
      .filter(function (c) { return draftCats.has(c.id); })
      .map(function (c) { return c.id; });
    current.fav = draftFav;

    if (isDraft) { DOC.links.push(current); isDraft = false; }

    closeModal();
    renderCatDrop();
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
    var i = DOC.links.indexOf(current);
    if (i > -1) DOC.links.splice(i, 1);
    closeModal();
    renderCatDrop();
    render();
    saveDoc();
  });

  cancelBtn.addEventListener("click", closeModal);
  $("#addBtn").addEventListener("click", function () { openModal(null); });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
  });

  /* Escape closes the topmost thing: menu, then dropdown, then modal. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (menuId) { var btn = menuBtn; closeRowMenu(); if (btn) btn.focus(); return; }
    if (catDrop.classList.contains("open")) { closeCatDrop(); catBtn.focus(); return; }
    if (current) closeModal();
  });

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
      DOC.links = DOC.links || [];
      indexCats();
      loaded = true;
      renderCatDrop();
      render();
      status();

      if (pendingDraft || draftWasRequested()) {
        pendingDraft = false;
        /* Drop the marker so a refresh doesn't reopen the modal. */
        if (history.replaceState) {
          history.replaceState(null, "", location.pathname + location.hash);
        }
        openModal(null);
      }
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
