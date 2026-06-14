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

let currentUsers = [];
let currentFilteredUsers = [];
let sortColumn = "";
let sortDirection = "asc";

const editUserModal = document.getElementById("editUserModal");
const editUserForm = document.getElementById("editUserForm");
const editUserMessage = document.getElementById("editUserMessage");
const editAssignedCommanderSelect = document.getElementById("editAssignedCommander");

if (!token || !user || user.role !== "admin") {
  window.location.href = "access-system.html";
}

document.getElementById("adminName").innerText = user?.name || "Admin";

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "access-system.html";
}

const createUserForm = document.getElementById("createUserForm");
const createUserMessage = document.getElementById("createUserMessage");
const usersTableBody = document.getElementById("usersTableBody");
const assignedCommanderSelect = document.getElementById("assignedCommander");
const userSearch =
  document.getElementById("userSearch");

const roleFilter =
  document.getElementById("roleFilter");

const rankFilter =
  document.getElementById("rankFilter");

const unitFilter =
  document.getElementById("unitFilter");

const statusFilter =
  document.getElementById("statusFilter");

const clearFiltersBtn =
  document.getElementById("clearFiltersBtn");

let map;
let fullscreenMap;

let markers = {};
let fullscreenMarkers = {};
let accuracyCircles = {};
let fullscreenAccuracyCircles = {};

let trails = {};
let trailPaths = {};
let fullscreenTrailPaths = {};

const greenIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const yellowIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const redIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const blueIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function initMap() {
  if (map) return;

  map = L.map("usersMap").setView([7.1907, 125.4553], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(map);
}

async function loadUsers() {
  try {
    usersTableBody.innerHTML = `
      <tr class="loading-row">
        <td colspan="14">
          <div class="table-loading">
            <span class="loading-spinner"></span>
            Loading users...
          </div>
        </td>
      </tr>
    `;
    const response = await fetch("/api/users", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const users = await response.json();
    currentUsers = users;

    if (!response.ok) {
      throw new Error(users.message || "Failed to load users");
    }

    renderCommanderOptions(users);
    applyUserFilters();
  } catch (error) {
    usersTableBody.innerHTML = `
      <tr>
        <td colspan="14">${error.message}</td>
      </tr>
    `;
  }
}

function getUserId(userData) {
  return userData?._id || userData?.id || userData;
}

function getCommanderName(assignedCommander, users) {
  if (!assignedCommander) return "No commander";

  if (typeof assignedCommander === "object") {
    return assignedCommander.name || "No commander";
  }

  const commander = users.find(
    (candidate) => String(getUserId(candidate)) === String(assignedCommander)
  );

  return commander?.name || "No commander";
}

function formatRole(role) {
  return (role || "patrol_member")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeKeywords(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeSearchInput() {
  const sanitized = (userSearch.value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s+/, "");

  if (userSearch.value !== sanitized) {
    userSearch.value = sanitized;
  }

  return sanitized.trim();
}

function renderCommanderOptions(users) {
  const selectedValue = assignedCommanderSelect.value;
  const commanders = users.filter((u) => u.role === "commander");

  assignedCommanderSelect.innerHTML = '<option value="">No commander</option>';

  commanders.forEach((commander) => {
    const option = document.createElement("option");
    option.value = getUserId(commander);
    option.textContent = `${commander.rank || "PVT"} ${commander.name}`;
    assignedCommanderSelect.appendChild(option);
  });

  assignedCommanderSelect.value = selectedValue;
}
function applyUserFilters() {
  const search =
    sanitizeSearchInput();

  const keywords =
    search ? search.split(" ") : [];

  const role =
    roleFilter.value;

  const rank =
    rankFilter.value;

  const unit =
    unitFilter.value;

  const status =
    statusFilter.value;

  const filteredUsers =
    currentUsers.filter((u) => {
      const searchableText = normalizeKeywords([
        u.name,
        u.email,
        u.rank,
        u.role,
        formatRole(u.role),
        u.unit,
        u.team,
        u.status,
        getCommanderName(u.assignedCommander, currentUsers),
      ].filter(Boolean).join(" "));

      const matchesSearch =
        keywords.length === 0 ||
        keywords.every((keyword) => searchableText.includes(keyword));

      const matchesRole =
        !role || u.role === role;

      const matchesRank =
        !rank || u.rank === rank;

      const matchesUnit =
        !unit || u.unit === unit;

      const matchesStatus =
        !status || u.status === status;

      return (
        matchesSearch &&
        matchesRole &&
        matchesRank &&
        matchesUnit &&
        matchesStatus
      );
    });

  currentFilteredUsers = filteredUsers;
renderUsers(sortUserList(filteredUsers));
renderMapUsers(filteredUsers);

}

function sortUserList(users) {
  if (!sortColumn) return users;

  return [...users].sort((a, b) => {
    let valueA = a[sortColumn] || "";
    let valueB = b[sortColumn] || "";

    if (sortColumn === "lastSeen") {
      valueA = valueA ? new Date(valueA).getTime() : 0;
      valueB = valueB ? new Date(valueB).getTime() : 0;
    }

    if (
      sortColumn === "signalStrength" ||
      sortColumn === "latency"
    ) {
      valueA = Number(valueA) || 0;
      valueB = Number(valueB) || 0;
    }

    if (typeof valueA === "string") {
      valueA = valueA.toLowerCase();
      valueB = String(valueB).toLowerCase();
    }

    if (valueA < valueB) return sortDirection === "asc" ? -1 : 1;
    if (valueA > valueB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });
}

function sortUsers(column) {
  if (sortColumn === column) {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
  } else {
    sortColumn = column;
    sortDirection = "asc";
  }

  updateSortIcons();
  renderUsers(sortUserList(currentFilteredUsers));
}

function updateSortIcons() {
  document
    .querySelectorAll("[id^='sort-']")
    .forEach((icon) => {
      icon.innerText = "↕";
    });

  const activeIcon = document.getElementById(`sort-${sortColumn}`);

  if (activeIcon) {
    activeIcon.innerText = sortDirection === "asc" ? "↑" : "↓";
  }
}

function renderUsers(users) {
  usersTableBody.innerHTML = "";

  if (!users.length) {
    usersTableBody.innerHTML = `
  <tr class="empty-row">
    <td colspan="14">
      <div class="table-empty-state">
        <i class="fa-solid fa-user-slash"></i>
        <h3>No matching users found</h3>
        <p>Try changing your search keyword or filter selection.</p>
      </div>
    </td>
  </tr>
`;
    return;
  }

  users.forEach((u) => {
    const isOnline = Boolean(u.isOnline);

    const coordinates = isOnline && u.latitude && u.longitude
      ? `
        <span>${u.latitude.toFixed(6)}</span>
        <span>${u.longitude.toFixed(6)}</span>
      `
      : "";

    const signalStrength = isOnline && u.signalStrength !== null && u.signalStrength !== undefined
      ? `${u.signalStrength}%`
      : "";

    const latency = isOnline && u.latency !== null && u.latency !== undefined
      ? `${u.latency} ms`
      : "";

    const lastSeen = isOnline && u.lastSeen
      ? new Date(u.lastSeen).toLocaleString()
      : "";

    usersTableBody.innerHTML += `
      <tr>
        <td class="user-name-cell">
          <strong>${u.name}</strong>
          <small>${u.email || ""}</small>
        </td>
        <td><span class="table-chip">${u.rank || "PVT"}</span></td>
        <td><span class="table-chip role-chip">${formatRole(u.role)}</span></td>
        <td><span class="table-text">${u.unit || "Alpha"}</span></td>
        <td><span class="table-text">${u.team || "Team 1"}</span></td>
        <td><span class="commander-cell">${getCommanderName(u.assignedCommander, currentUsers)}</span></td>
        <td>
          <span class="table-chip ${
            u.status === "active" ? "status-active" : "status-inactive"
          }">
            ${formatRole(u.status || "active")}
          </span>
        </td>
        <td>
          <span class="${isOnline ? "online-badge" : "offline-badge"}">
            ${isOnline ? "Online" : "Offline"}
          </span>
        </td>
        <td>
          <span class="${
            u.patrolStatus === "On Patrol"
              ? "patrol-active"
              : u.patrolStatus === "Scheduled Patrol"
              ? "patrol-scheduled"
              : "patrol-available"
          }">
            ${u.patrolStatus}
          </span>
        </td>
        <td class="coordinates-cell">${coordinates}</td>
        <td class="metric-cell">${signalStrength}</td>
        <td class="metric-cell">${latency}</td>
        <td class="last-seen-cell">${lastSeen}</td>
        <td>
  <div class="table-action-group">
    <button
  class="table-action-btn"
  onclick="openEditUserModal('${u._id}')"
>
  Edit
</button>

<button
  class="table-action-btn ${
    u.status === "active"
      ? "danger-btn"
      : "success-btn"
  }"
  onclick="toggleUserStatus(
    '${u._id}',
    '${u.status}'
  )"
  ${String(u._id) === String(user._id || user.id)
    ? "disabled"
    : ""}
>
  ${
    u.status === "active"
      ? "Deactivate"
      : "Activate"
  }
</button>
  </div>
</td>
      </tr>
    `;
  });
}

function moveMarkerSmoothly(marker, newLatLng) {
  const currentLatLng = marker.getLatLng();

  const steps = 20;
  let step = 0;

  const latStep = (newLatLng[0] - currentLatLng.lat) / steps;
  const lngStep = (newLatLng[1] - currentLatLng.lng) / steps;

  const interval = setInterval(() => {
    step++;

    const lat = currentLatLng.lat + latStep * step;
    const lng = currentLatLng.lng + lngStep * step;

    marker.setLatLng([lat, lng]);

    if (step >= steps) {
      clearInterval(interval);
    }
  }, 40);
}

function updateUserTrail(userId, latLng) {
  if (!trails[userId]) {
    trails[userId] = [];
  }

  trails[userId].push(latLng);

  // Keep only latest 30 points
  if (trails[userId].length > 30) {
    trails[userId].shift();
  }

  if (trailPaths[userId]) {
    trailPaths[userId].setLatLngs(trails[userId]);
  } else {
    trailPaths[userId] = L.polyline(trails[userId], {
      weight: 4,
      opacity: 0.75,
    }).addTo(map);
  }
}

function getLocationAccuracy(userData) {
  const accuracy = Number(userData.accuracy || userData.location?.accuracy);

  return Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null;
}

function upsertAccuracyCircle(circleStore, targetMap, userId, latLng, accuracy) {
  if (!targetMap) return;

  if (!accuracy) {
    if (circleStore[userId]) {
      targetMap.removeLayer(circleStore[userId]);
      delete circleStore[userId];
    }

    return;
  }

  if (circleStore[userId]) {
    circleStore[userId].setLatLng(latLng);
    circleStore[userId].setRadius(accuracy);
    return;
  }

  circleStore[userId] = L.circle(latLng, {
    radius: accuracy,
    color: "#38bdf8",
    weight: 1,
    opacity: 0.8,
    fillColor: "#38bdf8",
    fillOpacity: 0.12,
  }).addTo(targetMap);
}

function updateFullscreenMapUser(u, selectedIcon, newLatLng) {
  if (!fullscreenMap || !mapModal.classList.contains("show")) return;

  const accuracy = getLocationAccuracy(u);
  const accuracyText = accuracy ? `${Math.round(accuracy)} m` : "Unknown";

  if (fullscreenMarkers[u._id]) {
    fullscreenMarkers[u._id].setIcon(selectedIcon);
    moveMarkerSmoothly(fullscreenMarkers[u._id], newLatLng);
  } else {
    fullscreenMarkers[u._id] = L.marker(newLatLng, {
      icon: selectedIcon,
    }).addTo(fullscreenMap);
  }

  fullscreenMarkers[u._id].bindPopup(`
    <div style="min-width:200px">
      <h3 style="margin:0">${u.name}</h3>
      <hr>
      <b>Role:</b> ${u.role}<br>
      <b>Status:</b> ${u.isOnline ? "Online" : "Offline"}<br>
      <b>Signal:</b> ${u.signalStrength || 0}%<br>
      <b>Latency:</b> ${u.latency || 0} ms<br>
      <b>Network:</b> ${u.networkType || "unknown"}<br>
      <b>Accuracy:</b> ${accuracyText}<br>
      <b>Coordinates:</b><br>
      ${Number(u.latitude).toFixed(6)},
      ${Number(u.longitude).toFixed(6)}
    </div>
  `);

  upsertAccuracyCircle(
    fullscreenAccuracyCircles,
    fullscreenMap,
    u._id,
    newLatLng,
    accuracy
  );

  if (trails[u._id]) {
    if (fullscreenTrailPaths[u._id]) {
      fullscreenTrailPaths[u._id].setLatLngs(trails[u._id]);
    } else {
      fullscreenTrailPaths[u._id] = L.polyline(trails[u._id], {
        weight: 4,
        opacity: 0.75,
      }).addTo(fullscreenMap);
    }
  }
}

function renderMapUsers(users) {
  const onlineUsers = users.filter(
    (u) => u.isOnline && u.latitude && u.longitude
  );

  onlineUsers.forEach((u) => {
    const isCurrentUser = String(u._id) === String(user._id || user.id);

    let selectedIcon = greenIcon;

    if (u.signalStrength < 30) {
      selectedIcon = redIcon;
    } else if (u.signalStrength < 70) {
      selectedIcon = yellowIcon;
    }

    if (isCurrentUser) {
      selectedIcon = blueIcon;
    }

    const newLatLng = [Number(u.latitude), Number(u.longitude)];
    const accuracy = getLocationAccuracy(u);
    const accuracyText = accuracy ? `${Math.round(accuracy)} m` : "Unknown";

    updateUserTrail(u._id, newLatLng);
    upsertAccuracyCircle(accuracyCircles, map, u._id, newLatLng, accuracy);

    if (markers[u._id]) {
      markers[u._id].setIcon(selectedIcon);
      moveMarkerSmoothly(markers[u._id], newLatLng);
    } else {
      markers[u._id] = L.marker(newLatLng, {
        icon: selectedIcon,
      }).addTo(map);
    }

    markers[u._id].bindPopup(`
      <div style="min-width:200px">
        <h3 style="margin:0">${u.name}</h3>
        <hr>
        <b>Role:</b> ${u.role}<br>
        <b>Status:</b> ${u.isOnline ? "Online" : "Offline"}<br>
        <b>Signal:</b> ${u.signalStrength || 0}%<br>
        <b>Latency:</b> ${u.latency || 0} ms<br>
        <b>Network:</b> ${u.networkType || "unknown"}<br>
        <b>Accuracy:</b> ${accuracyText}<br>
        <b>Coordinates:</b><br>
        ${Number(u.latitude).toFixed(6)},
        ${Number(u.longitude).toFixed(6)}
      </div>
    `);

    if (isCurrentUser) {
  map.panTo(newLatLng);

  if (fullscreenMap && mapModal.classList.contains("show")) {
    fullscreenMap.panTo(newLatLng);
  }
}

updateFullscreenMapUser(u, selectedIcon, newLatLng);
  });

  Object.keys(markers).forEach((id) => {
    const stillOnline = onlineUsers.some((u) => String(u._id) === String(id));

    if (!stillOnline) {
  map.removeLayer(markers[id]);
  delete markers[id];

  if (trailPaths[id]) {
    map.removeLayer(trailPaths[id]);
    delete trailPaths[id];
  }

  if (accuracyCircles[id]) {
    map.removeLayer(accuracyCircles[id]);
    delete accuracyCircles[id];
  }

  if (fullscreenMarkers[id]) {
    fullscreenMap?.removeLayer(fullscreenMarkers[id]);
    delete fullscreenMarkers[id];
  }

  if (fullscreenAccuracyCircles[id]) {
    fullscreenMap?.removeLayer(fullscreenAccuracyCircles[id]);
    delete fullscreenAccuracyCircles[id];
  }

  if (fullscreenTrailPaths[id]) {
    fullscreenMap?.removeLayer(fullscreenTrailPaths[id]);
    delete fullscreenTrailPaths[id];
  }

  delete trails[id];
}
  });
}

createUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
const email = document.getElementById("email").value.trim();
const password = document.getElementById("password").value.trim();
const role = document.getElementById("role").value;
const rank = document.getElementById("rank").value;

// NEW: Unit Assignment fields
const unit = document.getElementById("unit").value;
const team = document.getElementById("team").value.trim();
const assignedCommander = document.getElementById("assignedCommander").value;
  

  try {
    createUserMessage.innerText = "Creating user...";

    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
  name,
  email,
  password,
  role,
  rank,
  unit,
  team,
  assignedCommander: assignedCommander || null,
}),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to create user");
    }

    createUserMessage.innerText = "User created successfully";
    createUserForm.reset();
    loadUsers();
  } catch (error) {
    createUserMessage.innerText = error.message;
  }
});



