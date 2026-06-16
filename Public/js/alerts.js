const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user"));

async function syncCurrentUser() {
  try {
    const response = await fetch(
      "/api/users/me",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) return;

    const updatedUser = await response.json();

    localStorage.setItem(
      "user",
      JSON.stringify(updatedUser)
    );

    const roleHomePages = {
      admin: "admin-dashboard.html",
      commander: "commander-dashboard.html",
      patrol_leader: "user-dashboard.html",
      patrol_member: "user-dashboard.html",
      communication_officer: "communication.html",
      monitoring_officer: "monitoring.html",
    };

    const rolePages = {
      admin: [
        "admin-dashboard.html",
        "admin-users.html",
        "patrol-management.html",
        "monitoring.html",
        "communication.html",
        "alerts.html",
        "settings.html",
      ],
      commander: [
        "commander-dashboard.html",
        "patrol-management.html",
        "monitoring.html",
        "communication.html",
        "alerts.html",
      ],
      patrol_leader: ["user-dashboard.html", "user-patrol.html"],
      patrol_member: ["user-dashboard.html", "user-patrol.html"],
      communication_officer: ["communication.html", "alerts.html"],
      monitoring_officer: ["monitoring.html", "alerts.html"],
    };

    const currentPage =
      window.location.pathname.split("/").pop();

    const allowedPages =
      rolePages[updatedUser.role] || [];

    const correctPage =
      roleHomePages[updatedUser.role];

    if (
      correctPage &&
      !allowedPages.includes(currentPage)
    ) {
      window.location.href = correctPage;
    }
  } catch (error) {
    console.error(
      "User sync failed",
      error
    );
  }
}

syncCurrentUser();

const allowedRoles = [
  "admin",
  "commander",
  "monitoring_officer",
  "communication_officer",
];

if (!token || !user || !allowedRoles.includes(user.role)) {
  window.location.href = "access-system.html";
}

document.getElementById("adminName").innerText = user?.name || "Admin";

function logout() {
  try {
    if (user && (user._id || user.id)) {
      socket.emit("user-offline", {
        userId: user._id || user.id,
      });
      socket.disconnect();
    }
  } catch (error) {
    console.error("Logout presence error:", error);
  }

  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "access-system.html";
}

const socket = io();

let activeAlerts =
  JSON.parse(localStorage.getItem("activeSosAlerts")) || [];

let localAlertHistory =
  JSON.parse(localStorage.getItem("alertHistory")) || [];

let alertHistory = [];
let databaseAlertHistory = [];
let allDatabaseAlerts = [];

function getAlertHistoryKey(alert) {
  return String(
    alert.historyId ||
      `${alert.status || "logged"}:${alert.alertId || alert._id || alert.patrolId || alert.timestamp}`
  );
}

function mergeAlertHistory(databaseAlerts = []) {
  const seen = new Set();

  return [...localAlertHistory, ...databaseAlerts]
    .filter((alert) => {
      const key = getAlertHistoryKey(alert);

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      return (
        new Date(b.createdAt || b.timestamp || 0) -
        new Date(a.createdAt || a.timestamp || 0)
      );
    });
}

function addLocalHistoryEntry(entry) {
  localAlertHistory = [
    {
      ...entry,
      historyId:
        entry.historyId ||
        `${entry.status || "logged"}:${entry.alertId || entry.patrolId || Date.now()}`,
    },
    ...localAlertHistory,
  ].filter((alert, index, alerts) => {
    const key = getAlertHistoryKey(alert);
    return alerts.findIndex((item) => getAlertHistoryKey(item) === key) === index;
  });

  allDatabaseAlerts = mergeAlertHistory(databaseAlertHistory);
  alertHistory = allDatabaseAlerts;
}

function isDatabaseAlertId(alertId) {
  return /^[a-f\d]{24}$/i.test(String(alertId || ""));
}

