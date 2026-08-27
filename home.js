/* =========================================================
   HOME

   Read-only, and it reads everything: the four data files the
   other pages write. Nothing here saves, so there's no store
   to share — just fetches, a few date helpers, and render.

   Each file is fetched on its own and allowed to fail on its
   own. One missing file leaves one empty section rather than
   an empty page, and the dots in the header say which.
   ========================================================= */
(function () {
  var $ = function (s) { return document.querySelector(s); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var ICON_CAL =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/>' +
    '<line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="6"/>' +
    '<line x1="16" y1="3" x2="16" y2="6"/></svg>';

  var ICON_HEART =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.7-9.3-9A5.4 5.4 0 0 1 12 6.2 5.4 5.4 0 0 1 21.3 12c-1.8 4.3-9.3 9-9.3 9z"/></svg>';

  /* -------------------------------------------------------
     Dates

     Task due dates are plain "YYYY-MM-DD" with no time, so they're
     parsed as local — "due today" means today where you are, not
     today in UTC. The same rule the tasks pages use.
  ------------------------------------------------------- */
  function midnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function daysUntil(due) {
    if (!due) return null;
    var bits = String(due).split("-");
    if (bits.length !== 3) return null;
    var then = new Date(+bits[0], +bits[1] - 1, +bits[2]);
    if (isNaN(then.getTime())) return null;
    return Math.round((midnight(then) - midnight(new Date())) / 86400000);
  }

  function dueChip(due) {
    var n = daysUntil(due);
    if (n === null) return '<span class="cell-none">—</span>';

    var tone = n < 0 ? "late" : n === 0 ? "now" : n <= 7 ? "soon" : "";
    var text = n < 0 ? (n === -1 ? "1 day late" : -n + " days late")
             : n === 0 ? "Today"
             : n === 1 ? "Tomorrow"
             : n <= 7 ? "In " + n + " days"
             : fmtDate(due);

    return '<span class="due-chip is-' + tone + '">' + ICON_CAL +
             "<span>" + esc(text) + "</span></span>";
  }

  function fmtDate(due) {
    var bits = String(due).split("-");
    var d = new Date(+bits[0], +bits[1] - 1, +bits[2]);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  /* Timestamps are full ISO, so these are real instants. */
  function fmtWhen(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (isNaN(t)) return "";

    var mins = Math.round((Date.now() - t) / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return mins + " min ago";
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs === 1 ? "1 hour ago" : hrs + " hours ago";
    var days = Math.round(hrs / 24);
    if (days < 7) return days === 1 ? "yesterday" : days + " days ago";
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch (e) { return String(url || "").replace(/^https?:\/\//, "").split("/")[0]; }
  }

  /* -------------------------------------------------------
     Loading

     Four files, fetched together. Each resolves to its parsed
     contents or to null, so one bad file can't reject the lot.
  ------------------------------------------------------- */
  /* Every file on the site that holds state. db.json is left out —
     nothing reads it.

     One list drives all three things: a dot each, the count in the
     hover text, and what the download hands back. Only the first three
     feed a section on this page; the rest are checked so the dots and
     the backup agree with each other rather than reporting on
     different sets. */
  var FILES = [
    { key: "tasks",   file: "tasks-data.json" },
    { key: "links",   file: "links-data.json" },
    { key: "kb",      file: "kb-data.json" },
    { key: "demos",   file: "demos-data.json" },
    { key: "scripts", file: "scripts-data.json" },
    { key: "nav",     file: "nav-data.json" }
  ];

  var DATA = {};

  function loadOne(spec) {
    return fetch(spec.file, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (doc) { DATA[spec.key] = doc; return doc; })
      .catch(function () { DATA[spec.key] = null; return null; });
  }

  function renderFileDots() {
    $("#fileDots").innerHTML = FILES.map(function (f) {
      var ok = !!DATA[f.key];
      return '<span class="file-dot' + (ok ? " on" : "") + '" ' +
               'title="' + esc(f.file) + (ok ? " loaded" : " didn\u2019t load") + '"></span>';
    }).join("");

    /* The label stays put so it's a steady thing to click; anything
       missing is called out beside it rather than replacing it. */
    var missing = FILES.filter(function (f) { return !DATA[f.key]; });
    var warn = $("#fileWarn");
    warn.hidden = missing.length === 0;
    warn.textContent = missing.length ? missing.length + " missing" : "";

    $("#downloadAll").title =
      "Download all " + FILES.length + " data files as a backup";
  }

  function saveBlob(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* Fetched fresh rather than taken from memory: most of these aren't
     read by this page at all, and a backup should be the bytes on disk
     right now. A file that 404s is skipped rather than saved empty.
     Browsers throttle a burst of downloads, so they go one at a time. */
  var downloading = false;

  function downloadAll() {
    if (downloading) return;
    downloading = true;

    var btn = $("#downloadAll");
    var was = btn.textContent;
    btn.textContent = "collecting\u2026";
    btn.disabled = true;

    Promise.all(FILES.map(function (f) {
      var name = f.file;
      return fetch(name, { cache: "no-store" })
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (text) { return text === null ? null : { name: name, text: text }; })
        .catch(function () { return null; });
    })).then(function (results) {
      var got = results.filter(Boolean);

      got.forEach(function (f, i) {
        setTimeout(function () { saveBlob(f.name, f.text); }, i * 400);
      });

      setTimeout(function () {
        downloading = false;
        btn.disabled = false;
        btn.textContent = was;
        var missed = FILES.length - got.length;
        btn.title = missed
          ? got.length + " of " + FILES.length + " downloaded \u2014 " +
            missed + " couldn\u2019t be read"
          : "Download all " + FILES.length + " data files as a backup";
      }, got.length * 400 + 200);
    });
  }

  $("#downloadAll").addEventListener("click", downloadAll);

  /* -------------------------------------------------------
     Tasks
  ------------------------------------------------------- */
  function tasks() { return (DATA.tasks && DATA.tasks.tasks) || []; }
  function statuses() { return (DATA.tasks && DATA.tasks.statuses) || []; }

  function statusOf(t) {
    var found = null;
    statuses().forEach(function (s) { if (s.id === t.status) found = s; });
    return found || { id: t.status, label: t.status || "None", color: "#94a3b8" };
  }

  function isOpen(t) { return t.status !== "complete" && t.status !== "canceled"; }
  function openTasks() { return tasks().filter(isOpen); }

  /* Soonest first; undated last. */
  function byDue(a, b) {
    var x = daysUntil(a.due), y = daysUntil(b.due);
    if (x === null && y === null) {
      return String(a.title || "").localeCompare(String(b.title || ""),
        undefined, { sensitivity: "base" });
    }
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  }

  function taskRow(t) {
    var st = statusOf(t);
    return "<tr>" +
             '<td class="cell-primary">' +
               '<a class="home-task-title" href="tasks-all.html#task=' +
                 encodeURIComponent(t.id) + '">' + esc(t.title || "Untitled task") + "</a>" +
               (t.desc ? '<span class="home-task-desc">' + esc(t.desc) + "</span>" : "") +
             "</td>" +
             '<td class="col-hide-sm">' +
               '<span class="tag" style="--tag-color:' + esc(st.color) + '">' +
                 esc(st.label) + "</span>" +
             "</td>" +
             "<td>" + dueChip(t.due) + "</td>" +
           "</tr>";
  }

  function fillTable(rowsEl, countEl, emptyEl, list) {
    rowsEl.innerHTML = list.map(taskRow).join("");
    countEl.textContent = list.length
      ? list.length + (list.length === 1 ? " task" : " tasks") : "";
    emptyEl.classList.toggle("show", list.length === 0);
  }

  /* Today means today or already past — something a day late is more
     today's problem than tomorrow's. */
  var DUE_VIEWS = {
    today: function (n) { return n !== null && n <= 0; },
    week:  function (n) { return n !== null && n >= 0 && n <= 7; }
  };
  var dueView = "today";

  function renderDue() {
    var pass = DUE_VIEWS[dueView];
    var list = openTasks()
      .filter(function (t) { return pass(daysUntil(t.due)); })
      .sort(byDue);

    fillTable($("#dueRows"), $("#dueCount"), $("#dueEmpty"), list);

    var empty = $("#dueEmpty");
    if (!list.length) {
      empty.querySelector("strong").textContent = dueView === "today"
        ? "Nothing due today" : "Nothing due this week";
      empty.querySelector("span").textContent = dueView === "today"
        ? "And nothing open is overdue either."
        : "Nothing open lands inside the next seven days.";
    }
  }

  /* -------------------------------------------------------
     Links
  ------------------------------------------------------- */
  function renderLinks() {
    var all = (DATA.links && DATA.links.links) || [];
    var cats = (DATA.links && DATA.links.categories) || [];
    var favs = all.filter(function (l) { return !!l.fav; }).slice(0, 6);

    function catColor(l) {
      var first = (l.cats || [])[0], hit = null;
      cats.forEach(function (c) { if (c.id === first) hit = c; });
      return hit ? hit.color : "#94a3b8";
    }

    $("#linkCount").textContent = favs.length
      ? favs.length + (all.length > favs.length ? " of " + all.length : "") : "";
    $("#linkEmpty").hidden = favs.length > 0;

    $("#linkList").innerHTML = favs.map(function (l) {
      return '<a class="home-link" href="' + esc(l.url) + '" target="_blank" ' +
               'rel="noopener noreferrer" style="--cat:' + esc(catColor(l)) + '">' +
               '<span class="home-link-heart">' + ICON_HEART + "</span>" +
               '<span class="home-link-body">' +
                 '<span class="home-link-title">' + esc(l.title || hostOf(l.url)) + "</span>" +
                 '<span class="home-link-host">' + esc(hostOf(l.url)) + "</span>" +
               "</span>" +
             "</a>";
    }).join("");
  }

  /* -------------------------------------------------------
     Knowledge Base
  ------------------------------------------------------- */
  function renderKb() {
    var pages = (DATA.kb && DATA.kb.pages) || [];
    var folders = (DATA.kb && DATA.kb.folders) || [];

    function folderOf(p) {
      var hit = null;
      folders.forEach(function (f) { if (f.id === p.folder) hit = f; });
      return hit || { label: "No folder", color: "#94a3b8" };
    }

    var recent = pages.slice().sort(function (a, b) {
      return String(b.updated || b.created || "").localeCompare(
             String(a.updated || a.created || ""));
    }).slice(0, 5);

    $("#kbCount").textContent = pages.length
      ? pages.length + (pages.length === 1 ? " page" : " pages") : "";
    $("#kbEmpty").hidden = recent.length > 0;

    $("#kbList").innerHTML = recent.map(function (p) {
      var f = folderOf(p);
      return '<a class="home-row" href="kb.html#page=' + encodeURIComponent(p.id) + '">' +
               '<span class="home-row-main">' +
                 '<span class="home-row-title">' + esc(p.title || "Untitled page") + "</span>" +
                 '<span class="home-row-sub">' +
                   '<span class="home-dot" style="--dot-color:' + esc(f.color) + '"></span>' +
                   esc(f.label) +
                 "</span>" +
               "</span>" +
               '<span class="home-row-when">' + esc(fmtWhen(p.updated || p.created)) + "</span>" +
             "</a>";
    }).join("");
  }

  /* -------------------------------------------------------
     Counts across the top
  ------------------------------------------------------- */
  function renderStats() {
    var open = openTasks();

    function count(pass) {
      return open.filter(function (t) { return pass(daysUntil(t.due)); }).length;
    }

    /* Today is today only. Overdue has its own tile, so counting late
       work here as well would say the same thing twice. */
    var today = count(function (n) { return n === 0; });
    var late = count(function (n) { return n !== null && n < 0; });
    var high = open.filter(function (t) { return t.priority === "high"; }).length;

    var cards = [
      { label: "Open tasks", value: open.length, note: "Active and pending" },
      { label: "Due today",  value: today,
        note: today ? "Dated today" : "Nothing dated today" },
      { label: "Overdue",    value: late, color: "#f43f5e",
        note: late ? "Past their due date" : "Nothing is late" },
      { label: "High priority", value: high, color: "#f43f5e",
        note: high ? "Open and flagged" : "Nothing flagged" }
    ];

    $("#stats").innerHTML = cards.map(function (c) {
      /* Zero never lights up — an unlit count is the quiet default. */
      var lit = c.color && c.value > 0;
      return '<div class="card stat">' +
               '<span class="label-caps">' + esc(c.label) + "</span>" +
               '<p class="stat-value' + (lit ? " stat-value-lit" : "") + '"' +
                 (lit ? ' style="--stat-color:' + esc(c.color) + '"' : "") + ">" +
                 c.value + "</p>" +
               '<p class="stat-note">' + esc(c.note) + "</p>" +
             "</div>";
    }).join("");
  }

  /* -------------------------------------------------------
     Tabs
  ------------------------------------------------------- */
  function wireTabs(wrapId, attr, onPick) {
    var wrap = $(wrapId);
    if (!wrap) return;
    wrap.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-" + attr + "]");
      if (!btn) return;
      var want = btn.dataset[attr];
      [].forEach.call(wrap.querySelectorAll("[data-" + attr + "]"), function (b) {
        var on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      onPick(want);
    });
  }

  wireTabs("#dueTabs", "due", function (v) { dueView = v; renderDue(); });

  /* -------------------------------------------------------
     Go
  ------------------------------------------------------- */
  $("#asOf").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric"
  });

  Promise.all(FILES.map(loadOne)).then(function () {
    renderFileDots();
    renderStats();
    renderDue();
    renderLinks();
    renderKb();
  });
})();
