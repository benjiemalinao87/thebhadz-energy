(function () {
  "use strict";

  var ACCEPT =
    ".mp4,.mov,.webm,.m4a,.mp3,.wav,.ogg,video/mp4,video/quicktime,video/webm,audio/mp4,audio/x-m4a,audio/mpeg,audio/wav,audio/ogg";
  var sections = new Map();
  var dockSelect = null;
  var dockStatus = null;

  function meetingLabel(article) {
    var date = article.querySelector(".mh .date");
    var title = article.querySelector(".mh h3");
    var d = date ? date.textContent.split("·")[0].trim() : article.id;
    var t = title ? title.textContent.trim() : article.id;
    return d + " — " + t;
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

  function setDockStatus(text, isErr) {
    if (!dockStatus) return;
    dockStatus.textContent = text || "";
    dockStatus.classList.toggle("err", !!isErr);
  }

  function mountMeetingSections() {
    document.querySelectorAll("article.meeting[id]").forEach(function (article) {
      var panel = document.createElement("div");
      panel.className = "rec-panel";

      var head = document.createElement("div");
      head.className = "rec-panel-head";
      head.innerHTML =
        "<div><h4>Recordings</h4><p class=\"rec-hint\">Zoom / phone / screen capture — MP4, MOV, M4A up to 2&nbsp;GB</p></div>";

      var add = document.createElement("label");
      add.className = "rec-add";
      add.innerHTML = "<span class=\"rec-add-ico\" aria-hidden=\"true\">⬆</span> Upload recording";
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
        var total = data.recordings.length;
        setDockStatus(total ? total + " recording" + (total === 1 ? "" : "s") + " stored." : "No recordings yet.");
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
      var article = document.getElementById(meetingId);
      if (article) article.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // Keep dock meeting in sync when using the left rail.
  document.querySelectorAll(".rail a.m[href^='#']").forEach(function (link) {
    link.addEventListener("click", function () {
      var id = link.getAttribute("href").slice(1);
      if (dockSelect && sections.has(id)) dockSelect.value = id;
    });
  });

  mountMeetingSections();
  buildDock();
  loadAll();
})();