async function loadAlertHistory() {
  try {
    const res = await fetch("/api/alerts", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const alerts = await res.json();

    if (!res.ok) {
      console.error("Load alert history failed:", alerts.message);
      return;
    }

    databaseAlertHistory = alerts;
    allDatabaseAlerts = mergeAlertHistory(databaseAlertHistory);
    alertHistory = allDatabaseAlerts;

    renderAlerts();
  } catch (error) {
    console.error("Load alert history error:", error);
  }
}

function saveAlerts() {
  localStorage.setItem("activeSosAlerts", JSON.stringify(activeAlerts));
  localStorage.setItem("alertHistory", JSON.stringify(localAlertHistory));
}

async function loadActiveAlerts() {
  try {
    const res = await fetch("/api/patrols/active-sos-alerts", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const alerts = await res.json();

    if (!res.ok) {
      console.error("Load active alerts failed:", alerts.message);
      renderAlerts();
      return;
    }

    activeAlerts = alerts;
    saveAlerts();
    renderAlerts();
  } catch (error) {
    console.error("Load active alerts error:", error);
    renderAlerts();
  }
}

function renderAlerts() {
  const activeAlertCount = document.getElementById("activeAlertCount");
  const acknowledgedCount = document.getElementById("acknowledgedCount");
  const latestAlertTime = document.getElementById("latestAlertTime");
  const alertStatus = document.getElementById("alertStatus");
  const activeAlertLabel = document.getElementById("activeAlertLabel");
  const activeAlertsList = document.getElementById("activeAlertsList");
  const alertLogs = document.getElementById("alertLogs");
  const alertLogCount = document.getElementById("alertLogCount");

  activeAlertCount.innerText = activeAlerts.length;
  acknowledgedCount.innerText = alertHistory.filter(
    (a) => a.status === "acknowledged"
  ).length;

  activeAlertLabel.innerText = `${activeAlerts.length} ACTIVE`;
  alertStatus.innerText = activeAlerts.length ? "ACTIVE" : "CLEAR";

  latestAlertTime.innerText = activeAlerts[0]?.timestamp
    ? new Date(activeAlerts[0].timestamp).toLocaleTimeString()
    : "--";

  if (!activeAlerts.length) {
    activeAlertsList.innerHTML = `<p>No active alerts.</p>`;
  } else {
    activeAlertsList.innerHTML = activeAlerts
      .map(
        (alert) => `
        <div class="alert-item active">
          <div>
            <h3>
              <i class="fa-solid fa-triangle-exclamation"></i>
              ${alert.user?.name || alert.name || "Unknown Personnel"}
            </h3>

            <p>${alert.message || "SOS alert activated."}</p>

            <small>
              Patrol: ${alert.patrolTitle || alert.patrol?.title || "Unknown"} |
Team: ${alert.team || alert.patrol?.team || "Unassigned"} |
Unit: ${alert.unit || alert.patrol?.unit || "N/A"} |
Area: ${alert.area || alert.patrol?.area || "Unknown"} |
Time: ${new Date(alert.timestamp).toLocaleString()}
            </small>
          </div>

          <div class="alert-actions">
            <button onclick="acknowledgeAlert('${alert.alertId || alert.patrolId}')">
              Acknowledge
            </button>

            <button onclick="openAlertMap('${alert.lat}', '${alert.lng}')">
              Map
            </button>

            <button onclick="clearAlert('${alert.alertId || alert.patrolId}')">
              Clear
            </button>
          </div>
        </div>
      `
      )
      .join("");
  }

  alertLogCount.innerText = alertHistory.length;

if (!alertHistory.length) {
  alertLogs.innerHTML = `<p>No alert history yet.</p>`;
} else {
  alertLogs.innerHTML = alertHistory
    .map(
      (log) => `
      <div class="
  alert-item
  ${
    ["sos", "emergency", "enemy_contact"]
      .includes(log.type)
      ? "priority-red"
      : log.type === "backup"
      ? "priority-orange"
      : [
          "patrol_delayed",
          "lost_connection"
        ].includes(log.type)
      ? "priority-yellow"
      : ""
  }
">
        <div>
          <h3>
            ${(log.type || "sos").replaceAll("_", " ").toUpperCase()}
            — ${log.user?.rank || ""} ${log.user?.name || log.name || "Unknown Personnel"}
          </h3>

          <p>${log.message || "Alert log"}</p>

          <small>
            Patrol: ${log.patrol?.title || log.patrolTitle || "N/A"} |
Team: ${log.patrol?.team || log.team || log.patrolTeam || "Unassigned"} |
Unit: ${log.patrol?.unit || log.unit || log.patrolUnit || "N/A"} |
            Status: ${(log.status || "logged").toUpperCase()} |
            Location: ${
              (log.latitude || log.lat) && (log.longitude || log.lng)
                ? `${log.latitude || log.lat}, ${log.longitude || log.lng}`
                : "No GPS"
            } |
            Time: ${new Date(log.createdAt || log.timestamp).toLocaleString()}
          </small>
        </div>

        <div class="alert-actions">
          ${
            (log.latitude || log.lat) && (log.longitude || log.lng)
              ? `<button onclick="openAlertMap('${log.latitude || log.lat}', '${log.longitude || log.lng}')">
                  Map
                </button>`
              : ""
          }

          ${
            log.status === "active" && isDatabaseAlertId(log._id)
              ? `<button onclick="resolveDatabaseAlert('${log._id}')">
                  Resolve
                </button>`
              : ""
          }
        </div>
      </div>
    `
    )
    .join("");
}
}

async function markUnresolved(alertId) {
  try {
    const res = await fetch(
      `/api/alerts/${alertId}/unresolve`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.message);
      return;
    }

    loadAlertHistory();
  } catch (error) {
    console.error(error);
    alert("Failed to mark unresolved.");
  }
}

function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showBrowserEmergencyNotification(alert) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const notification = new Notification("🚨 AGILACOM Emergency Alert", {
    body: `${alert.user?.name || alert.name || "Unknown Personnel"} sent an SOS alert.`,
    icon: "/images/philippine-army-logo.png",
    requireInteraction: true,
  });

  notification.onclick = () => {
    window.focus();
    window.location.href = "alerts.html";
  };
}

