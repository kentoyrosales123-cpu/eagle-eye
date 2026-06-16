const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user"));

const socket = io();

function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) {
    console.warn("Browser notifications are not supported.");
    return;
  }

  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

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

const commandRoles = ["admin", "commander", "monitoring_officer"];

if (!token || !user || !commandRoles.includes(user.role)) {
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

let monitoringMap;
let unitMarkers = {};
let unitAccuracyCircles = {};
let patrolRouteLines = {};
let emergencyAlerts = [];
let allActivePatrols = [];
const criticalAlertSoundPath = "/sounds/critical-alert.mp3";
function createAlertAudio() {
  const audio = new Audio(criticalAlertSoundPath);
  audio.loop = true;
  audio.preload = "auto";
  audio.load();
  return audio;
}

let activeAlertAudio = createAlertAudio();
let alertSoundUnlocked = false;
let pendingAlertSoundType = null;

function renderEmergencyAlerts() {
  const list = document.getElementById("emergencyAlertList");
  const count = document.getElementById("activeAlerts");

  if (count) count.innerText = emergencyAlerts.length;

  if (!list) return;

  if (!emergencyAlerts.length) {
    list.innerHTML = `<p>No emergency alerts.</p>`;
    return;
  }

  list.innerHTML = emergencyAlerts
    .map((alert) => {
      const time = new Date(
  alert.timestamp || Date.now()
).toLocaleString();

      return `
  <div class="
  emergency-alert-card
  ${
    ["sos", "emergency", "enemy_contact"]
      .includes(alert.type)
      ? "priority-red"
      : ["backup", "backup_request"].includes(alert.type)
      ? "priority-orange"
      : [
          "patrol_delayed",
          "lost_connection"
        ].includes(alert.type)
      ? "priority-yellow"
      : ""
  }
">

    <div class="alert-header">
      <strong>
        <span class="${
          ["sos", "emergency", "enemy_contact"].includes(alert.type)
            ? "badge-red"
            : ["backup", "backup_request"].includes(alert.type)
            ? "badge-orange"
            : "badge-yellow"
        }">
🚨 ${(
  alert.type || "sos"
)
  .replaceAll("_", " ")
  .toUpperCase()}
        </span>
      </strong>

      <span class="alert-time">
        ${time}
      </span>
    </div>

    <p>
      ${alert.message || "Emergency alert received."}
    </p>

    <small>
  Patrol:
  ${alert.patrolTitle || "Unknown"}

  |

  Team:
  ${alert.team || "Unassigned"}

  |

  Unit:
  ${alert.unit || "N/A"}

  |

  User:
  ${alert.user?.name || alert.name || "Unknown"}
</small>

    <div class="alert-actions">
      <button
        class="acknowledge-btn"
        onclick="acknowledgeSOS(
  '${alert.userId || alert.user?._id || alert.user?.id || ""}',
  '${alert.patrolId || alert.patrol?._id || ""}'
)"
      >
        ✅ ACKNOWLEDGE SOS
      </button>

      <button class="acknowledge-btn" onclick="focusSOSLocation(${alert.lat}, ${alert.lng})">
        📍 LOCATE
      </button>

      <button class="acknowledge-btn" onclick="dispatchBackup('${alert.patrolId || ""}')">
        🚓 DISPATCH BACKUP
      </button>

      <button class="acknowledge-btn" onclick="resolveSOS('${alert.patrolId || ""}')">
        🟢 RESOLVE
      </button>
    </div>

  </div>
`;
    })
    .join("");
}

function trackEmergencyAlert(data) {
  const alertId =
    data.alertId ||
    data._id ||
    data.patrolId ||
    data.userId ||
    data.user?.id ||
    data.user?._id ||
    Date.now();

  const alertData = {
    ...data,
    alertId,
    timestamp: data.timestamp || new Date(),
  };

  const existingIndex = emergencyAlerts.findIndex((alert) => {
    return String(alert.alertId || alert.patrolId || alert.userId) ===
      String(alertId);
  });

  if (existingIndex >= 0) {
    emergencyAlerts[existingIndex] = alertData;
  } else {
    emergencyAlerts.unshift(alertData);
  }

  renderEmergencyAlerts();
showEmergencyPopup(alertData);
showBrowserEmergencyNotification(alertData);
}

function focusSOSLocation(lat, lng) {
  if (!lat || !lng) {
    alert("No GPS location available for this SOS.");
    return;
  }

  monitoringMap.flyTo([lat, lng], 17);
}

function showEmergencyPopup(data) {
  const existing =
    document.getElementById("emergencyPopup");

  if (existing) {
    existing.remove();
  }

  const popup =
    document.createElement("div");

  popup.id = "emergencyPopup";

  popup.innerHTML = `
    <div class="emergency-popup-box">
      <h2>🚨 EMERGENCY ALERT</h2>

      <p>
        <strong>Type:</strong>
        ${(data.type || "sos")
          .replaceAll("_", " ")
          .toUpperCase()}
      </p>

      <p>
        <strong>Patrol:</strong>
        ${data.patrolTitle || "Unknown Patrol"}
      </p>

      <p>
  <strong>Team:</strong>
  ${data.team || "Unassigned"}
</p>

<p>
  <strong>Unit:</strong>
  ${data.unit || "N/A"}
</p>

      <p>
        <strong>Personnel:</strong>
        ${data.user?.name || "Unknown Personnel"}
      </p>

      <p>
        <strong>Time:</strong>
        ${new Date(
  data.timestamp || Date.now()
).toLocaleString()}
      </p>

      <div class="emergency-popup-actions">
        <button onclick="focusSOSLocation(${data.lat}, ${data.lng})">
          📍 View Location
        </button>

        <button onclick="resolveSOS('${data.patrolId || ""}')">
          🟢 Resolve
        </button>

        <button onclick="document.getElementById('emergencyPopup').remove()">
          Close
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  if (
    data.lat &&
    data.lng &&
    monitoringMap
  ) {
    monitoringMap.flyTo(
      [data.lat, data.lng],
      18
    );
  }

  playAlertSound(data.type);
}

function dispatchBackup(patrolId) {
  socket.emit("dispatch-backup", {
    patrolId,
    message: "Backup has been dispatched to your location.",
    timestamp: new Date(),
  });

  alert("Backup dispatch notification sent.");
}

async function resolveSOS(patrolId) {
  const normalizedPatrolId =
    patrolId && patrolId !== "undefined" ? patrolId : null;

  if (!normalizedPatrolId) {
    alert("No patrol linked to this SOS alert.");
    return;
  }

  stopAlertSound();

  try {
    const res = await fetch(`/api/patrols/${normalizedPatrolId}/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: "sos_resolved",
        message: "SOS incident resolved by monitoring command.",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to resolve SOS alert.");
      return;
    }
  } catch (error) {
    console.error("Resolve SOS error:", error);
    alert("Server error while resolving SOS alert.");
    return;
  }

  socket.emit("resolve-sos", {
    patrolId: normalizedPatrolId,
    message: "SOS incident has been marked as resolved by command.",
    timestamp: new Date(),
  });

  emergencyAlerts = emergencyAlerts.filter(
    (alert) => String(alert.patrolId || "") !== String(normalizedPatrolId)
  );
  renderEmergencyAlerts();

  alert("SOS incident marked as resolved.");
}

