/* =========================================================
   TASKS — shared store

   The section has two pages and one file behind them, so the
   loading, saving, status pill, and date arithmetic live here
   once instead of being copied into both.

   A page loads this first, then its own script, then calls
   TaskStore.load(onReady, onFail). Everything else is helpers.

   Saving works the way Links and Demos do: PUT the whole file
   back. A plain static host will refuse that, so the page keeps
   your edits for the session and hands you the updated file to
   swap in whenever you're done.
   ========================================================= */
(function () {
  var DATA_FILE = "tasks-data.json";

  var S = {
    FILE: DATA_FILE,
    DOC: { version: 1, updated: null, statuses: [], priorities: [], tasks: [] },
    loaded: false,
    unsaved: 0
  };

  var byId = {};
  var priById = {};
  var $ = function (s) { return document.querySelector(s); };

  /* -------------------------------------------------------
     Small stuff
  ------------------------------------------------------- */
  S.esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  function indexStatuses() {
    byId = {};
    S.DOC.statuses.forEach(function (st) { byId[st.id] = st; });
    priById = {};
    S.DOC.priorities.forEach(function (p) { priById[p.id] = p; });
  }

  /* A task whose status isn't in the file still has to render. */
  S.statusOf = function (task) {
    var id = task && task.status;
    return byId[id] || { id: id, label: id || "Unsorted", color: "#56637d" };
  };

  /* -------------------------------------------------------
     Priority

     Three levels, listed in the file with a rank so ordering is data
     rather than a list repeated on every page. A task without one is
     allowed — anything written before the field existed — and sorts
     after the ones that have it rather than being hidden.
  ------------------------------------------------------- */
  S.priorityOf = function (task) {
    var id = task && task.priority;
    return id ? (priById[id] || { id: id, label: id, color: "#56637d", rank: 9 }) : null;
  };

  S.priorityRank = function (task) {
    var p = S.priorityOf(task);
    return p ? p.rank : 99;
  };

  /* The middle of the list, so a new task doesn't claim to be urgent. */
  S.defaultPriority = function () {
    var list = S.DOC.priorities;
    if (!list.length) return null;
    return list[Math.min(1, list.length - 1)].id;
  };

  S.tasksWithPriority = function (id) {
    return S.DOC.tasks.filter(function (t) { return (t.priority || null) === id; });
  };

  S.taskById = function (id) {
    var t = S.DOC.tasks;
    for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
    return null;
  };

  S.tasksIn = function (statusId) {
    return S.DOC.tasks.filter(function (t) { return t.status === statusId; });
  };

  /* Columns that still represent work. Used by every count that
     says "open", so the dashboard and the board agree. */
  S.isOpen = function (task) {
    return task.status !== "complete" && task.status !== "canceled";
  };

  S.newId = function () { return "t" + Date.now().toString(36); };

  /* -------------------------------------------------------
     Changing status

     "Complete this week" needs to know when a task finished, and
     nothing in the file said. So moving a task into a closed column
     stamps completed; moving it back out clears it, because a
     reopened task hasn't been completed at all.

     Every page routes status changes through here — the board's drag
     and both modals — so the stamp can't be forgotten in one place
     and set in another.
  ------------------------------------------------------- */
  S.applyStatus = function (task, statusId) {
    var wasDone = !S.isOpen(task);
    task.status = statusId;
    var isDone = !S.isOpen(task);

    if (isDone && !wasDone) task.completed = new Date().toISOString();
    else if (!isDone && task.completed) delete task.completed;
  };

  /* Closed within a window. A closed task carries the stamp applyStatus
     wrote; one closed before the field existed has none, so it reads as
     old news rather than as recent. */
  S.closedWithin = function (statusId, days) {
    var cutoff = Date.now() - days * 86400000;
    return S.DOC.tasks.filter(function (t) {
      if (t.status !== statusId || !t.completed) return false;
      var when = Date.parse(t.completed);
      return !isNaN(when) && when >= cutoff;
    });
  };

  /* Finished, and finished recently. Canceled doesn't count as done —
     it's closed, not completed. */
  S.completedWithin = function (days) {
    return S.closedWithin("complete", days);
  };

  /* What a status contributes to a breakdown. An open column shows
     everything in it; a closed one only what landed there lately, so
     the picture stays about current work rather than growing forever. */
  S.statusWindowCount = function (statusId, days) {
    /* Asks isOpen rather than re-listing the closed ids, so there's one
       definition of "closed" in this file instead of two. */
    return S.isOpen({ status: statusId })
      ? S.tasksIn(statusId).length
      : S.closedWithin(statusId, days).length;
  };

  /* -------------------------------------------------------
     Dates

     Stored as plain "YYYY-MM-DD" — no time, no zone. Parsed
     into a local date so "due today" means today where you are
     rather than today in UTC.
  ------------------------------------------------------- */
  S.parseDue = function (str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };

  function today() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /* Whole days from today. Negative is in the past. */
  S.daysUntil = function (str) {
    var d = S.parseDue(str);
    if (!d) return null;
    return Math.round((d - today()) / 86400000);
  };

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  S.fmtDate = function (str) {
    var d = S.parseDue(str);
    if (!d) return "";
    var out = MONTHS[d.getMonth()] + " " + d.getDate();
    if (d.getFullYear() !== new Date().getFullYear()) out += ", " + d.getFullYear();
    return out;
  };

  /* The reading, not the date: "3 days late", "Today", "In 4 days".
     tone drives the color — only late and today get one. */
  S.dueInfo = function (task) {
    if (!task || !task.due) return null;
    var n = S.daysUntil(task.due);
    if (n === null) return null;

    var info = { days: n, date: S.fmtDate(task.due), tone: "later", text: "" };

    /* A finished or dropped task has no deadline left to miss. */
    if (!S.isOpen(task)) { info.tone = "done"; info.text = info.date; return info; }

    if (n < -1)      { info.tone = "late"; info.text = Math.abs(n) + " days late"; }
    else if (n === -1) { info.tone = "late"; info.text = "1 day late"; }
    else if (n === 0)  { info.tone = "now";  info.text = "Due today"; }
    else if (n === 1)  { info.tone = "soon"; info.text = "Due tomorrow"; }
    else if (n <= 7)   { info.tone = "soon"; info.text = "In " + n + " days"; }
    else               { info.tone = "later"; info.text = info.date; }
    return info;
  };

  /* -------------------------------------------------------
     Toast
  ------------------------------------------------------- */
  var toastTimer;

  S.toast = function (kind, text) {
    var el = $("#toast"), t = $("#toastText");
    if (!el) return;
    clearTimeout(toastTimer);
    el.className = "toast show is-" + kind;
    t.textContent = text;
    if (kind === "ok") toastTimer = setTimeout(function () {
      el.classList.remove("show");
    }, 2500);
  };

  function toastFallback() {
    var el = $("#toast"), t = $("#toastText");
    if (!el) return;
    clearTimeout(toastTimer);
    el.className = "toast show is-warn";
    t.innerHTML = 'Couldn\u2019t auto-save \u2014 <a href="#" id="toastDownload">download ' +
                  S.esc(DATA_FILE) + "</a>";
    $("#toastDownload").addEventListener("click", function (e) {
      e.preventDefault();
      S.download();
    });
  }

  /* -------------------------------------------------------
     The data pill: lit only when the page and the file agree
  ------------------------------------------------------- */
  S.status = function () {
    var dot = $("#dataDot"), label = $("#dataLabel");
    if (!dot || !label) return;

    if (!S.loaded) {
      dot.classList.remove("on");
      label.textContent = "Couldn\u2019t load " + DATA_FILE;
      return;
    }
    if (S.unsaved > 0) {
      dot.classList.add("on");
      dot.style.setProperty("--dot-color", "var(--accent-warn)");
      label.textContent = S.unsaved + (S.unsaved === 1 ? " change" : " changes") + " not in the file";
    } else {
      dot.classList.add("on");
      dot.style.setProperty("--dot-color", "var(--accent-b)");
      label.textContent = DATA_FILE;
    }
  };

  /* -------------------------------------------------------
     Save: PUT the file, or hand it over
  ------------------------------------------------------- */
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

  S.save = function () {
    var stamp = new Date().toISOString();
    S.DOC.updated = stamp;
    S.toast("pending", "Saving\u2026");

    fetch(DATA_FILE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(S.DOC, null, 2)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return confirmWrite(DATA_FILE, stamp);
    }).then(function () {
      S.unsaved = 0;
      S.status();
      S.toast("ok", "Saved to " + DATA_FILE);
    }).catch(function () {
      S.unsaved++;
      S.status();
      toastFallback();
    });
  };

  S.download = function () {
    var blob = new Blob([JSON.stringify(S.DOC, null, 2)], { type: "application/json" });
    var href = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = href;
    a.download = DATA_FILE;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
    S.toast("ok", "Downloaded " + DATA_FILE + " \u2014 swap it in to make it permanent");
  };

  /* -------------------------------------------------------
     Load, then hand control back to the page
  ------------------------------------------------------- */
  S.load = function (onReady, onFail) {
    var dl = $("#downloadBtn");
    if (dl) dl.addEventListener("click", S.download);

    fetch(DATA_FILE, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (doc) {
        S.DOC = doc;
        S.DOC.statuses = S.DOC.statuses || [];
        /* A file written before priorities existed still has to load. */
        S.DOC.priorities = S.DOC.priorities || [];
        S.DOC.tasks = S.DOC.tasks || [];
        indexStatuses();
        S.loaded = true;
        S.status();
        if (onReady) onReady();
      })
      .catch(function () {
        S.loaded = false;
        S.status();
        if (onFail) onFail();
      });
  };

  window.TaskStore = S;
})();