async function resolveDatabaseAlert(alertId) {
  if (!isDatabaseAlertId(alertId)) {
    alert("This history item is already cleared or is not linked to a database alert.");
    return;
  }

  if (!confirm("Mark this alert as resolved?")) return;

  try {
    const res = await fetch(`/api/alerts/${alertId}/resolve`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to resolve alert.");
      return;
    }

    loadAlertHistory();
    loadActiveAlerts();
  } catch (error) {
    console.error("Resolve database alert error:", error);
    alert("Server error while resolving alert.");
  }
}

async function closePatrolSosAlert(alertData, statusLabel) {
  if (!alertData?.patrolId) return true;

  try {
    const res = await fetch(`/api/patrols/${alertData.patrolId}/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: "sos_resolved",
        message: `SOS alert ${statusLabel} by ${user.name}.`,
        lat: alertData.lat || null,
        lng: alertData.lng || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      window.alert(data.message || `Failed to ${statusLabel} alert.`);
      return false;
    }

    socket.emit("resolve-sos", {
      patrolId: alertData.patrolId,
      alertId: alertData.alertId,
      resolvedBy: user._id || user.id,
      message: `SOS alert ${statusLabel} by ${user.name}.`,
      timestamp: new Date(),
    });

    return true;
  } catch (error) {
    console.error(`${statusLabel} alert error:`, error);
    window.alert(`Server error while ${statusLabel} alert.`);
    return false;
  }
}

function applyAlertFilters() {
  const search = document.getElementById("alertSearch")?.value.toLowerCase() || "";
  const type = document.getElementById("alertTypeFilter")?.value || "";
  const status = document.getElementById("alertStatusFilter")?.value || "";
  const date = document.getElementById("alertDateFilter")?.value || "";

  alertHistory = allDatabaseAlerts.filter((alert) => {
    const alertDate = new Date(alert.createdAt || alert.timestamp)
      .toISOString()
      .slice(0, 10);

    const searchText = [
  alert.user?.name,
  alert.user?.rank,
  alert.user?.unit,
  alert.patrol?.title,
  alert.patrol?.team,
  alert.patrol?.unit,
  alert.team,
  alert.unit,
  alert.patrolTeam,
  alert.patrolUnit,
  alert.patrolTitle,
  alert.message,
  alert.type,
  alert.status,
]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      (!search || searchText.includes(search)) &&
      (!type || alert.type === type) &&
      (!status || alert.status === status) &&
      (!date || alertDate === date)
    );
  });

  renderAlerts();
}

function clearAlertFilters() {
  document.getElementById("alertSearch").value = "";
  document.getElementById("alertTypeFilter").value = "";
  document.getElementById("alertStatusFilter").value = "";
  document.getElementById("alertDateFilter").value = "";

  alertHistory = allDatabaseAlerts;
  renderAlerts();
}

socket.on("sos-alert", (data) => {
  const alertId =
    data.alertId ||
    data.patrolId ||
    data.userId ||
    data.user?.id ||
    Date.now();

  const alert = {
    ...data,
    alertId,
    status: "active",
    timestamp: data.timestamp || new Date(),
  };

  const exists = activeAlerts.some(
    (a) => String(a.alertId) === String(alertId)
  );

  if (!exists) {
    activeAlerts.unshift(alert);
    alertHistory.unshift(alert);
  }

  saveAlerts();
  showBrowserEmergencyNotification(alert);
  renderAlerts();
  loadAlertAnalytics();
});

socket.on("sos-resolved", () => {
  loadActiveAlerts();
  loadAlertHistory();
  loadAlertAnalytics();
});

socket.on("new-alert", () => {
  loadActiveAlerts();
  loadAlertHistory();
  loadAlertAnalytics();
});

socket.on("alert-updated", () => {
  loadActiveAlerts();
  loadAlertHistory();
  loadAlertAnalytics();
});

async function acknowledgeAlert(alertId) {
  const alertData = activeAlerts.find(
    (a) => String(a.alertId || a.patrolId) === String(alertId)
  );

  if (!alertData) return;

  if (alertData.patrolId) {
    try {
      const res = await fetch(`/api/patrols/${alertData.patrolId}/logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "sos_acknowledged",
          message: "SOS received by command center. Backup is coming.",
          lat: alertData.lat || null,
          lng: alertData.lng || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        window.alert(data.message || "Failed to acknowledge alert.");
        return;
      }
    } catch (error) {
      console.error("Acknowledge alert error:", error);
      window.alert("Server error while acknowledging alert.");
      return;
    }
  }

  const closed = await closePatrolSosAlert(alertData, "acknowledged");
  if (!closed) return;

  alertData.status = "acknowledged";

  addLocalHistoryEntry({
    ...alertData,
    status: "acknowledged",
    timestamp: new Date(),
    message: `Acknowledged by ${user.name}`,
  });

  activeAlerts = activeAlerts.filter(
    (a) => String(a.alertId || a.patrolId) !== String(alertId)
  );

  saveAlerts();
  renderAlerts();
  loadAlertAnalytics();
}

