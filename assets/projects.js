(function () {
  var storageKey = "solar-city-project-board-v1";
  var apiUrl = "/api/projects";
  var usingApi = false;
  var lanes = [
    { key: "Backlog", label: "Backlog" },
    { key: "This week", label: "This week" },
    { key: "Doing", label: "Doing" },
    { key: "Blocked", label: "Blocked" },
    { key: "Done", label: "Done" }
  ];
  var starterTasks = [
    {
      id: "task-1",
      title: "Create ops/status.md ledger",
      owner: "Founder",
      type: "Ops",
      due: "2026-07-17",
      status: "This week",
      notes: "Cash, deposits, hours split, gate status, decisions."
    },
    {
      id: "task-2",
      title: "List 3 subdivision or barangay launch slices",
      owner: "Founder",
      type: "Traction",
      due: "2026-07-17",
      status: "This week",
      notes: "Exact Facebook groups before any ad spend."
    },
    {
      id: "task-3",
      title: "Write 3 homeowner interview snapshots",
      owner: "Founder",
      type: "Traction",
      due: "2026-07-17",
      status: "Backlog",
      notes: "Past-specific stories, not would-you-buy answers."
    },
    {
      id: "task-4",
      title: "Confirm lead delivery before boost spend",
      owner: "Founder",
      type: "Product",
      due: "2026-07-20",
      status: "Backlog",
      notes: "View to lead to reply to survey booking."
    }
  ];

  var state = { tasks: [] };
  var editingId = null;
  var form = document.getElementById("pm-form");
  var board = document.getElementById("pm-board");
  var filter = document.getElementById("pm-filter");
  var exportButton = document.getElementById("pm-export");
  var importInput = document.getElementById("pm-import");
  var storageBadge = document.getElementById("pm-storage");

  if (!form || !board) return;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var data = new FormData(form);
    var task = normalizeTask({
      id: "task-" + Date.now(),
      title: String(data.get("title") || "").trim(),
      owner: String(data.get("owner") || "").trim(),
      type: String(data.get("type") || "Traction"),
      due: String(data.get("due") || ""),
      status: "Backlog",
      notes: String(data.get("notes") || "").trim()
    });
    if (!task.title) return;

    if (usingApi) {
      var created = await api("POST", task);
      if (!created) return;
      task = normalizeTask(created.task || task);
    } else {
      state.tasks.unshift(task);
      saveLocal();
    }
    if (usingApi) await refreshFromApi();
    form.reset();
    render();
    var titleInput = document.getElementById("pm-title");
    if (titleInput) titleInput.focus();
  });

  filter.addEventListener("change", render);
  exportButton.addEventListener("click", exportBoard);
  importInput.addEventListener("change", importBoard);

  board.addEventListener("click", async function (event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    var action = button.getAttribute("data-action");
    var task = findTask(button.getAttribute("data-id"));
    if (!task) return;

    if (action === "edit") {
      editingId = task.id;
      render();
      return;
    }
    if (action === "close-edit") {
      editingId = null;
      render();
      return;
    }
    if (action === "delete") {
      if (usingApi && !(await api("DELETE", { id: task.id }))) return;
      state.tasks = state.tasks.filter(function (item) { return item.id !== task.id; });
      if (editingId === task.id) editingId = null;
      if (!usingApi) saveLocal();
      render();
    }
  });

  board.addEventListener("change", async function (event) {
    var mover = event.target.closest("select[data-action='move']");
    if (mover) {
      await moveTask(mover.getAttribute("data-id"), mover.value);
      return;
    }
    var field = event.target.closest("[data-field]");
    if (!field) return;
    var task = findTask(field.getAttribute("data-id"));
    if (!task) return;
    var key = field.getAttribute("data-field");
    var value = field.value;
    if (usingApi && !(await api("PATCH", { id: task.id, [key]: value }))) {
      field.value = task[key] || "";
      return;
    }
    task[key] = value;
    if (!usingApi) saveLocal();
    renderCounts();
  });

  board.addEventListener("dragstart", function (event) {
    var card = event.target.closest('.pm-card[draggable="true"]');
    if (!card) return;
    event.dataTransfer.setData("text/plain", card.getAttribute("data-id"));
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  });

  board.addEventListener("dragend", function (event) {
    var card = event.target.closest(".pm-card");
    if (card) card.classList.remove("is-dragging");
    clearDropTargets();
  });

  board.addEventListener("dragover", function (event) {
    var lane = event.target.closest(".pm-lane");
    if (!lane) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    lane.classList.add("is-drop");
  });

  board.addEventListener("dragleave", function (event) {
    var lane = event.target.closest(".pm-lane");
    if (lane && !lane.contains(event.relatedTarget)) lane.classList.remove("is-drop");
  });

  board.addEventListener("drop", async function (event) {
    var lane = event.target.closest(".pm-lane");
    if (!lane) return;
    event.preventDefault();
    clearDropTargets();
    await moveTask(event.dataTransfer.getData("text/plain"), lane.getAttribute("data-lane"));
  });

  async function moveTask(id, status) {
    var task = findTask(id);
    if (!task || !status || task.status === status) {
      render();
      return;
    }
    if (usingApi && !(await api("PATCH", { id: task.id, status: status }))) {
      render();
      return;
    }
    task.status = status;
    if (!usingApi) saveLocal();
    render();
  }

  function clearDropTargets() {
    board.querySelectorAll(".pm-lane.is-drop").forEach(function (lane) {
      lane.classList.remove("is-drop");
    });
  }

  init();

  async function init() {
    if (location.protocol !== "file:") {
      var loaded = await refreshFromApi(true);
      usingApi = loaded;
    }
    if (!usingApi) state = loadLocal();
    render();
    setStorageBadge();
  }

  async function refreshFromApi(silent) {
    try {
      var response = await fetch(apiUrl, { credentials: "same-origin", headers: { "Accept": "application/json" } });
      if (response.status === 401 && location.pathname.indexOf("/internal/") === 0) {
        location.href = "/login.html?next=" + encodeURIComponent(location.pathname);
        return false;
      }
      if (!response.ok) throw new Error("API unavailable");
      var data = await response.json();
      if (!data.ok || !Array.isArray(data.tasks)) throw new Error("Bad API response");
      state = { tasks: data.tasks.map(normalizeTask) };
      return true;
    } catch (error) {
      if (!silent) alert("Could not reach the D1 project database. Your last local board is still available.");
      return false;
    }
  }

  async function api(method, body) {
    try {
      var response = await fetch(apiUrl, {
        method: method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body || {})
      });
      if (response.status === 401 && location.pathname.indexOf("/internal/") === 0) {
        location.href = "/login.html?next=" + encodeURIComponent(location.pathname);
        return null;
      }
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Request failed");
      return data;
    } catch (error) {
      alert(error.message || "Project database request failed.");
      return null;
    }
  }

  function loadLocal() {
    try {
      var saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && Array.isArray(saved.tasks)) return { tasks: saved.tasks.map(normalizeTask) };
    } catch (error) {
      // Ignore malformed local data and restore the starter board.
    }
    return { tasks: starterTasks.map(normalizeTask) };
  }

  function saveLocal() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function render() {
    var selected = filter.value;
    board.innerHTML = lanes.map(function (lane) {
      var tasks = state.tasks.filter(function (task) {
        var laneMatch = task.status === lane.key;
        var filterMatch = selected === "all"
          ? task.status !== "Done"
          : selected === "Done"
            ? task.status === "Done"
            : task.type === selected && task.status !== "Done";
        return laneMatch && filterMatch;
      });
      return '<section class="pm-lane" data-lane="' + escapeAttr(lane.key) + '">' +
        '<h2><span>' + escapeHtml(lane.label) + '</span><b>' + tasks.length + '</b></h2>' +
        '<div class="pm-cards">' +
        (tasks.length ? tasks.map(renderTask).join("") : '<p class="pm-empty">No tasks.</p>') +
        '</div>' +
      '</section>';
    }).join("");
    renderCounts();
  }

  function renderTask(task) {
    var overdue = isOverdue(task);
    if (task.id === editingId) return renderTaskEditor(task, overdue);

    var moveOptions = lanes.map(function (lane) {
      return '<option value="' + escapeAttr(lane.key) + '"' + (lane.key === task.status ? " selected" : "") + '>' + escapeHtml(lane.label) + '</option>';
    }).join("");

    return '<article class="pm-card is-read ' + (overdue ? "is-overdue" : "") + '" draggable="true" data-id="' + escapeAttr(task.id) + '">' +
      '<div class="pm-card-head">' +
        '<span class="pm-pill ' + escapeHtml(task.type.toLowerCase()) + '">' + escapeHtml(task.type) + '</span>' +
        (task.due
          ? '<time datetime="' + escapeHtml(task.due) + '"' + (overdue ? ' class="is-late"' : '') + '>' + dueLabel(task.due) + '</time>'
          : '<span class="pm-muted">No due date</span>') +
      '</div>' +
      '<h3 class="pm-card-title">' + escapeHtml(task.title) + '</h3>' +
      (task.owner ? '<p class="pm-card-owner">' + escapeHtml(task.owner) + '</p>' : "") +
      (task.notes ? '<p class="pm-card-notes">' + escapeHtml(task.notes) + '</p>' : "") +
      '<div class="pm-card-foot">' +
        '<select data-action="move" data-id="' + escapeAttr(task.id) + '" aria-label="Move task to lane">' + moveOptions + '</select>' +
        '<button type="button" data-action="edit" data-id="' + escapeAttr(task.id) + '">Edit</button>' +
      '</div>' +
    '</article>';
  }

  function renderTaskEditor(task, overdue) {
    return '<article class="pm-card is-editing ' + (overdue ? "is-overdue" : "") + '" data-id="' + escapeAttr(task.id) + '">' +
      '<div class="pm-card-head">' +
        '<span class="pm-pill ' + escapeHtml(task.type.toLowerCase()) + '">' + escapeHtml(task.type) + '</span>' +
        '<button type="button" data-action="close-edit" data-id="' + escapeAttr(task.id) + '">Done editing</button>' +
      '</div>' +
      '<label class="pm-edit-label">Task<input data-field="title" data-id="' + task.id + '" value="' + escapeAttr(task.title) + '"></label>' +
      '<div class="pm-card-grid">' +
        '<label>Owner<input data-field="owner" data-id="' + task.id + '" value="' + escapeAttr(task.owner) + '"></label>' +
        '<label>Due<input type="date" data-field="due" data-id="' + task.id + '" value="' + escapeAttr(task.due) + '"></label>' +
      '</div>' +
      '<label>Notes<textarea data-field="notes" data-id="' + task.id + '" rows="3">' + escapeHtml(task.notes) + '</textarea></label>' +
      '<button class="pm-delete" type="button" data-action="delete" data-id="' + task.id + '">Delete</button>' +
    '</article>';
  }

  function isOverdue(task) {
    return Boolean(task.due) && new Date(task.due + "T00:00:00") < startOfToday() && task.status !== "Done";
  }

  function dueLabel(value) {
    var due = new Date(value + "T00:00:00");
    var days = Math.round((due - startOfToday()) / 86400000);
    var hint = days === 0 ? "today"
      : days > 0 ? "in " + days + "d"
      : Math.abs(days) + "d late";
    return formatDate(value) + " · " + hint;
  }

  function renderCounts() {
    var active = state.tasks.filter(function (task) { return task.status !== "Done"; });
    var weekEnd = new Date(startOfToday());
    weekEnd.setDate(weekEnd.getDate() + 7);
    setCount("open", active.length);
    setCount("week", active.filter(function (task) {
      if (!task.due) return false;
      var due = new Date(task.due + "T00:00:00");
      return due >= startOfToday() && due <= weekEnd;
    }).length);
    setCount("blocked", active.filter(function (task) { return task.status === "Blocked"; }).length);
    var tractionPct = active.length
      ? Math.round(active.filter(function (task) { return task.type === "Traction"; }).length / active.length * 100)
      : 0;
    setCount("traction", tractionPct + "%");
    var gauge = document.getElementById("pm-gauge");
    if (gauge) {
      var low = active.length > 0 && tractionPct < 50;
      gauge.classList.toggle("is-low", low);
      gauge.querySelector("i").style.width = tractionPct + "%";
      gauge.setAttribute("title", low
        ? "Traction share is below the 50% floor — Monday/Tuesday go traction-only."
        : "Traction share is at or above the 50% floor.");
    }
  }

  function setCount(name, value) {
    var node = document.querySelector('[data-pm-count="' + name + '"]');
    if (node) node.textContent = value;
  }

  function setStorageBadge() {
    if (storageBadge) storageBadge.textContent = usingApi ? "Storage: Cloudflare D1" : "Storage: local browser";
  }

  function findTask(id) {
    return state.tasks.find(function (task) { return task.id === id; });
  }

  function exportBoard() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "solar-city-project-board.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importBoard(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function () {
      try {
        var imported = JSON.parse(String(reader.result || ""));
        if (!imported || !Array.isArray(imported.tasks)) throw new Error("Missing tasks");
        var tasks = imported.tasks.map(normalizeTask).filter(function (task) { return task.title; });
        if (usingApi) {
          var saved = await api("PUT", { tasks: tasks });
          if (!saved) return;
          await refreshFromApi();
        } else {
          state = { tasks: tasks };
          saveLocal();
        }
        render();
      } catch (error) {
        alert("That file does not look like a Solar City project board export.");
      }
      importInput.value = "";
    };
    reader.readAsText(file);
  }

  function normalizeTask(task, index) {
    return {
      id: String(task.id || "task-import-" + index + "-" + Date.now()),
      title: String(task.title || ""),
      owner: String(task.owner || ""),
      type: ["Traction", "Product", "Ops"].indexOf(task.type) >= 0 ? task.type : "Ops",
      due: /^\d{4}-\d{2}-\d{2}$/.test(String(task.due || "")) ? String(task.due) : "",
      status: lanes.some(function (lane) { return lane.key === task.status; }) ? task.status : "Backlog",
      notes: String(task.notes || "")
    };
  }

  function startOfToday() {
    var date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function formatDate(value) {
    var parts = value.split("-");
    if (parts.length !== 3) return value;
    return parts[1] + "/" + parts[2];
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();