const socket = io();

function emitUserOnline(telemetryData) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    socket.emit("user-online", telemetryData, finish);
    setTimeout(finish, 5000);
  });
}

async function getLatency() {
  const start = performance.now();

  try {
    await fetch("/", { cache: "no-store" });
    return Math.round(performance.now() - start);
  } catch {
    return 999;
  }
}

async function sendTelemetry() {
  if (!user || !(user._id || user.id)) return;

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

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        

        const telemetryData = {
  userId: user._id || user.id,
  signalStrength,
  latency,
  networkType,
  latitude: Number(position.coords.latitude),
  longitude: Number(position.coords.longitude),
  accuracy: Number(position.coords.accuracy),
};

console.log("Sending telemetry:", telemetryData);

emitUserOnline(telemetryData).then(resolve);
      },
      (error) => {

        emitUserOnline({
  userId: user._id || user.id,
  signalStrength,
  latency,
  networkType,
}).then(resolve);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  });
}

function renderEditCommanderOptions(selectedCommanderId = "") {
  const commanders = currentUsers.filter((u) => u.role === "commander");

  editAssignedCommanderSelect.innerHTML =
    '<option value="">No commander</option>';

  commanders.forEach((commander) => {
    const option = document.createElement("option");
    option.value = getUserId(commander);
    option.textContent = `${commander.rank || "PVT"} ${commander.name}`;
    editAssignedCommanderSelect.appendChild(option);
  });

  editAssignedCommanderSelect.value = selectedCommanderId || "";
}

