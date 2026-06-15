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
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "access-system.html";
}

const socket = io();

let activeAlerts =
  JSON.parse(localStorage.getItem("activeSosAlerts")) || [];

let alertHistory =
  JSON.parse(localStorage.getItem("alertHistory")) || [];

function saveAlerts() {
  localStorage.setItem("activeSosAlerts", JSON.stringify(activeAlerts));
  localStorage.setItem("alertHistory", JSON.stringify(alertHistory));
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
              Patrol: ${alert.patrolTitle || "Unknown"} |
              Area: ${alert.area || "Unknown"} |
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
        <div class="alert-item">
          <div>
            <h3>${log.user?.name || log.name || "Unknown Personnel"}</h3>
            <p>${log.message || "Alert log"}</p>
            <small>
              Status: ${log.status || "logged"} |
              ${new Date(log.timestamp).toLocaleString()}
            </small>
          </div>
        </div>
      `
      )
      .join("");
  }
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
  renderAlerts();
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

  alertData.status = "acknowledged";

  alertHistory.unshift({
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
}

function clearAlert(alertId) {
  const alert = activeAlerts.find(
    (a) => String(a.alertId || a.patrolId) === String(alertId)
  );

  if (alert) {
    alertHistory.unshift({
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
}

function clearAllAlerts() {
  activeAlerts = [];
  saveAlerts();
  renderAlerts();
}

function refreshAlerts() {
  alertHistory =
    JSON.parse(localStorage.getItem("alertHistory")) || [];

  loadActiveAlerts();
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
    ["Name", "Message", "Status", "Patrol", "Area", "Time"],
    ...logs.map((log) => [
      log.user?.name || log.name || "Unknown",
      log.message || "",
      log.status || "",
      log.patrolTitle || "",
      log.area || "",
      new Date(log.timestamp).toLocaleString(),
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

document.addEventListener("DOMContentLoaded", loadActiveAlerts);
