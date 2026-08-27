/* =========================================================
   TASKS — the board

   Columns come from tasks-data.json, not from the markup, so
   adding a fifth status to the file adds a fifth column here.

   Dragging is done with pointer events rather than HTML5 drag
   and drop: one code path that works for a mouse and a finger.
   On a touch screen only the grip starts a drag, so the board
   can still be scrolled by swiping across a card.
   ========================================================= */
(function () {
  var S = window.TaskStore;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return S.esc(s); };

  var board = $("#board");
  var emptyEl = $("#emptyState");

  var ICON_GRIP =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">' +
    '<circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>' +
    '<circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>' +
    '<circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';

  var ICON_CAL =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/>' +
    '<line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="6"/>' +
    '<line x1="16" y1="3" x2="16" y2="6"/></svg>';

  /* -------------------------------------------------------
     Render
  ------------------------------------------------------- */
  function cardHtml(t) {
    var st = S.statusOf(t);
    var due = S.dueInfo(t);
    var done = !S.isOpen(t);

    var pri = S.priorityOf(t);

    return '<article class="card task-card' + (done ? " is-done" : "") + '" ' +
             'data-id="' + esc(t.id) + '" style="--col:' + esc(st.color) + '" ' +
             'tabindex="0" role="button" aria-label="' + esc(t.title) +
             (pri ? ", " + esc(pri.label) + " priority" : "") + '">' +
             '<div class="task-card-top">' +
               '<span class="tag" style="--tag-color:' + esc(st.color) + '">' + esc(st.label) + "</span>" +
               (pri ? '<span class="pri-chip" style="--pri:' + esc(pri.color) + '">' +
                        esc(pri.label) + "</span>" : "") +
               '<span class="task-card-spacer"></span>' +
               '<button class="icon-btn task-grip" type="button" tabindex="-1" ' +
                 'aria-label="Drag to another column">' + ICON_GRIP +
               "</button>" +
             "</div>" +
             '<h3 class="task-title">' + esc(t.title) + "</h3>" +
             '<p class="task-desc">' + esc(t.desc) + "</p>" +
             '<p class="task-due">' + (due
               ? '<span class="due-chip is-' + due.tone + '">' + ICON_CAL +
                   "<span>" + esc(due.text) + "</span></span>"
               : "") + "</p>" +
           "</article>";
  }

  function render() {
    board.style.setProperty("--cols", S.DOC.statuses.length || 1);

    board.innerHTML = S.DOC.statuses.map(function (st) {
      var list = S.tasksIn(st.id);
      /* Most urgent first, then soonest, then anything without a date. */
      list.sort(function (a, b) {
        var p = S.priorityRank(a) - S.priorityRank(b);
        if (p) return p;
        var x = S.daysUntil(a.due), y = S.daysUntil(b.due);
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return x - y;
      });

      return '<section class="kanban-col" data-status="' + esc(st.id) + '" ' +
               'style="--col:' + esc(st.color) + '" aria-label="' + esc(st.label) + '">' +
               '<header class="col-head">' +
                 '<span class="dot"></span>' +
                 '<span class="col-name">' + esc(st.label) + "</span>" +
                 '<span class="col-count">' + list.length + "</span>" +
               "</header>" +
               '<div class="col-body">' +
                 (list.length
                   ? list.map(cardHtml).join("")
                   : '<p class="col-empty">Drop something here</p>') +
               "</div>" +
             "</section>";
    }).join("");

    var n = S.DOC.tasks.length;
    $("#count").textContent = n + (n === 1 ? " task" : " tasks");
    emptyEl.classList.toggle("show", n === 0);
    board.hidden = n === 0;
  }

  function moveTask(id, statusId) {
    var t = S.taskById(id);
    if (!t || t.status === statusId) return false;
    S.applyStatus(t, statusId);
    render();
    S.save();
    return true;
  }

  function focusCard(id) {
    var el = board.querySelector('.task-card[data-id="' + id + '"]');
    if (el) el.focus();
  }

  /* -------------------------------------------------------
     Dragging

     The card stays where it is and dims; what follows the
     pointer is a clone. Nothing lights up except the column
     the card would land in.
  ------------------------------------------------------- */
  var drag = null;
  var suppressClick = false;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");

  board.addEventListener("pointerdown", function (e) {
    if (e.button != null && e.button !== 0) return;

    var card = e.target.closest(".task-card");
    if (!card) return;

    /* Without a mouse, only the grip starts a drag — otherwise
       swiping the board sideways would fling cards around. */
    var onGrip = !!e.target.closest(".task-grip");
    if (!onGrip && !fine.matches) return;
    if (onGrip) e.preventDefault();

    var rect = card.getBoundingClientRect();
    drag = {
      id: card.dataset.id,
      card: card,
      x0: e.clientX, y0: e.clientY,
      ox: e.clientX - rect.left,
      oy: e.clientY - rect.top,
      w: rect.width, h: rect.height,
      moved: false, ghost: null, target: null
    };
  });

  function startDrag() {
    drag.moved = true;

    var ghost = drag.card.cloneNode(true);
    ghost.classList.add("task-ghost");
    ghost.removeAttribute("tabindex");
    ghost.style.width = drag.w + "px";
    ghost.style.height = drag.h + "px";
    document.body.appendChild(ghost);

    drag.ghost = ghost;
    drag.card.classList.add("dragging");
    document.body.classList.add("dragging-task");
  }

  function moveGhost(x, y) {
    drag.ghost.style.left = (x - drag.ox) + "px";
    drag.ghost.style.top = (y - drag.oy) + "px";

    /* The ghost has pointer-events: none, so this reads through it. */
    var under = document.elementFromPoint(x, y);
    var col = under && under.closest ? under.closest(".kanban-col") : null;

    if (col === drag.target) return;
    if (drag.target) drag.target.classList.remove("drop-target");
    drag.target = col;
    if (col) col.classList.add("drop-target");
  }

  document.addEventListener("pointermove", function (e) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 6) return;
      startDrag();
    }
    if (e.cancelable) e.preventDefault();
    moveGhost(e.clientX, e.clientY);
  }, { passive: false });

  function endDrag(commit) {
    if (!drag) return;
    var d = drag;
    drag = null;

    if (!d.moved) return;

    if (d.ghost) d.ghost.remove();
    d.card.classList.remove("dragging");
    if (d.target) d.target.classList.remove("drop-target");
    document.body.classList.remove("dragging-task");

    /* A drag that ends is never also a click. */
    suppressClick = true;

    if (commit && d.target) {
      if (moveTask(d.id, d.target.dataset.status)) focusCard(d.id);
    }
  }

  document.addEventListener("pointerup", function () { endDrag(true); });
  document.addEventListener("pointercancel", function () { endDrag(false); });

  /* -------------------------------------------------------
     Click and keyboard
  ------------------------------------------------------- */
  board.addEventListener("click", function (e) {
    if (suppressClick) return;
    if (e.target.closest(".task-grip")) return;
    var card = e.target.closest(".task-card");
    if (card) openModal(card.dataset.id);
  });

  /* Runs after the handler above, and runs even when the drag ended
     somewhere off the board — so the flag never outlives its drag. */
  document.addEventListener("click", function () { suppressClick = false; });

  /* Arrow keys are the drag for anyone not using a pointer. */
  board.addEventListener("keydown", function (e) {
    var card = e.target.closest && e.target.closest(".task-card");
    if (!card) return;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openModal(card.dataset.id);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

    var t = S.taskById(card.dataset.id);
    if (!t) return;
    var ids = S.DOC.statuses.map(function (s) { return s.id; });
    var i = ids.indexOf(t.status) + (e.key === "ArrowRight" ? 1 : -1);
    if (i < 0 || i >= ids.length) return;

    e.preventDefault();
    if (moveTask(t.id, ids[i])) focusCard(t.id);
  });

  /* -------------------------------------------------------
     Modal
  ------------------------------------------------------- */
  var overlay = $("#overlay"),
      deleteBtn = $("#deleteBtn"),
      confirmTimer, lastFocus;

  var current = null, isDraft = false, draftStatus = null, draftPriority = null;

  /* Same shape as the column picker, so the two read as one pair. */
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

  $("#fPriority").addEventListener("click", function (e) {
    var btn = e.target.closest(".cat-option");
    if (!btn) return;
    draftPriority = btn.dataset.priority;
    renderPriorityPicker();
  });

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

  $("#fStatus").addEventListener("click", function (e) {
    var btn = e.target.closest(".cat-option");
    if (!btn) return;
    draftStatus = btn.dataset.status;
    renderStatusPicker();
  });

  function firstStatus() {
    return S.DOC.statuses.length ? S.DOC.statuses[0].id : "active";
  }

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
    draftPriority = current.priority || S.defaultPriority();
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

  /* The nav's New → Task calls this. If the file hasn't landed yet
     the request waits for it rather than opening an empty picker. */
  var pendingDraft = false;
  window.TaskBoard = {
    openDraft: function () {
      if (S.loaded) openModal(null); else pendingDraft = true;
    }
  };

  /* Same request, arriving as a URL because the nav was on another page. */
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

    closeModal();
    render();
    S.save();
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
    var i = S.DOC.tasks.indexOf(current);
    if (i > -1) S.DOC.tasks.splice(i, 1);
    closeModal();
    render();
    S.save();
  });

  $("#cancelBtn").addEventListener("click", closeModal);
  $("#addBtn").addEventListener("click", function () { openModal(null); });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && current) closeModal();
  });

  /* -------------------------------------------------------
     Go
  ------------------------------------------------------- */
  S.load(function () {
    render();

    if (pendingDraft || draftWasRequested()) {
      pendingDraft = false;
      /* Drop the marker so a refresh doesn't reopen the modal. */
      if (history.replaceState) {
        history.replaceState(null, "", location.pathname + location.hash);
      }
      openModal(null);
    }
  }, function () {
    $("#addBtn").disabled = true;
    board.hidden = true;
    emptyEl.classList.add("show");
    emptyEl.querySelector("strong").textContent = "Couldn\u2019t load " + S.FILE;
    emptyEl.querySelector("span").textContent =
      "Keep it in the same folder as this page, and open the page through a server rather than as a file.";
  });
})();