function openEditUserModal(userId) {
  const selectedUser = currentUsers.find(
    (u) => String(getUserId(u)) === String(userId)    
  );

  if (!selectedUser) {
    alert("User not found.");
    return;
  }

  const isSelf =
    String(getUserId(selectedUser)) ===
    String(user._id || user.id);

  document.getElementById("editRole").disabled = isSelf;
  document.getElementById("editStatus").disabled = isSelf;

  document.getElementById("editUserId").value = getUserId(selectedUser);
  document.getElementById("editName").value = selectedUser.name || "";
  document.getElementById("editEmail").value = selectedUser.email || "";
  document.getElementById("editRank").value = selectedUser.rank || "PVT";
  document.getElementById("editRole").value = selectedUser.role || "patrol_member";
  document.getElementById("editUnit").value = selectedUser.unit || "Alpha";
  document.getElementById("editTeam").value = selectedUser.team || "Team 1";
  document.getElementById("editStatus").value = selectedUser.status || "active";

  const commanderId =
    typeof selectedUser.assignedCommander === "object"
      ? getUserId(selectedUser.assignedCommander)
      : selectedUser.assignedCommander || "";

  renderEditCommanderOptions(commanderId);

  editUserMessage.innerText = "";
  editUserModal.classList.add("show");
}

