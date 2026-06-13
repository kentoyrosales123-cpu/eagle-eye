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

const allowedRoles = ["admin"];

if (!token || !user || !allowedRoles.includes(user.role)) {
  window.location.href = "access-system.html";
}

document.getElementById("adminName").innerText = user?.name || "Admin";

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "access-system.html";
}

const displayName = document.getElementById("displayName");
const displayEmail = document.getElementById("displayEmail");
const displayRank = document.getElementById("displayRank");
const displayRole = document.getElementById("displayRole");

const profileSettingsForm = document.getElementById("profileSettingsForm");
const profileSettingsMessage = document.getElementById("profileSettingsMessage");

const systemSettingsForm = document.getElementById("systemSettingsForm");
const systemSettingsMessage = document.getElementById("systemSettingsMessage");

const compactModeToggle = document.getElementById("compactModeToggle");
const alertSoundToggle = document.getElementById("alertSoundToggle");
const autoRefreshToggle = document.getElementById("autoRefreshToggle");

const mapLat = document.getElementById("mapLat");
const mapLng = document.getElementById("mapLng");
const refreshInterval = document.getElementById("refreshInterval");

let settings =
  JSON.parse(localStorage.getItem("agilacomSettings")) || {
    compactMode: false,
    alertSound: true,
    autoRefresh: true,
    mapLat: 7.0731,
    mapLng: 125.6128,
    refreshInterval: 10000,
  };

function loadSettings() {
  displayName.value = user.name || "";
  displayEmail.value = user.email || "";
  displayRank.value = user.rank || "N/A";
  displayRole.value = user.role || "admin";

  compactModeToggle.checked = settings.compactMode;
  alertSoundToggle.checked = settings.alertSound;
  autoRefreshToggle.checked = settings.autoRefresh;

  mapLat.value = settings.mapLat;
  mapLng.value = settings.mapLng;
  refreshInterval.value = settings.refreshInterval;

  applySettings();
}

function saveSettings() {
  localStorage.setItem("agilacomSettings", JSON.stringify(settings));
  applySettings();
}

function applySettings() {
  if (settings.compactMode) {
    document.body.classList.add("compact-mode");
  } else {
    document.body.classList.remove("compact-mode");
  }
}

profileSettingsForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const updatedUser = {
    ...user,
    name: displayName.value.trim() || user.name,
  };

  localStorage.setItem("user", JSON.stringify(updatedUser));

  profileSettingsMessage.innerText = "Profile saved locally.";
  document.getElementById("adminName").innerText = updatedUser.name;

  setTimeout(() => {
    profileSettingsMessage.innerText = "";
  }, 2500);
});

compactModeToggle.addEventListener("change", () => {
  settings.compactMode = compactModeToggle.checked;
  saveSettings();
});

alertSoundToggle.addEventListener("change", () => {
  settings.alertSound = alertSoundToggle.checked;
  saveSettings();
});

autoRefreshToggle.addEventListener("change", () => {
  settings.autoRefresh = autoRefreshToggle.checked;
  saveSettings();
});

systemSettingsForm.addEventListener("submit", (e) => {
  e.preventDefault();

  settings.mapLat = Number(mapLat.value) || 7.0731;
  settings.mapLng = Number(mapLng.value) || 125.6128;
  settings.refreshInterval = Number(refreshInterval.value) || 10000;

  saveSettings();

  systemSettingsMessage.innerText = "System settings saved locally.";

  setTimeout(() => {
    systemSettingsMessage.innerText = "";
  }, 2500);
});

function clearLocalAlerts() {
  if (!confirm("Clear all local SOS alerts?")) return;

  localStorage.removeItem("activeSosAlerts");
  localStorage.removeItem("alertHistory");

  alert("Local alerts cleared.");
}

function clearCommunicationLogs() {
  if (!confirm("Clear all local communication logs?")) return;

  localStorage.removeItem("communicationLogs");

  alert("Communication logs cleared.");
}

function resetLocalSettings() {
  if (!confirm("Reset local AgilaCom settings?")) return;

  localStorage.removeItem("agilacomSettings");

  alert("Settings reset. Page will reload.");
  location.reload();
}

document.addEventListener("DOMContentLoaded", loadSettings);