async function clearAlert(alertId) {
  const alert = activeAlerts.find(
    (a) => String(a.alertId || a.patrolId) === String(alertId)
  );

  if (!alert) return;

  const closed = await closePatrolSosAlert(alert, "cleared");
  if (!closed) return;

  if (alert) {
    addLocalHistoryEntry({
      ...alert,
      status: "cleared",
      timestamp: new Date(),
      message: `Cleared by ${user.name}`,
    });
  }

  activeAlerts = activeAlerts.filter(
    (a) => String(a.alertId || a.patrolId) !== String(alertId)
  );

  saveAlerts();
  renderAlerts();
  loadAlertAnalytics();
}

function clearAllAlerts() {
  activeAlerts = [];
  saveAlerts();
  renderAlerts();
  loadAlertAnalytics();
}

function refreshAlerts() {
  loadActiveAlerts();
  loadAlertHistory();
  loadAlertAnalytics();
}

function openAlertMap(lat, lng) {
  if (!lat || !lng || lat === "undefined" || lng === "undefined") {
    alert("No GPS coordinates available for this alert.");
    return;
  }

  window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
}

function sendTestAlert() {
  socket.emit("sos-alert", {
    alertId: Date.now(),
    name: "Test Unit",
    message: "Test SOS alert from Alerts Center.",
    patrolTitle: "Test Patrol",
    area: "Command Test Area",
    timestamp: new Date(),
  });
}

function exportAlertLogs() {
  const logs = JSON.parse(localStorage.getItem("alertHistory")) || [];

  if (!logs.length) {
    alert("No alert logs to export.");
    return;
  }

  const csvRows = [
    ["Name", "Message", "Status", "Patrol", "Team", "Unit", "Area", "Time"],
    ...logs.map((log) => [
  log.user?.name || log.name || "Unknown",
  log.message || "",
  log.status || "",
  log.patrolTitle || log.patrol?.title || "",
  log.team || log.patrolTeam || log.patrol?.team || "",
  log.unit || log.patrolUnit || log.patrol?.unit || "",
  log.area || log.patrol?.area || "",
  new Date(log.timestamp || log.createdAt).toLocaleString(),
]),
  ];

  const csv = csvRows.map((row) => row.join(",")).join("\n");

  const blob = new Blob([csv], {
    type: "text/csv",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "agilacom-alert-logs.csv";
  a.click();

  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
  loadActiveAlerts();
  loadAlertHistory();
  loadAlertAnalytics();
  requestBrowserNotificationPermission();

  [
    "alertSearch",
    "alertTypeFilter",
    "alertStatusFilter",
    "alertDateFilter",
  ].forEach((id) => {
    const element = document.getElementById(id);

    if (element) {
      element.addEventListener("input", applyAlertFilters);
      element.addEventListener("change", applyAlertFilters);
    }
  });
});

async function loadAlertAnalytics() {
  try {
    const res = await fetch("/api/alerts/analytics", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error("Failed to load alert analytics");
    }

    const data = await res.json();

    const setAnalyticsValue = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.innerText = value || 0;
    };

    setAnalyticsValue("analyticsSos", data.sos);
    setAnalyticsValue("analyticsEmergency", data.emergency);
    setAnalyticsValue("analyticsMedical", data.medical);
    setAnalyticsValue("analyticsIncident", data.incident);
    setAnalyticsValue("analyticsBackup", data.backup);
    setAnalyticsValue("analyticsEnemy", data.enemy_contact);
    setAnalyticsValue("analyticsLost", data.lost_connection);
    setAnalyticsValue("analyticsDelayed", data.patrol_delayed);
  } catch (error) {
    console.error("Load alert analytics error:", error);
  }
}

loadAlertAnalytics();
setInterval(loadAlertAnalytics, 5000);