function closeEditUserModal() {
  editUserModal.classList.remove("show");
}

editUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userId = document.getElementById("editUserId").value;

  const payload = {
    name: document.getElementById("editName").value.trim(),
    email: document.getElementById("editEmail").value.trim(),
    rank: document.getElementById("editRank").value,
    role: document.getElementById("editRole").value,
    unit: document.getElementById("editUnit").value,
    team: document.getElementById("editTeam").value.trim(),
    assignedCommander:
      document.getElementById("editAssignedCommander").value || null,
    status: document.getElementById("editStatus").value,
  };

  try {
    editUserMessage.innerText = "Saving changes...";

    const response = await fetch(
      `/api/users/${userId}/profile`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to update profile.");
    }

    editUserMessage.innerText = "User profile updated successfully.";

    await loadUsers();
window.dispatchEvent(
  new Event("user-updated")
);

    setTimeout(() => {
      closeEditUserModal();
      editUserMessage.innerText = "";
    }, 700);
  } catch (error) {
    editUserMessage.innerText = error.message;
  }
});

async function startLiveMonitoring() {
  initMap();

  loadUsers(); // load table immediately

  await sendTelemetry();
  await loadUsers();

  setInterval(async () => {
    await sendTelemetry();
    await loadUsers();
  }, 15000);
}

