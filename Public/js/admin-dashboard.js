const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user"));

async function syncCurrentUser() {
  try {
    const response = await fetch(
      "http://localhost:5000/api/users/me",
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

if (!token || !user) {
  window.location.href = "access-system.html";
}

if (user?.role === "commander") {
  window.location.href = "commander-dashboard.html";
}

if (user && user.role !== "admin") {
  window.location.href = "access-system.html";
}

document.getElementById("adminName").innerText = user?.name || "Admin";

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "access-system.html";
}

const socket = io();
window.socket = socket;

if (user && (user._id || user.id)) {
  sendTelemetry();
  setInterval(sendTelemetry, 5000);
}

async function getLatency() {
  const start = performance.now();

  try {
    await fetch("/favicon.ico");
    return Math.round(performance.now() - start);
  } catch {
    return 999;
  }
}

async function sendTelemetry() {
  const latency = await getLatency();

  const connection =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;

  const networkType = connection?.effectiveType || "wifi";

  let signalStrength = 100;

  if (latency > 300) signalStrength = 50;
  else if (latency > 200) signalStrength = 70;
  else if (latency > 100) signalStrength = 85;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      socket.emit("user-online", {
        userId: user._id || user.id,
        signalStrength,
        latency,
        networkType,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    () => {
      socket.emit("user-online", {
        userId: user._id || user.id,
        signalStrength,
        latency,
        networkType,
      });
    },
    {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 10000,
    }
  );
}

socket.on("dashboardStats", (data) => {
  document.getElementById("onlineUnits").innerText = data.onlineUnits || 0;
  document.getElementById("activePatrols").innerText = data.activePatrols || 0;

  const activeSosAlerts =
    JSON.parse(localStorage.getItem("activeSosAlerts")) || [];

  document.getElementById("activeAlerts").innerText = activeSosAlerts.length;

  document.getElementById("signalHealth").innerText =
    (data.signalHealth || 0) + "%";
});

let dashboardMap;
let markers = {};

function initDashboardMap() {
  if (dashboardMap) return;

  dashboardMap = L.map("dashboardMap").setView([7.0731, 125.6128], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "Leaflet",
    maxZoom: 19,
  }).addTo(dashboardMap);

  setTimeout(() => {
    dashboardMap.invalidateSize();
  }, 500);

  loadLiveUsersOnce();
}

function getUserLatLng(userData) {
  const lat =
    userData.latitude ||
    userData.location?.latitude ||
    userData.location?.lat;

  const lng =
    userData.longitude ||
    userData.location?.longitude ||
    userData.location?.lng;

  if (!lat || !lng) return null;

  return [lat, lng];
}

function updateLiveMarker(userData) {
  const position = getUserLatLng(userData);
  if (!position) return;

  const userId = userData.userId || userData._id || userData.id;

  const popup = `
    <b>${userData.name || "User"}</b><br>
    Status: ${userData.isOnline ? "Online" : "Offline"}<br>
    Signal: ${userData.signalStrength || 0}%<br>
    Lat: ${position[0]}<br>
    Lng: ${position[1]}
  `;

  if (markers[userId]) {
    markers[userId].setLatLng(position);
    markers[userId].setPopupContent(popup);
  } else {
    markers[userId] = L.marker(position)
      .addTo(dashboardMap)
      .bindPopup(popup);
  }
}

async function loadLiveUsersOnce() {
  try {
    const res = await fetch("/api/users", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const users = await res.json();

    users.forEach(updateLiveMarker);
  } catch (err) {
    console.error("Initial live users load error:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initDashboardMap();

  socket.on("user-location-update", updateLiveMarker);
  socket.on("user-online-update", updateLiveMarker);
  socket.on("user-online", updateLiveMarker);
});

