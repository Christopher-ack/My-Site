/* =========================================================
   ALL TASKS — the table

   The board's companion. Same file, same store, same modal
   fields; what differs is that this one shows every task at
   once, sorted and filtered, rather than sorted into columns.

   Nothing here writes its own copy of the data rules — the
   status colors, the priority ranks, the date arithmetic and
   the saving all come from tasks-store.js, so the two pages
   can't drift apart.
   ========================================================= */
(function () {
  var S = window.TaskStore;
  var $ = function (s) { return document.querySelector(s); };
  var esc = S.esc;

  var rowsEl = $("#rows"),
      emptyEl = $("#emptyState"),
      overlay = $("#overlay"),
      deleteBtn = $("#deleteBtn");

  var ICON_KEBAB =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">' +
    '<circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/>' +
    '<circle cx="12" cy="19" r="1.8"/></svg>';

  var ICON_CAL =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round">' +
    '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>' +
    '<line x1="8" y1="3" x2="8" y2="6"/><line x1="16" y1="3" x2="16" y2="6"/></svg>';

  /* -------------------------------------------------------
     Filter and sort state

     Both filters start with everything lit, which is the same
     rule the Demos rail uses: nothing lit means no filter, so
     turning the last one off brings everything back.
  ------------------------------------------------------- */
  var state = {
    statuses: new Set(),
    priorities: new Set(),
    query: "",
    sort: "title",
    dir: 1
  };

  function allStatusIds() { return S.DOC.statuses.map(function (s) { return s.id; }); }
  function allPriorityIds() {
    /* "None" is a real answer for a task written before the field
       existed, so it gets an entry rather than being unreachable. */
    return S.DOC.priorities.map(function (p) { return p.id; }).concat(["_none"]);
  }
  function priorityKey(t) { return t.priority || "_none"; }

  function shown() {
    var q = state.query.trim().toLowerCase();

    var list = S.DOC.tasks.filter(function (t) {
      if (!state.statuses.has(t.status)) return false;
      if (!state.priorities.has(priorityKey(t))) return false;
      if (!q) return true;
      return (t.title || "").toLowerCase().indexOf(q) > -1 ||
             (t.desc || "").toLowerCase().indexOf(q) > -1;
    });

    var dir = state.dir;
    list.sort(function (a, b) {
      var r = 0;
      if (state.sort === "title") {
        r = String(a.title || "").localeCompare(String(b.title || ""),
              undefined, { sensitivity: "base" });
      } else if (state.sort === "priority") {
        r = S.priorityRank(a) - S.priorityRank(b);
      } else if (state.sort === "status") {
        r = allStatusIds().indexOf(a.status) - allStatusIds().indexOf(b.status);
      } else if (state.sort === "due") {
        /* No date sorts last either way, so ascending and descending
           are both about the tasks that actually have one. */
        var x = S.daysUntil(a.due), y = S.daysUntil(b.due);
        if (x === null && y === null) r = 0;
        else if (x === null) return 1;
        else if (y === null) return -1;
        else r = x - y;
      }
      /* A stable tie-break keeps rows from swapping on re-render. */
      if (!r) r = String(a.id).localeCompare(String(b.id));
      return r * dir;
    });

    return list;
  }

  /* -------------------------------------------------------
     Render
  ------------------------------------------------------- */
  function rowHtml(t) {
    var st = S.statusOf(t);
    var pri = S.priorityOf(t);
    var due = S.dueInfo(t);
    var done = !S.isOpen(t);

    return '<tr class="task-row' + (done ? " is-done" : "") + '" data-id="' + esc(t.id) + '">' +
             '<td class="cell-primary">' +
               '<button class="task-row-title" type="button" data-open="' + esc(t.id) + '">' +
                 esc(t.title || "Untitled task") +
               "</button>" +
               (t.desc ? '<span class="task-row-desc">' + esc(t.desc) + "</span>" : "") +
               /* Narrow screens fold the middle columns away, so the same
                  two facts come back here rather than disappearing. */
               '<span class="task-inline-meta">' +
                 esc(st.label) + (pri ? " \u00b7 " + esc(pri.label) : "") +
               "</span>" +
             "</td>" +
             "<td>" +
               '<span class="tag" style="--tag-color:' + esc(st.color) + '">' +
                 esc(st.label) + "</span>" +
             "</td>" +
             "<td>" + (pri
               ? '<span class="pri-chip" style="--pri:' + esc(pri.color) + '">' +
                   esc(pri.label) + "</span>"
               : '<span class="cell-none">—</span>') + "</td>" +
             "<td>" + (due
               ? '<span class="due-chip is-' + due.tone + '">' + ICON_CAL +
                   "<span>" + esc(due.text) + "</span></span>"
               : '<span class="cell-none">—</span>') + "</td>" +
             '<td class="cell-right">' +
               '<button class="icon-btn row-menu-btn" type="button" data-id="' + esc(t.id) + '" ' +
                 'aria-haspopup="true" aria-expanded="false" aria-label="Task actions">' +
                 ICON_KEBAB +
               "</button>" +
             "</td>" +
           "</tr>";
  }

  function render() {
    var list = shown();
    rowsEl.innerHTML = list.map(rowHtml).join("");

    var n = list.length, all = S.DOC.tasks.length;
    $("#count").textContent = n === all
      ? n + (n === 1 ? " task" : " tasks")
      : n + " of " + all;

    emptyEl.classList.toggle("show", n === 0);
    renderSortHeaders();
    renderFilterButtons();
  }

  function renderSortHeaders() {
    [].forEach.call(document.querySelectorAll(".sort-header"), function (b) {
      var on = b.dataset.sort === state.sort;
      b.classList.toggle("active", on);
      b.classList.toggle("desc", on && state.dir === -1);
      b.setAttribute("aria-sort", on ? (state.dir === 1 ? "ascending" : "descending") : "none");
    });
  }

  /* The button says what's on when it isn't everything. Same shape the
     Links and Scripts pages use for their Categories button — the word,
     then a dot, then how many are lit. */
  function filterLabel(word, on, all) {
    return on === all ? word : word + " \u00b7 " + on;
  }

  function renderFilterButtons() {
    $("#statusBtnLabel").textContent =
      filterLabel("Status", state.statuses.size, allStatusIds().length);
    $("#priBtnLabel").textContent =
      filterLabel("Priority", state.priorities.size, allPriorityIds().length);
  }

  function renderDrops() {
    $("#statusDrop").innerHTML = S.DOC.statuses.map(function (st) {
      var on = state.statuses.has(st.id);
      var n = S.tasksIn(st.id).length;
      return '<button class="option-row" type="button" data-status="' + esc(st.id) + '" ' +
               'style="--dot-color:' + esc(st.color) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
               '<span class="dot' + (on ? " on" : "") + '"></span>' +
               '<span class="option-label">' + esc(st.label) + "</span>" +
               '<span class="filter-count">' + n + "</span>" +
             "</button>";
    }).join("");

    var rows = S.DOC.priorities.map(function (p) {
      var on = state.priorities.has(p.id);
      var n = S.tasksWithPriority(p.id).length;
      return '<button class="option-row" type="button" data-priority="' + esc(p.id) + '" ' +
               'style="--dot-color:' + esc(p.color) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
               '<span class="dot' + (on ? " on" : "") + '"></span>' +
               '<span class="option-label">' + esc(p.label) + "</span>" +
               '<span class="filter-count">' + n + "</span>" +
             "</button>";
    });

    /* Only offered when something actually has no priority. */
    var none = S.tasksWithPriority(null).length;
    if (none) {
      var onNone = state.priorities.has("_none");
      rows.push('<button class="option-row" type="button" data-priority="_none" ' +
                  'style="--dot-color:#56637d" aria-pressed="' + (onNone ? "true" : "false") + '">' +
                  '<span class="dot' + (onNone ? " on" : "") + '"></span>' +
                  '<span class="option-label">Not set</span>' +
                  '<span class="filter-count">' + none + "</span>" +
                "</button>");
    }
    $("#priDrop").innerHTML = rows.join("");
  }

  /* -------------------------------------------------------
     Filters

     All on: clicking one means "just this". Turning the last
     one off is the same as no filter, so everything returns.
  ------------------------------------------------------- */
  function toggleIn(set, id, all) {
    if (set.size === all.length) { set.clear(); set.add(id); return; }
    if (set.has(id)) {
      set.delete(id);
      if (!set.size) all.forEach(function (x) { set.add(x); });
    } else set.add(id);
  }

  $("#statusDrop").addEventListener("click", function (e) {
    var b = e.target.closest("[data-status]");
    if (!b) return;
    toggleIn(state.statuses, b.dataset.status, allStatusIds());
    renderDrops();
    render();
    writeHash();
  });

  $("#priDrop").addEventListener("click", function (e) {
    var b = e.target.closest("[data-priority]");
    if (!b) return;
    toggleIn(state.priorities, b.dataset.priority, allPriorityIds());
    renderDrops();
    render();
    writeHash();
  });

  /* Two dropdowns, so opening one closes the other. */
  function closeDrops(except) {
    [["#statusBtn", "#statusDrop"], ["#priBtn", "#priDrop"]].forEach(function (pair) {
      if (pair[0] === except) return;
      $(pair[1]).classList.remove("open");
      $(pair[0]).setAttribute("aria-expanded", "false");
    });
  }

  [["#statusBtn", "#statusDrop"], ["#priBtn", "#priDrop"]].forEach(function (pair) {
    $(pair[0]).addEventListener("click", function (e) {
      e.stopPropagation();
      closeDrops(pair[0]);
      var open = $(pair[1]).classList.toggle("open");
      $(pair[0]).setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".popover-wrap")) closeDrops();
  });

  $("#search").addEventListener("input", function () {
    state.query = this.value;
    render();
    writeHashSoon();
  });

  [].forEach.call(document.querySelectorAll(".sort-header"), function (b) {
    b.addEventListener("click", function () {
      var key = b.dataset.sort;
      /* Same column again flips the direction; a new one starts ascending. */
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = 1; }
      render();
      writeHash();
    });
  });

  /* -------------------------------------------------------
     The view in the URL

     A filtered table is worth keeping, so the state goes in the
     hash: copy the address and you've saved the view. Only what
     differs from the default is written, so an unfiltered table
     has a clean URL rather than a line of noise.

     replaceState rather than pushState — otherwise every keystroke
     in the search box would become a separate back-button step.
  ------------------------------------------------------- */
  var DEFAULT_SORT = "title", DEFAULT_DIR = 1;
  var lastHash = "";            /* so our own writes don't re-trigger a read */
  var hashTimer = null;

  function buildHash() {
    var parts = [];

    if (state.statuses.size !== allStatusIds().length) {
      parts.push("status=" + allStatusIds()
        .filter(function (id) { return state.statuses.has(id); })
        .map(encodeURIComponent).join(","));
    }
    if (state.priorities.size !== allPriorityIds().length) {
      parts.push("priority=" + allPriorityIds()
        .filter(function (id) { return state.priorities.has(id); })
        .map(encodeURIComponent).join(","));
    }
    if (state.query.trim()) parts.push("q=" + encodeURIComponent(state.query.trim()));
    if (state.sort !== DEFAULT_SORT) parts.push("sort=" + encodeURIComponent(state.sort));
    if (state.dir !== DEFAULT_DIR) parts.push("dir=desc");

    return parts.join("&");
  }

  function writeHash() {
    var h = buildHash();
    if (h === lastHash) return;
    lastHash = h;
    var url = location.pathname + location.search + (h ? "#" + h : "");
    if (history.replaceState) history.replaceState(null, "", url);
    else if (h) location.hash = h;
  }

  /* Search runs on every keystroke, so its writes are held back a beat. */
  function writeHashSoon() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHash, 250);
  }

  /* Anything unrecognised is ignored rather than fatal — a hand-edited
     or out-of-date link should still land on a usable table. */
  function readHash() {
    var raw = location.hash.replace(/^#/, "");
    lastHash = raw;

    var q = {};
    raw.split("&").forEach(function (bit) {
      if (!bit) return;
      var eq = bit.indexOf("=");
      var k = eq < 0 ? bit : bit.slice(0, eq);
      var v = eq < 0 ? "" : bit.slice(eq + 1);
      try { q[k] = decodeURIComponent(v); } catch (e) { q[k] = v; }
    });

    function fill(set, param, all) {
      set.clear();
      var want = (q[param] || "").split(",").filter(Boolean);
      want.forEach(function (id) { if (all.indexOf(id) > -1) set.add(id); });
      /* An empty or nonsense list means no filter, not an empty table. */
      if (!set.size) all.forEach(function (id) { set.add(id); });
    }

    fill(state.statuses, "status", allStatusIds());
    fill(state.priorities, "priority", allPriorityIds());

    state.query = q.q || "";
    $("#search").value = state.query;

    var sorts = ["title", "priority", "status", "due"];
    state.sort = sorts.indexOf(q.sort) > -1 ? q.sort : DEFAULT_SORT;
    state.dir = q.dir === "desc" ? -1 : DEFAULT_DIR;
  }

  /* Someone pasting a saved link into this same tab, or using back. */
  window.addEventListener("hashchange", function () {
    if (location.hash.replace(/^#/, "") === lastHash) return;
    readHash();
    renderDrops();
    render();
  });

  /* -------------------------------------------------------
     Row menu
  ------------------------------------------------------- */
  var rowMenu = $("#rowMenu"), menuId = null, menuBtn = null;

  function openRowMenu(btn) {
    closeRowMenu();
    menuId = btn.dataset.id;
    menuBtn = btn;
    rowMenu.classList.add("open");
    btn.setAttribute("aria-expanded", "true");

    var r = btn.getBoundingClientRect();
    var w = rowMenu.offsetWidth;
    rowMenu.style.top = (window.scrollY + r.bottom + 6) + "px";
    rowMenu.style.left = (window.scrollX + Math.max(8, r.right - w)) + "px";
    resetMenuDelete();
  }

  function closeRowMenu() {
    rowMenu.classList.remove("open");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
    menuId = null;
    menuBtn = null;
    resetMenuDelete();
  }

  var menuDeleteTimer;
  function resetMenuDelete() {
    clearTimeout(menuDeleteTimer);
    var b = rowMenu.querySelector('[data-act="delete"]');
    b.classList.remove("armed");
    b.textContent = "Delete task";
  }

  rowsEl.addEventListener("click", function (e) {
    var menu = e.target.closest(".row-menu-btn");
    if (menu) { e.stopPropagation(); openRowMenu(menu); return; }
    var open = e.target.closest("[data-open]");
    if (open) openModal(open.dataset.open);
  });

  rowMenu.addEventListener("click", function (e) {
    var item = e.target.closest(".menu-item");
    if (!item || !menuId) return;

    if (item.dataset.act === "edit") {
      var id = menuId;
      closeRowMenu();
      openModal(id);
      return;
    }

    if (item.dataset.act === "delete") {
      /* Arms in place — no dialog stacked on a menu. */
      if (!item.classList.contains("armed")) {
        item.classList.add("armed");
        item.textContent = "Delete for good?";
        menuDeleteTimer = setTimeout(resetMenuDelete, 4000);
        return;
      }
      var t = S.taskById(menuId);
      var i = S.DOC.tasks.indexOf(t);
      if (i > -1) S.DOC.tasks.splice(i, 1);
      closeRowMenu();
      render();
      renderDrops();
      S.save();
    }
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest("#rowMenu") && !e.target.closest(".row-menu-btn")) closeRowMenu();
  });
  document.addEventListener("scroll", closeRowMenu, { passive: true });

  /* -------------------------------------------------------
     The modal — the same fields the board offers
  ------------------------------------------------------- */
  var current = null, isDraft = false, draftStatus = null, draftPriority = null;
  var confirmTimer, lastFocus;

  function firstStatus() {
    return S.DOC.statuses.length ? S.DOC.statuses[0].id : "active";
  }

  function renderStatusPicker() {
    $("#fStatus").innerHTML = S.DOC.statuses.map(function (st) {
      var on = st.id === draftStatus;
      return '<button class="option-row cat-option" type="button" data-status="' + esc(st.id) + '" ' +
               'style="--dot-color:' + esc(st.color) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
               '<span class="dot' + (on ? " on" : "") + '"></span>' +
               '<span class="option-label">' + esc(st.label) + "</span>" +
             "</button>";
    }).join("");
  }

  function renderPriorityPicker() {
    $("#fPriority").innerHTML = S.DOC.priorities.map(function (p) {
      var on = p.id === draftPriority;
      return '<button class="option-row cat-option" type="button" data-priority="' + esc(p.id) + '" ' +
               'style="--dot-color:' + esc(p.color) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
               '<span class="dot' + (on ? " on" : "") + '"></span>' +
               '<span class="option-label">' + esc(p.label) + "</span>" +
             "</button>";
    }).join("");
  }

  $("#fStatus").addEventListener("click", function (e) {
    var b = e.target.closest(".cat-option");
    if (!b) return;
    draftStatus = b.dataset.status;
    renderStatusPicker();
  });

  $("#fPriority").addEventListener("click", function (e) {
    var b = e.target.closest(".cat-option");
    if (!b) return;
    /* Clicking the lit one clears it — a task may have no priority. */
    draftPriority = (draftPriority === b.dataset.priority) ? null : b.dataset.priority;
    renderPriorityPicker();
  });

  function openModal(id) {
    var t = id ? S.taskById(id) : null;
    isDraft = !t;
    current = t || { id: S.newId(), title: "", desc: "", due: null,
                     status: firstStatus(), priority: S.defaultPriority() };

    $("#modalTitle").textContent = isDraft ? "Add task" : "Edit task";
    $("#fTitle").value = current.title || "";
    $("#fDesc").value = current.desc || "";
    $("#fDue").value = current.due || "";
    draftStatus = current.status || firstStatus();
    draftPriority = current.priority || null;
    renderStatusPicker();
    renderPriorityPicker();

    deleteBtn.hidden = isDraft;
    resetDelete();

    lastFocus = document.activeElement;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    $("#fTitle").focus();
  }

  function closeModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    current = null;
    isDraft = false;
    resetDelete();
    if (lastFocus) lastFocus.focus();
  }

  /* The nav's New → Task calls this. If the file hasn't landed yet the
     request waits for it rather than opening an empty picker. */
  var pendingDraft = false;
  window.TaskBoard = {
    openDraft: function () {
      if (S.loaded) openModal(null); else pendingDraft = true;
    }
  };

  function draftWasRequested() {
    return /(^|[?&])new=task(&|$)/.test(location.search);
  }

  $("#clearDue").addEventListener("click", function () {
    $("#fDue").value = "";
    $("#fDue").focus();
  });

  $("#saveBtn").addEventListener("click", function () {
    var title = $("#fTitle").value.trim();
    if (!title) {
      S.toast("error", "A task needs a title");
      $("#fTitle").focus();
      return;
    }

    current.title = title;
    current.desc = $("#fDesc").value.trim();
    current.due = $("#fDue").value || null;
    S.applyStatus(current, draftStatus);
    current.priority = draftPriority || null;

    if (isDraft) { S.DOC.tasks.push(current); isDraft = false; }

    /* Don't file it out of sight: if a filter would hide what was just
       saved, let that filter go rather than the row vanishing. */
    if (!state.statuses.has(current.status)) state.statuses.add(current.status);
    if (!state.priorities.has(priorityKey(current))) state.priorities.add(priorityKey(current));

    closeModal();
    renderDrops();
    render();
    writeHash();                 /* saving can relax a filter */
    S.save();
  });

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
    var i = S.DOC.tasks.indexOf(current);
    if (i > -1) S.DOC.tasks.splice(i, 1);
    closeModal();
    renderDrops();
    render();
    S.save();
  });

  $("#cancelBtn").addEventListener("click", closeModal);
  $("#addBtn").addEventListener("click", function () { openModal(null); });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (current) closeModal();
    else if (rowMenu.classList.contains("open")) closeRowMenu();
    else closeDrops();
  });

  /* -------------------------------------------------------
     Go
  ------------------------------------------------------- */
  S.load(function () {
    allStatusIds().forEach(function (id) { state.statuses.add(id); });
    allPriorityIds().forEach(function (id) { state.priorities.add(id); });

    /* Read after loading, not before: the ids in the link can only be
       checked against the statuses and priorities the file actually has. */
    if (location.hash.length > 1) readHash();

    renderDrops();
    render();

    /* #task=<id> opens that task straight away. The dashboard's rows
       link here rather than carrying a second copy of this modal. */
    var want = /(?:^|&)task=([^&]+)/.exec(location.hash.replace(/^#/, ""));
    if (want) {
      var id = decodeURIComponent(want[1]);
      /* Drop it from the URL either way, so a reload doesn't reopen
         the modal and a copied link isn't stuck on one task. */
      lastHash = buildHash();
      if (history.replaceState) {
        history.replaceState(null, "",
          location.pathname + location.search + (lastHash ? "#" + lastHash : ""));
      }
      if (S.taskById(id)) openModal(id);
      else S.toast("error", "That task isn\u2019t in the file any more");
    }

    if (pendingDraft || draftWasRequested()) {
      pendingDraft = false;
      if (history.replaceState) {
        history.replaceState(null, "", location.pathname + location.hash);
      }
      openModal(null);
    }
  }, function () {
    $("#addBtn").disabled = true;
    emptyEl.classList.add("show");
    emptyEl.querySelector("strong").textContent = "Couldn\u2019t load " + S.FILE;
    emptyEl.querySelector("span").textContent =
      "Keep it in the same folder as this page, and open the page through a server rather than as a file.";
  });
})();