const expandBtn =
  document.getElementById("expandMapBtn");

const mapModal =
  document.getElementById("mapModal");

const closeModal =
  document.getElementById("closeMapModal");

expandBtn.addEventListener("click", () => {
  mapModal.classList.add("show");

  setTimeout(() => {
    if (!fullscreenMap) {
      fullscreenMap = L.map("fullscreenMap").setView(
        map.getCenter(),
        map.getZoom()
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(fullscreenMap);
    }

    fullscreenMap.invalidateSize();
    loadUsers();
  }, 300);
});

closeModal.addEventListener("click", () => {
  mapModal.classList.remove("show");
});

async function updateUserStatus(userId, status) {
  try {
    const response = await fetch(
      `/api/users/${userId}/status`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to update status");
    }

    createUserMessage.innerText = "User status updated successfully";

    setTimeout(() => {
      createUserMessage.innerText = "";
    }, 2500);

    loadUsers();
  } catch (error) {
    createUserMessage.innerText = error.message;
    loadUsers();
  }
}

async function updateRoleRank(userId, role, rank) {
  try {
    const response = await fetch(
      `/api/users/${userId}/role-rank`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role,
          rank,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message);
    }

    console.log("User updated:", data);

    createUserMessage.innerText =
      "User role/rank updated successfully";

    setTimeout(() => {
      createUserMessage.innerText = "";
    }, 2500);

    loadUsers();
  } catch (error) {
    console.error(error);

    createUserMessage.innerText =
      error.message || "Failed to update user";
  }
}
userSearch.addEventListener("beforeinput", (event) => {
  if (event.data && /[^a-zA-Z0-9\s]/.test(event.data)) {
    event.preventDefault();
  }
});

userSearch.addEventListener("input", applyUserFilters);

roleFilter.addEventListener(
  "change",
  applyUserFilters
);

rankFilter.addEventListener(
  "change",
  applyUserFilters
);

unitFilter.addEventListener(
  "change",
  applyUserFilters
);

statusFilter.addEventListener(
  "change",
  applyUserFilters
);

clearFiltersBtn.addEventListener(
  "click",
  () => {
    userSearch.value = "";
    roleFilter.value = "";
    rankFilter.value = "";
    unitFilter.value = "";
    statusFilter.value = "";

    applyUserFilters();
  }
);

async function toggleUserStatus(
  userId,
  currentStatus
) {
  const newStatus =
    currentStatus === "active"
      ? "inactive"
      : "active";

  const confirmed = confirm(
    `Are you sure you want to ${
      newStatus === "inactive"
        ? "deactivate"
        : "activate"
    } this account?`
  );

  if (!confirmed) return;

  try {
    const response = await fetch(
      `/api/users/${userId}/status`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message);
    }

    createUserMessage.innerText =
      `User ${newStatus} successfully`;

    loadUsers();

    setTimeout(() => {
      createUserMessage.innerText = "";
    }, 2500);

  } catch (error) {
    createUserMessage.innerText =
      error.message;
  }
}
startLiveMonitoring();
