(function () {
  "use strict";

  var ACCEPT =
    ".mp4,.mov,.webm,.m4a,.mp3,.wav,.ogg,video/mp4,video/quicktime,video/webm,audio/mp4,audio/x-m4a,audio/mpeg,audio/wav,audio/ogg";
  var DONE_KEY = "macc-meetings-done";
  var FOUNDER_KEY = "macc-meetings-founder";
  var sections = new Map();
  var dockSelect = null;
  var dockStatus = null;
  var recordingTotal = 0;
  var showCompleted = false;
  var actionFilter = "all";
  var actionRows = [];

  function meetingLabel(article) {
    var date = article.querySelector(".mh .date");
    var title = article.querySelector(".mh h3");
    var d = date ? date.textContent.split("·")[0].trim() : article.id;
    var t = title ? title.textContent.trim() : article.id;
    return d + " — " + t;
  }

  function taskKey(taskEl) {
    return String(taskEl ? taskEl.textContent : "")
      .trim()
      .slice(0, 120);
  }

  function loadDoneSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || "[]"));
    } catch (e) {
      return new Set();
    }
  }

  function saveDoneSet(set) {
    localStorage.setItem(DONE_KEY, JSON.stringify(Array.from(set)));
  }

  function setDockStatus(text, isErr) {
    document.querySelectorAll("#rec-dock-status, #rec-dock-status-top").forEach(function (el) {
      el.textContent = text || "";
      el.classList.toggle("err", !!isErr);
    });
  }

  function selectMeeting(id, opts) {
    if (!document.getElementById(id)) return;
    document.querySelectorAll("article.meeting").forEach(function (m) {
      m.classList.toggle("is-active", m.id === id);
    });
    document.querySelectorAll(".rail a.m[href^='#']").forEach(function (link) {
      link.classList.toggle("act", link.getAttribute("href") === "#" + id);
    });
    if (dockSelect && sections.has(id)) dockSelect.value = id;
    if (!opts || !opts.skipHash) {
      try {
        history.replaceState(null, "", "#" + id);
      } catch (e) {}
    }
  }

  function countOpenActionsInMeeting(article) {
    var n = 0;
    article.querySelectorAll(".m-actions .aitem").forEach(function (item) {
      if (!item.classList.contains("done")) n++;
    });
    return n;
  }

  function updateRailActionDots() {
    document.querySelectorAll(".rail a.m[href^='#']").forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      var article = document.getElementById(id);
      var dot = link.querySelector(".act-dot");
      var open = article ? countOpenActionsInMeeting(article) : 0;
      if (!open) {
        if (dot) dot.remove();
        return;
      }
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "act-dot";
        dot.title = open + " open action" + (open === 1 ? "" : "s");
        link.querySelector(".t").appendChild(dot);
      } else {
        dot.title = open + " open action" + (open === 1 ? "" : "s");
      }
    });
  }

  function updateStats() {
    var open = 0;
    var overdue = 0;
    document.querySelectorAll(".actions-panel .ai").forEach(function (row) {
      if (row.classList.contains("done")) return;
      open++;
      if (row.querySelector(".due.over")) overdue++;
    });
    var meetings = document.querySelectorAll("article.meeting").length;
    var elOpen = document.getElementById("stat-open");
    var elOver = document.getElementById("stat-overdue");
    var elRec = document.getElementById("stat-recordings");
    var elMeet = document.getElementById("stat-meetings");
    if (elOpen) elOpen.textContent = String(open);
    if (elOver) elOver.textContent = String(overdue);
    if (elRec) elRec.textContent = String(recordingTotal);
    if (elMeet) elMeet.textContent = String(meetings);
  }

  function ownerLabel(key) {
    var map = {
      all: "All founders",
      ace: "Ace",
      benjie: "Benjie",
      jundhel: "Jundhel",
      jethro: "Jethro",
      other: "Unassigned",
    };
    return map[key] || key;
  }

  function ownerInitials(key) {
    var map = { all: "ALL", ace: "AC", benjie: "BM", jundhel: "JC", jethro: "JA", other: "?" };
    return map[key] || key.slice(0, 2).toUpperCase();
  }

  function primaryOwner(row) {
    var owners = (row.getAttribute("data-owners") || "other").split(",");
    if (owners.indexOf("all") >= 0) return "all";
    return owners[0] || "other";
  }

  function matchesActionFilter(row) {
    var isDone = row.classList.contains("done");
    if (isDone && !showCompleted) return false;
    if (!isDone && showCompleted) return false;
    if (actionFilter === "overdue") return !isDone && !!row.querySelector(".due.over");
    if (actionFilter === "mine") {
      var founder = document.getElementById("actions-founder");
      var pick = founder ? founder.value : "benjie";
      var owners = (row.getAttribute("data-owners") || "").split(",");
      return owners.indexOf(pick) >= 0;
    }
    return true;
  }

  function renderActionGroups() {
    var host = document.getElementById("actions-groups");
    if (!host || !actionRows.length) return;

    var visible = actionRows.filter(matchesActionFilter);
    host.innerHTML = "";

    if (!visible.length) {
      var empty = document.createElement("p");
      empty.className = "rec-empty";
      empty.textContent = showCompleted ? "No completed items yet." : "No open items match this filter.";
      host.appendChild(empty);
      return;
    }

    if (actionFilter === "overdue") {
      visible.forEach(function (row) {
        host.appendChild(row);
      });
      return;
    }

    var groups = {};
    visible.forEach(function (row) {
      var key = primaryOwner(row);
      (groups[key] = groups[key] || []).push(row);
    });

    Object.keys(groups)
      .sort(function (a, b) {
        var order = ["all", "ace", "benjie", "jundhel", "jethro", "other"];
        return order.indexOf(a) - order.indexOf(b);
      })
      .forEach(function (key) {
        var wrap = document.createElement("div");
        wrap.className = "owner-group";
        var h = document.createElement("h4");
        h.innerHTML =
          '<span class="av">' +
          ownerInitials(key) +
          "</span> " +
          ownerLabel(key) +
          " (" +
          groups[key].length +
          ")";
        wrap.appendChild(h);
        groups[key].forEach(function (row) {
          wrap.appendChild(row);
        });
        host.appendChild(wrap);
      });
  }

  function setActionDone(row, done, doneSet) {
    row.classList.toggle("done", done);
    var chk = row.querySelector(".chk");
    if (chk) {
      chk.classList.toggle("done", done);
      chk.setAttribute("aria-checked", done ? "true" : "false");
    }
    var key = taskKey(row.querySelector(".task"));
    if (done) doneSet.add(key);
    else doneSet.delete(key);
  }

  function syncMeetingItems(taskText, done) {
    document.querySelectorAll(".m-actions .aitem").forEach(function (item) {
      var txt = item.querySelector(".txt");
      if (!txt) return;
      if (taskKey(txt).slice(0, 80) === taskText.slice(0, 80)) {
        item.classList.toggle("done", done);
        var chk = item.querySelector(".chk");
        if (chk) chk.classList.toggle("done", done);
      }
    });
    updateRailActionDots();
  }

  function initActionItems() {
    var host = document.getElementById("actions-groups");
    if (host) {
      actionRows = Array.prototype.slice.call(host.querySelectorAll(":scope > .ai"));
    }
    var doneSet = loadDoneSet();
    document.querySelectorAll(".actions-panel .ai").forEach(function (row) {
      var key = taskKey(row.querySelector(".task"));
      if (doneSet.has(key)) {
        setActionDone(row, true, doneSet);
        syncMeetingItems(key, true);
      }
      var chk = row.querySelector(".chk");
      if (!chk) return;
      function toggle() {
        var next = !row.classList.contains("done");
        setActionDone(row, next, doneSet);
        saveDoneSet(doneSet);
        syncMeetingItems(key, next);
        updateStats();
        renderActionGroups();
      }
      chk.addEventListener("click", toggle);
      chk.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });
    saveDoneSet(doneSet);
  }

  function initActionFilters() {
    var founderSelect = document.getElementById("actions-founder");
    var saved = localStorage.getItem(FOUNDER_KEY);
    if (founderSelect && saved) founderSelect.value = saved;

    document.querySelectorAll(".actions-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        actionFilter = tab.getAttribute("data-filter") || "all";
        document.querySelectorAll(".actions-tab").forEach(function (t) {
          var on = t === tab;
          t.classList.toggle("act", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        if (founderSelect) founderSelect.hidden = actionFilter !== "mine";
        renderActionGroups();
      });
    });

    if (founderSelect) {
      founderSelect.addEventListener("change", function () {
        localStorage.setItem(FOUNDER_KEY, founderSelect.value);
        renderActionGroups();
      });
    }

    var doneToggle = document.getElementById("actions-done-toggle");
    if (doneToggle) {
      doneToggle.addEventListener("click", function () {
        showCompleted = !showCompleted;
        doneToggle.textContent = showCompleted ? "Hide completed" : "View completed";
        renderActionGroups();
        updateStats();
      });
    }
  }

  function initRailFilters() {
    document.querySelectorAll(".rail-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var filter = chip.getAttribute("data-filter") || "all";
        document.querySelectorAll(".rail-chip").forEach(function (c) {
          c.classList.toggle("act", c === chip);
        });
        document.querySelectorAll(".rail a.m[href^='#']").forEach(function (link) {
          if (filter === "rec") {
            link.classList.toggle("is-hidden", !link.querySelector(".rec-badge"));
          } else {
            link.classList.remove("is-hidden");
          }
        });
      });
    });
  }

  function initMeetingNav() {
    document.querySelectorAll(".rail a.m[href^='#']").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        selectMeeting(link.getAttribute("href").slice(1));
      });
    });
    if (dockSelect) {
      dockSelect.addEventListener("change", function () {
        if (dockSelect.value) selectMeeting(dockSelect.value, { skipHash: true });
      });
    }
    var hash = (location.hash || "").replace(/^#/, "");
    var first = document.querySelector("article.meeting[id]");
    selectMeeting(hash && document.getElementById(hash) ? hash : first ? first.id : "", { skipHash: true });
    if (hash && document.getElementById(hash)) {
      try {
        history.replaceState(null, "", "#" + hash);
      } catch (e) {}
    }
  }

  function buildDock() {
    var dock = document.getElementById("rec-dock");
    if (!dock) return;

    dockSelect = dock.querySelector("#rec-dock-meeting");
    dockStatus = dock.querySelector("#rec-dock-status");
    var drop = dock.querySelector("#rec-dock-drop");
    var input = dock.querySelector("#rec-dock-file");
    var btn = dock.querySelector("#rec-dock-btn");

    document.querySelectorAll("article.meeting[id]").forEach(function (article) {
      var opt = document.createElement("option");
      opt.value = article.id;
      opt.textContent = meetingLabel(article);
      dockSelect.appendChild(opt);
    });

    if (dockSelect.options.length) dockSelect.selectedIndex = 0;

    function pickFile() {
      if (!dockSelect.value) {
        setDockStatus("Pick a meeting first.", true);
        return;
      }
      input.click();
    }

    btn.addEventListener("click", pickFile);
    function wrapFor(id) {
      var sec = sections.get(id);
      return sec ? sec.wrap : null;
    }

    drop.addEventListener("click", function (e) {
      if (e.target === input) return;
      pickFile();
    });
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pickFile();
      }
    });
    drop.addEventListener("dragover", function (e) {
      e.preventDefault();
      drop.classList.add("drag");
    });
    drop.addEventListener("dragleave", function () {
      drop.classList.remove("drag");
    });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      drop.classList.remove("drag");
      if (!dockSelect.value) {
        setDockStatus("Pick a meeting first.", true);
        return;
      }
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      var wrap = wrapFor(dockSelect.value);
      if (file && wrap) upload(dockSelect.value, file, wrap);
    });
    input.addEventListener("change", function () {
      var wrap = dockSelect.value ? wrapFor(dockSelect.value) : null;
      if (input.files && input.files[0] && wrap) {
        upload(dockSelect.value, input.files[0], wrap);
      }
      input.value = "";
    });
  }

  function mountMeetingSections() {
    document.querySelectorAll("article.meeting[id]").forEach(function (article) {
      var panel = document.createElement("div");
      panel.className = "rec-panel";

      var head = document.createElement("div");
      head.className = "rec-panel-head";
      head.innerHTML =
        '<div><h4>Recordings</h4><p class="rec-hint">Zoom / phone / screen capture — MP4, MOV, M4A up to 2&nbsp;GB</p></div>';

      var add = document.createElement("label");
      add.className = "rec-add";
      add.innerHTML = '<span class="rec-add-ico" aria-hidden="true">⬆</span> Upload recording';
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ACCEPT;
      input.hidden = true;
      add.appendChild(input);

      var list = document.createElement("div");
      list.className = "rec-list";

      var wrap = document.createElement("div");
      wrap.className = "recs";
      wrap.appendChild(list);

      head.appendChild(add);
      panel.appendChild(head);
      panel.appendChild(wrap);

      input.addEventListener("change", function () {
        if (input.files && input.files[0]) upload(article.id, input.files[0], wrap);
        input.value = "";
      });

      var mh = article.querySelector(".mh");
      if (mh && mh.nextSibling) article.insertBefore(panel, mh.nextSibling);
      else article.insertBefore(panel, article.firstChild);

      sections.set(article.id, { list: list, wrap: wrap, badge: null });
    });
  }

  function fmtSize(bytes) {
    if (!bytes) return "0 MB";
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    return Math.max(1, Math.round(bytes / (1024 * 1024))) + " MB";
  }

  function updateRailBadges(byMeeting) {
    document.querySelectorAll(".rail a.m[href^='#']").forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      var count = (byMeeting[id] || []).length;
      var badge = link.querySelector(".rec-badge");
      if (!count) {
        if (badge) badge.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "rec-badge";
        link.appendChild(badge);
      }
      badge.textContent = count === 1 ? "1 rec" : count + " recs";
    });
  }

  function render(list, recs) {
    list.innerHTML = "";
    if (!recs.length) {
      var empty = document.createElement("p");
      empty.className = "rec-empty";
      empty.textContent = "No recording yet — upload above.";
      list.appendChild(empty);
      return;
    }
    recs.forEach(function (r) {
      var el = document.createElement("div");
      el.className = "rec";
      var rh = document.createElement("div");
      rh.className = "rh";
      var rt = document.createElement("div");
      rt.className = "rt";
      rt.textContent = r.title;
      var rm = document.createElement("span");
      rm.className = "rm";
      rm.textContent = String(r.createdAt || "").slice(0, 10) + " · " + fmtSize(r.size);
      var rx = document.createElement("button");
      rx.className = "rx";
      rx.type = "button";
      rx.textContent = "Delete";
      rx.addEventListener("click", function () {
        if (!confirm('Delete recording "' + r.title + '"? The file is removed permanently.')) return;
        fetch("/api/recordings?id=" + encodeURIComponent(r.id), { method: "DELETE" })
          .then(function (res) {
            return res.json();
          })
          .then(function (data) {
            if (data.ok) loadAll();
          });
      });
      rh.appendChild(rt);
      rh.appendChild(rm);
      rh.appendChild(rx);
      var isVideo = String(r.type || "").indexOf("video/") === 0;
      var media = document.createElement(isVideo ? "video" : "audio");
      media.controls = true;
      media.preload = "none";
      media.src = "/api/recordings?id=" + encodeURIComponent(r.id) + "&stream=1";
      el.appendChild(rh);
      el.appendChild(media);
      list.appendChild(el);
    });
  }

  function loadAll() {
    fetch("/api/recordings")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data.ok) return;
        var byMeeting = {};
        data.recordings.forEach(function (r) {
          (byMeeting[r.meetingId] = byMeeting[r.meetingId] || []).push(r);
        });
        sections.forEach(function (sec, meetingId) {
          render(sec.list, byMeeting[meetingId] || []);
        });
        updateRailBadges(byMeeting);
        recordingTotal = data.recordings.length;
        setDockStatus(
          recordingTotal
            ? recordingTotal + " recording" + (recordingTotal === 1 ? "" : "s") + " stored."
            : "No recordings yet."
        );
        updateStats();
      })
      .catch(function () {
        setDockStatus("Could not load recordings.", true);
      });
  }

  function postJSON(body) {
    return fetch("/api/recordings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || "Request failed.");
        return data;
      });
  }

  function putPart(id, uploadId, partNumber, blob, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(
        "PUT",
        "/api/recordings?id=" +
          encodeURIComponent(id) +
          "&uploadId=" +
          encodeURIComponent(uploadId) +
          "&part=" +
          partNumber
      );
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = function () {
        try {
          var body = JSON.parse(xhr.responseText);
          if (body.ok) resolve(body);
          else reject(new Error(body.error || "Chunk upload failed."));
        } catch (e) {
          reject(new Error("Chunk upload failed."));
        }
      };
      xhr.onerror = function () {
        reject(new Error("Network error during upload."));
      };
      xhr.send(blob);
    });
  }

  async function upload(meetingId, file, wrap) {
    if (dockSelect) dockSelect.value = meetingId;
    selectMeeting(meetingId, { skipHash: true });
    var defTitle = file.name.replace(/\.[^.]+$/, "");
    var title = prompt("Recording title:", defTitle);
    if (title === null) return;
    title = title || defTitle;

    var prog = document.createElement("div");
    prog.className = "rec-prog";
    prog.innerHTML = '<div class="ptrack"><div class="pfill"></div></div><div class="plbl"></div>';
    wrap.insertBefore(prog, wrap.firstChild);
    var fill = prog.querySelector(".pfill");
    var lbl = prog.querySelector(".plbl");
    var setP = function (f) {
      var pct = Math.min(100, Math.round(f * 100));
      fill.style.width = pct + "%";
      lbl.textContent = "Uploading " + file.name + " — " + pct + "%";
      setDockStatus("Uploading " + file.name + " — " + pct + "%");
    };
    setP(0);

    var created = null;
    try {
      created = await postJSON({
        action: "create",
        meetingId: meetingId,
        name: file.name,
        type: file.type,
        size: file.size,
        title: title,
      });
      var partSize = created.partSize;
      var total = Math.ceil(file.size / partSize);
      var parts = [];
      for (var i = 0; i < total; i++) {
        var blob = file.slice(i * partSize, Math.min(file.size, (i + 1) * partSize));
        var r = await putPart(
          created.id,
          created.uploadId,
          i + 1,
          blob,
          (function (idx) {
            return function (p) {
              setP((idx + p) / total);
            };
          })(i)
        );
        parts.push({ partNumber: r.partNumber, etag: r.etag });
      }
      lbl.textContent = "Finalizing…";
      setDockStatus("Finalizing upload…");
      await postJSON({
        action: "complete",
        id: created.id,
        uploadId: created.uploadId,
        parts: parts,
      });
      prog.remove();
      setDockStatus("Upload complete.");
      loadAll();
    } catch (err) {
      if (created) {
        try {
          await postJSON({ action: "abort", id: created.id, uploadId: created.uploadId });
        } catch (e) {}
      }
      prog.remove();
      var msg = document.createElement("p");
      msg.className = "rec-err";
      msg.textContent = "Upload failed: " + (err && err.message ? err.message : err);
      wrap.insertBefore(msg, wrap.firstChild);
      setDockStatus(msg.textContent, true);
      setTimeout(function () {
        msg.remove();
      }, 10000);
    }
  }

  mountMeetingSections();
  buildDock();
  initMeetingNav();
  initRailFilters();
  initActionItems();
  initActionFilters();
  updateRailActionDots();
  updateStats();
  renderActionGroups();
  loadAll();
})();
