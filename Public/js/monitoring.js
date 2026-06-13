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

const commandRoles = ["admin", "commander", "monitoring_officer"];

if (!token || !user || !commandRoles.includes(user.role)) {
  window.location.href = "access-system.html";
}

document.getElementById("adminName").innerText = user?.name || "Admin";

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "access-system.html";
}

const socket = io();

let monitoringMap;
let unitMarkers = {};

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
    renderUnitList(users);
    renderUnitMarkers(users);
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

function renderUnitList(users) {
  const list = document.getElementById("unitStatusList");

  const onlineUsers = users.filter((u) => u.isOnline);

  if (!onlineUsers.length) {
    list.innerHTML = `<p>No online units.</p>`;
    return;
  }

  list.innerHTML = onlineUsers
    .map(
      (u) => `
        <div class="monitoring-unit-card">
          <div>
            <h3>${u.rank || "PVT"} ${u.name}</h3>
            <p>${u.role || "patrol_member"}</p>
            <small>
              Signal: ${u.signalStrength || 0}% |
              Latency: ${u.latency || 0}ms
            </small>
          </div>

          <span class="online-badge">ONLINE</span>
        </div>
      `
    )
    .join("");
}

function renderUnitMarkers(users) {
  const trackedUsers = users.filter(
    (u) => u.isOnline && u.latitude && u.longitude
  );

  trackedUsers.forEach((u) => {
    const id = u._id || u.id;
    const position = [Number(u.latitude), Number(u.longitude)];

    const popup = `
      <strong>${u.rank || "PVT"} ${u.name}</strong><br>
      Role: ${u.role}<br>
      Signal: ${u.signalStrength || 0}%<br>
      Latency: ${u.latency || 0}ms<br>
      Patrol: ${u.patrolStatus || "Available"}
    `;

    if (unitMarkers[id]) {
      unitMarkers[id].setLatLng(position);
      unitMarkers[id].setPopupContent(popup);
    } else {
      unitMarkers[id] = L.marker(position)
        .addTo(monitoringMap)
        .bindPopup(popup);
    }
  });
}

socket.on("user-location-update", loadUnits);
socket.on("user-online-update", loadUnits);
socket.on("patrol-location-update", loadUnits);

document.addEventListener("DOMContentLoaded", () => {
  initMonitoringMap();
  loadUnits();

  setInterval(loadUnits, 10000);
});
