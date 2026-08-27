/* =========================================================
   TASKS — dashboard

   Read-only. It reports on tasks-data.json; the board is where
   the file gets written. Everything on the screen is derived,
   so a new column in the file turns up here on its own.

   First pass by design — the counts and the "needs a look"
   table are a starting point, not a decision.
   ========================================================= */
(function () {
  var S = window.TaskStore;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return S.esc(s); };

  var ICON_CAL =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/>' +
    '<line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="6"/>' +
    '<line x1="16" y1="3" x2="16" y2="6"/></svg>';

  /* -------------------------------------------------------
     Counts across the top
  ------------------------------------------------------- */
  function openTasks() { return S.DOC.tasks.filter(S.isOpen); }

  function renderStats() {
    var open = openTasks();

    var late = open.filter(function (t) {
      var n = S.daysUntil(t.due);
      return n !== null && n < 0;
    }).length;

    var week = open.filter(function (t) {
      var n = S.daysUntil(t.due);
      return n !== null && n >= 0 && n <= 7;
    }).length;

    /* Counts when work finished, not how many sit in the column, so the
       number moves as the week rolls forward. */
    var doneWeek = S.completedWithin(7).length;

    var cards = [
      { label: "Open",                value: open.length, note: "Active and pending together" },
      { label: "Overdue",             value: late,      color: "#f43f5e", note: late ? "Past their due date" : "Nothing is late" },
      { label: "Due this week",       value: week,      color: "#f97316", note: "Open, inside seven days" },
      { label: "Complete this week",  value: doneWeek,  color: "#34d399", note: "Complete in the last seven days" }
    ];

    $("#stats").innerHTML = cards.map(function (c) {
      /* Zero never lights up — an unlit count is the quiet default. */
      var lit = c.color && c.value > 0;
      return '<div class="card stat">' +
               '<span class="label-caps">' + esc(c.label) + "</span>" +
               '<p class="stat-value' + (lit ? " stat-value-lit" : "") + '"' +
                 (lit ? ' style="--stat-color:' + esc(c.color) + '"' : "") + ">" + c.value + "</p>" +
               '<p class="stat-note">' + esc(c.note) + "</p>" +
             "</div>";
    }).join("");
  }

  /* -------------------------------------------------------
     The table: two views over the same open tasks

     One is about time — late, or landing inside a week. The other is
     about importance. Same columns either way, so switching tabs
     doesn't reshape the table under you.
  ------------------------------------------------------- */
  var tab = "attention";

  var TABS = {
    attention: {
      rows: function () {
        return openTasks()
          .filter(function (t) {
            var n = S.daysUntil(t.due);
            return n !== null && n <= 7;
          })
          .sort(function (a, b) { return S.daysUntil(a.due) - S.daysUntil(b.due); });
      },
      empty: ["Nothing is late", "Nothing open is due inside the next week either."]
    },
    high: {
      /* Open only — a finished job isn't urgent, whatever it's flagged. */
      rows: function () {
        return openTasks()
          .filter(function (t) { return t.priority === "high"; })
          .sort(function (a, b) {
            /* Dated first, soonest at the top; undated after. */
            var x = S.daysUntil(a.due), y = S.daysUntil(b.due);
            if (x === null && y === null) {
              return String(a.title).localeCompare(String(b.title),
                undefined, { sensitivity: "base" });
            }
            if (x === null) return 1;
            if (y === null) return -1;
            return x - y;
          });
      },
      empty: ["Nothing urgent", "No open task is set to high priority."]
    }
  };

  function renderAttention() {
    var view = TABS[tab];
    var rows = view.rows();

    $("#attentionRows").innerHTML = rows.map(function (t) {
      var st = S.statusOf(t);
      var due = S.dueInfo(t);
      /* The dashboard reports; it doesn't edit. The title hands off to
         the table view, which already owns the task form. */
      return "<tr>" +
               '<td class="cell-primary">' +
                 '<a class="attention-title" href="tasks-all.html#task=' +
                   encodeURIComponent(t.id) + '">' + esc(t.title) + "</a>" +
                 (t.desc ? '<span class="attention-desc">' + esc(t.desc) + "</span>" : "") +
               "</td>" +
               '<td class="col-hide-sm">' +
                 '<span class="tag" style="--tag-color:' + esc(st.color) + '">' + esc(st.label) + "</span>" +
               "</td>" +
               "<td>" + dueChip(due) + "</td>" +
             "</tr>";
    }).join("");

    $("#attentionCount").textContent = rows.length
      ? rows.length + (rows.length === 1 ? " task" : " tasks")
      : "";

    var empty = $("#attentionEmpty");
    empty.classList.toggle("show", rows.length === 0);
    if (rows.length === 0 && S.loaded) {
      empty.querySelector("strong").textContent = view.empty[0];
      empty.querySelector("span").textContent = view.empty[1];
    }
  }

  $("#dashTabs").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-tab]");
    if (!btn || btn.dataset.tab === tab) return;
    tab = btn.dataset.tab;
    [].forEach.call(this.querySelectorAll("[data-tab]"), function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    renderAttention();
  });

  function dueChip(due) {
    if (!due) return "";
    return '<span class="due-chip is-' + due.tone + '">' + ICON_CAL +
             "<span>" + esc(due.text) + "</span>" +
           "</span>";
  }

  /* -------------------------------------------------------
     Where the work is sitting
  ------------------------------------------------------- */
  /* Open columns show everything sitting in them. Closed columns show
     only what landed there in the last month, so the breakdown stays
     about current work instead of growing forever. */
  var CLOSED_WINDOW_DAYS = 30;

  function renderSplit() {
    var counts = S.DOC.statuses.map(function (st) {
      return { st: st, n: S.statusWindowCount(st.id, CLOSED_WINDOW_DAYS) };
    });

    /* The bars are relative to what's shown, not to every task ever —
       otherwise trimming the closed columns would shrink every bar. */
    var total = counts.reduce(function (sum, c) { return sum + c.n; }, 0) || 1;

    $("#split").innerHTML = counts.map(function (c) {
      var pct = Math.round((c.n / total) * 100);
      var windowed = !S.isOpen({ status: c.st.id });
      return '<div class="split-row" style="--dot-color:' + esc(c.st.color) + '">' +
               '<div class="split-top">' +
                 '<span class="dot"></span>' +
                 '<span class="split-label">' + esc(c.st.label) +
                   (windowed ? '<span class="split-window">30d</span>' : "") +
                 "</span>" +
                 '<span class="split-count">' + c.n + "</span>" +
               "</div>" +
               '<div class="split-bar"><span style="width:' + pct + '%"></span></div>' +
             "</div>";
    }).join("");
  }

  function render() {
    var n = S.DOC.tasks.length;
    $("#count").textContent = n + (n === 1 ? " task" : " tasks");
    renderStats();
    renderAttention();
    renderSplit();
  }

  /* -------------------------------------------------------
     Go
  ------------------------------------------------------- */
  S.load(render, function () {
    var empty = $("#attentionEmpty");
    empty.classList.add("show");
    empty.querySelector("strong").textContent = "Couldn\u2019t load " + S.FILE;
    empty.querySelector("span").textContent =
      "Keep it in the same folder as this page, and open the page through a server rather than as a file.";
  });
})();