async function acknowledgeSOS(userId, patrolId = null) {
  const normalizedUserId =
    userId && userId !== "undefined" ? userId : null;
  const normalizedPatrolId =
    patrolId && patrolId !== "undefined" ? patrolId : null;

  stopAlertSound();

  if (normalizedPatrolId) {
    try {
      const res = await fetch(`/api/patrols/${normalizedPatrolId}/logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "sos_acknowledged",
          message: "SOS received by monitoring command. Assistance is being coordinated.",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Failed to acknowledge SOS alert.");
        return;
      }
    } catch (error) {
      console.error("Acknowledge SOS error:", error);
      alert("Server error while acknowledging SOS alert.");
      return;
    }
  }

  socket.emit("sos-acknowledged", {
    userId: normalizedUserId,
    patrolId: normalizedPatrolId,
    message:
      "COMMAND RECEIVED YOUR SOS. Stay in position. Assistance is being coordinated.",
    timestamp: new Date(),
  });

  alert("SOS acknowledgment sent to patrol team.");
}

async function loadEmergencyAlerts() {
  try {
    const res = await fetch("/api/patrols/active-sos-alerts", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const alerts = await res.json();

    if (!res.ok) {
      console.error("Load emergency alerts failed:", alerts.message);
      renderEmergencyAlerts();
      return;
    }

    emergencyAlerts = alerts;
    renderEmergencyAlerts();
  } catch (error) {
    console.error("Load emergency alerts error:", error);
    renderEmergencyAlerts();
  }
}

function renderPatrolRoutes(patrols) {
  patrols.forEach((patrol) => {
    const route = patrol.routeHistory || [];

    if (route.length < 2) return;

    const coordinates = route
      .filter((point) => point.lat && point.lng)
      .map((point) => [point.lat, point.lng]);

    if (coordinates.length < 2) return;

    const patrolId = patrol._id || patrol.id;

    if (patrolRouteLines[patrolId]) {
      patrolRouteLines[patrolId].setLatLngs(coordinates);
    } else {
      patrolRouteLines[patrolId] = L.polyline(coordinates, {
        color: "#d4af37",
        weight: 4,
        opacity: 0.85,
      }).addTo(monitoringMap);
    }
  });
}

function initMonitoringMap() {
  monitoringMap = L.map("monitoringMap").setView([7.0731, 125.6128], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(monitoringMap);

  setTimeout(() => {
    monitoringMap.invalidateSize();
  }, 500);
}

async function loadUnits() {
  try {
    const res = await fetch("/api/users", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const users = await res.json();

    renderUnitStats(users);
  } catch (error) {
    console.error("Load monitoring users error:", error);
  }
}

function renderUnitStats(users) {
  const onlineUsers = users.filter((u) => u.isOnline);
  const trackedUsers = onlineUsers.filter((u) => u.latitude && u.longitude);

  const totalSignal = onlineUsers.reduce(
    (sum, u) => sum + (u.signalStrength || 0),
    0
  );

  const avgSignal = onlineUsers.length
    ? Math.round(totalSignal / onlineUsers.length)
    : 0;

  document.getElementById("onlineUnits").innerText = onlineUsers.length;
  document.getElementById("trackedUnits").innerText = trackedUsers.length;
  document.getElementById("averageSignal").innerText = avgSignal + "%";
  document.getElementById("lastRefresh").innerText =
    new Date().toLocaleTimeString();
}


function renderUnitMarkers(users) {
  const trackedUsers = users.filter(
    (u) => u.isOnline && u.latitude && u.longitude
  );

  trackedUsers.forEach((u) => {
    const id = u._id || u.id;
    const position = [Number(u.latitude), Number(u.longitude)];
    const accuracy = Number(u.accuracy);
    const validAccuracy =
      Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null;
    const accuracyText = validAccuracy ? `${Math.round(validAccuracy)} m` : "Unknown";

    const popup = `
  <strong>${u.rank || "PVT"} ${u.name}</strong><br>
  Role: ${u.role}<br>
  Unit: ${u.unit || "N/A"}<br>
  Team: ${u.team || "N/A"}<br>
  Patrol: ${u.patrolTitle || "Available"}<br>
  Tactical Status: ${
    !u.isOnline
      ? "OFFLINE"
      : u.tacticalStatus === "emergency"
      ? "EMERGENCY"
      : u.tacticalStatus === "idle"
      ? "IDLE"
      : "ACTIVE"
  }<br>
  Signal: ${u.signalStrength || 0}%<br>
  Latency: ${u.latency || 0}ms<br>
  Accuracy: ${accuracyText}
`;

    if (validAccuracy) {
      if (unitAccuracyCircles[id]) {
        unitAccuracyCircles[id].setLatLng(position);
        unitAccuracyCircles[id].setRadius(validAccuracy);
      } else {
        unitAccuracyCircles[id] = L.circle(position, {
          radius: validAccuracy,
          color: "#38bdf8",
          weight: 1,
          opacity: 0.8,
          fillColor: "#38bdf8",
          fillOpacity: 0.12,
        }).addTo(monitoringMap);
      }
    } else if (unitAccuracyCircles[id]) {
      monitoringMap.removeLayer(unitAccuracyCircles[id]);
      delete unitAccuracyCircles[id];
    }

    if (unitMarkers[id]) {
      unitMarkers[id].setLatLng(position);
      unitMarkers[id].setPopupContent(popup);
    } else {
      unitMarkers[id] = L.marker(position)
        .addTo(monitoringMap)
        .bindPopup(popup);
    }
  });

  Object.keys(unitMarkers).forEach((id) => {
    const stillTracked = trackedUsers.some(
      (u) => String(u._id || u.id) === String(id)
    );

    if (!stillTracked) {
      monitoringMap.removeLayer(unitMarkers[id]);
      delete unitMarkers[id];
    }

    if (!stillTracked && unitAccuracyCircles[id]) {
      monitoringMap.removeLayer(unitAccuracyCircles[id]);
      delete unitAccuracyCircles[id];
    }
  });
}

async function loadActivePatrolGroups() {
  try {
    const res = await fetch("/api/patrols/active", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const patrols = await res.json();

    const activePatrolsCard = document.getElementById("activePatrols");

if (activePatrolsCard) {
  activePatrolsCard.innerText = patrols.length;
}

    allActivePatrols = patrols;

populatePatrolFilters(patrols);
applyPatrolFilters();
  } catch (error) {
    console.error("Load patrol groups error:", error);
  }
}

function populatePatrolFilters(patrols) {
  const unitFilter = document.getElementById("unitFilter");
  const teamFilter = document.getElementById("teamFilter");

  if (!unitFilter || !teamFilter) return;

  const currentUnit = unitFilter.value;
  const currentTeam = teamFilter.value;

  const units = [...new Set(patrols.map((p) => p.unit).filter(Boolean))];
  const teams = [...new Set(patrols.map((p) => p.team).filter(Boolean))];

  unitFilter.innerHTML =
    `<option value="">All Units</option>` +
    units.map((unit) => `<option value="${unit}">${unit}</option>`).join("");

  teamFilter.innerHTML =
    `<option value="">All Patrol Teams</option>` +
    teams.map((team) => `<option value="${team}">${team}</option>`).join("");

  unitFilter.value = currentUnit;
  teamFilter.value = currentTeam;
}

function applyPatrolFilters() {
  const unit = document.getElementById("unitFilter")?.value || "";
  const team = document.getElementById("teamFilter")?.value || "";
  const status = document.getElementById("statusFilter")?.value || "";
  const online = document.getElementById("onlineFilter")?.value || "";

  let filteredPatrols = allActivePatrols.filter((patrol) => {
    const personnel = [
      patrol.patrolLeader,
      ...(patrol.assignedUsers || []),
    ].filter(Boolean);

    const hasOnline = personnel.some((p) => p.isOnline);
    const hasOffline = personnel.some((p) => !p.isOnline);

    return (
      (!unit || patrol.unit === unit) &&
      (!team || patrol.team === team) &&
      (!status || patrol.status === status) &&
      (!online ||
        (online === "online" && hasOnline) ||
        (online === "offline" && hasOffline))
    );
  });

  renderPatrolGroups(filteredPatrols);
  renderPatrolTeamMarkers(filteredPatrols);
  renderPatrolRoutes(filteredPatrols);
}

function clearPatrolFilters() {
  document.getElementById("unitFilter").value = "";
  document.getElementById("teamFilter").value = "";
  document.getElementById("statusFilter").value = "";
  document.getElementById("onlineFilter").value = "";

  applyPatrolFilters();
}

function renderPatrolGroups(patrols) {
  const list = document.getElementById("patrolGroupList");

  if (!patrols.length) {
    list.innerHTML = `<p>No active patrol groups.</p>`;
    return;
  }

  list.innerHTML = patrols
    .map((patrol) => {
      const leader = patrol.patrolLeader;
      const members = patrol.assignedUsers || [];

      return `
  <div class="tactical-patrol-card">

    <div class="tactical-header">
      <div>
        <h3>
          🛡 ${patrol.team || "UNASSIGNED"}
        </h3>

        <p class="mission-name">
          ${patrol.title}
        </p>
      </div>

      <span class="status-badge ${patrol.status}">
        ${patrol.status.toUpperCase()}
      </span>
    </div>

    <div class="tactical-divider"></div>

    <div class="tactical-meta">
      <div>
        <span>📍 UNIT</span>
        <strong>${patrol.unit || "N/A"}</strong>
      </div>

      <div>
        <span>👨‍✈️ LEADER</span>
        <strong>
          ${
            leader
              ? `${leader.rank || ""} ${leader.name}`
              : "No Leader"
          }
        </strong>
      </div>
    </div>

    <div class="member-section">
      <div class="member-title">
        👥 TEAM MEMBERS
      </div>

      ${
        members.length
          ? members
              .map(
                (m) => `
              <div class="member-row">
                <span class="member-name">
                  ${m.rank || ""} ${m.name}
                </span>

                <span class="${
  !m.isOnline
    ? "member-offline"
    : m.tacticalStatus === "emergency"
    ? "member-emergency"
    : m.tacticalStatus === "idle"
    ? "member-idle"
    : "member-online"
}">
  ${
    !m.isOnline
      ? "⚫ OFFLINE"
      : m.tacticalStatus === "emergency"
      ? "🔴 EMERGENCY"
      : m.tacticalStatus === "idle"
      ? "🟡 IDLE"
      : "🟢 ACTIVE"
  }
</span>
                </span>
              </div>
            `
              )
              .join("")
          : `<p>No members assigned</p>`
      }
    </div>

    <div class="tactical-footer">
      <span>📡 GPS LINKED</span>
      <span>🛰 LIVE TRACKING</span>
    </div>

  </div>
`;
    })
    .join("");
}

function renderPatrolTeamMarkers(patrols) {
  const allPersonnel = [];

  patrols.forEach((patrol) => {
    if (patrol.patrolLeader) {
      allPersonnel.push({
        ...patrol.patrolLeader,
        patrolTitle: patrol.title,
        team: patrol.team,
        unit: patrol.unit,
        patrolStatus: patrol.status,
        isLeader: true,
      });
    }

    (patrol.assignedUsers || []).forEach((member) => {
      allPersonnel.push({
        ...member,
        patrolTitle: patrol.title,
        team: patrol.team,
        unit: patrol.unit,
        patrolStatus: patrol.status,
        isLeader: false,
      });
    });
  });

  renderUnitMarkers(allPersonnel);
}

socket.on("user-location-update", () => {
  loadUnits();
  loadActivePatrolGroups();
});

socket.on("sos-alert", trackEmergencyAlert);
socket.on("emergency-alert", trackEmergencyAlert);
socket.on("incident-alert", trackEmergencyAlert);
socket.on("backup-request", trackEmergencyAlert);
socket.on("patrol-delayed", trackEmergencyAlert);
socket.on("lost-connection", trackEmergencyAlert);

/* Removed legacy popup renderer; all alert events use trackEmergencyAlert.
    <div class="emergency-popup-box">
      <h2>🚨 EMERGENCY ALERT</h2>

      <p>
        <strong>Type:</strong>
        ${(data.type || "sos")
  .replaceAll("_", " ")
  .toUpperCase()}
      </p>

      <p>
        <strong>Patrol:</strong>
        ${data.patrolTitle || "Unknown"}
      </p>

      <p>
        <strong>Personnel:</strong>
        ${data.user?.name || "Unknown"}
      </p>

      <p>
        <strong>Time:</strong>
        ${new Date(
          data.timestamp
        ).toLocaleTimeString()}
      </p>

      <button onclick="focusSOSLocation(${data.lat}, ${data.lng})">
        📍 VIEW LOCATION
      </button>

      <button onclick="this.parentElement.parentElement.remove()">
        CLOSE
      </button>
    </div>
  `;

  document.body.appendChild(popup);

  if (data.lat && data.lng) {
    monitoringMap.flyTo(
      [data.lat, data.lng],
      18
    );
  }

  playAlertSound(data.type);
}
*/

function unlockAlertSound() {
  if (alertSoundUnlocked || !activeAlertAudio) return;

  activeAlertAudio.volume = 0;

  activeAlertAudio
    .play()
    .then(() => {
      activeAlertAudio.pause();
      activeAlertAudio.currentTime = 0;
      activeAlertAudio.volume = 1;
      alertSoundUnlocked = true;

      if (pendingAlertSoundType || emergencyAlerts.length) {
        playAlertSound(pendingAlertSoundType || "sos");
        pendingAlertSoundType = null;
      }
    })
    .catch(() => {
      activeAlertAudio.volume = 1;
    });
}

function playAlertSound(type = "sos") {
  const alarmTypes = [
    "sos",
    "emergency",
    "enemy_contact",
    "backup_request",
  ];
  const normalizedType = String(type || "sos").toLowerCase();

  if (!alarmTypes.includes(normalizedType)) return;

  if (!activeAlertAudio) {
    activeAlertAudio = createAlertAudio();
  }

  stopAlertSound();

  activeAlertAudio.loop = true;
  activeAlertAudio.volume = 1;
  activeAlertAudio.currentTime = 0;

  const tryPlay = () => {
    activeAlertAudio
      .play()
      .then(() => {
        pendingAlertSoundType = null;
      })
      .catch((error) => {
        pendingAlertSoundType = normalizedType;

        if (error?.name === "NotAllowedError") {
          console.log("Alert sound blocked until the page is clicked.");
        } else {
          console.log("Alert sound could not start:", error?.message || error);
        }
      });
  };

  if (activeAlertAudio.readyState < 2) {
    let didTryPlay = false;
    const tryPlayOnce = () => {
      if (didTryPlay) return;
      didTryPlay = true;
      tryPlay();
    };

    activeAlertAudio.addEventListener("canplay", tryPlayOnce, {
      once: true,
    });
    activeAlertAudio.addEventListener("canplaythrough", tryPlayOnce, {
      once: true,
    });
    activeAlertAudio.load();
    setTimeout(tryPlayOnce, 600);
    return;
  }

  tryPlay();
}

function stopAlertSound() {
  pendingAlertSoundType = null;

  if (!activeAlertAudio) return;

  activeAlertAudio.pause();
  activeAlertAudio.currentTime = 0;
}



socket.on("sos-resolved", (data) => {
  stopAlertSound();

  emergencyAlerts = emergencyAlerts.filter(
    (alert) =>
      String(alert.patrolId || "") !==
      String(data.patrolId || "")
  );

  renderEmergencyAlerts();
});

socket.on("sos-acknowledged", (data) => {
  stopAlertSound();
});

socket.on("user-online-update", () => {
  loadUnits();
  loadActivePatrolGroups();
});

socket.on("patrol-location-update", () => {
  loadUnits();
  loadActivePatrolGroups();
});

socket.on("patrol-route-updated", (data) => {
  loadActivePatrolGroups();
});

socket.on("patrol-status-updated", loadActivePatrolGroups);
socket.on("patrol-started", loadActivePatrolGroups);

document.addEventListener("DOMContentLoaded", () => {
  requestBrowserNotificationPermission();
  initMonitoringMap();
  loadUnits();
loadActivePatrolGroups();
loadEmergencyAlerts();

document.addEventListener("pointerdown", unlockAlertSound, { once: true });
document.addEventListener("keydown", unlockAlertSound, { once: true });

["unitFilter", "teamFilter", "statusFilter", "onlineFilter"].forEach((id) => {
  const filter = document.getElementById(id);

  if (filter) {
    filter.addEventListener("change", applyPatrolFilters);
  }
});

setInterval(() => {
  loadUnits();
  loadActivePatrolGroups();
  loadEmergencyAlerts();
}, 10000);
});

function showBrowserEmergencyNotification(alert) {
  if (!("Notification" in window)) return;

  if (Notification.permission !== "granted") return;

  const title = "🚨 AGILACOM Emergency Alert";

  const body = `${alert.user?.name || alert.name || "Unknown Personnel"} sent an emergency alert. ${
    alert.message || "Immediate attention required."
  }`;

  const notification = new Notification(title, {
    body,
    icon: "/images/philippine-army-logo.png",
    badge: "/images/philippine-army-logo.png",
    requireInteraction: true,
  });

  notification.onclick = () => {
    window.focus();
    window.location.href = "monitoring.html";
  };
}
