const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user"));
const socket = io();

let activePatrol = null;
let patrolMap = null;
let patrolMarker = null;
let latestPosition = null;
let watchId = null;
let gpsErrorShown = false;

const isPatrolLeader = user.role === "patrol_leader";
const isPatrolMember = user.role === "patrol_member";

const fieldRoles = ["patrol_leader", "patrol_member"];

function formatPatrolStatus(status) {
  const labels = {
    scheduled: "Pending",
    ready: "Ready",
    active: "Active",
    on_hold: "On Hold",
    pending_acknowledgement: "Pending Acknowledgement",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return labels[status] || status;
}

if (!token || !user || !fieldRoles.includes(user.role)) {
  window.location.href = "access-system.html";
}

document.getElementById("userName").innerText = user?.name || "User";

async function loadMyPatrol() {
  try {
    const res = await fetch("/api/patrols/active", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const patrols = await res.json();

    if (!res.ok) {
      console.error("Failed to load patrols:", patrols.message);
      return;
    }

    const currentUserId = user._id || user.id;

    const myPatrol = patrols.find((p) => {
      const leaderId =
        typeof p.patrolLeader === "string"
          ? p.patrolLeader
          : p.patrolLeader?._id || p.patrolLeader?.id;

      if (leaderId === currentUserId) return true;

      return p.assignedUsers?.some((u) => {
        const assignedId = typeof u === "string" ? u : u._id || u.id;
        return assignedId === currentUserId;
      });
    });

    const patrolBtn = document.getElementById("patrolBtn");

    if (!myPatrol) {
      activePatrol = null;

      document.getElementById("patrolMode").innerText = "STANDBY";
      document.getElementById("patrolArea").innerText = "NONE";
      document.getElementById("patrolTime").innerText = "--:--";
      document.getElementById("missionName").innerText = "No Ongoing Patrol";
      document.getElementById("missionDetails").innerText =
        "Waiting for admin assignment.";
      document.getElementById("missionStatusLabel").innerText = "STANDBY";

      patrolBtn.innerText = "No Ongoing Patrol";
      patrolBtn.disabled = true;
      return;
    }

    activePatrol = myPatrol;

    document.getElementById("patrolMode").innerText =
  formatPatrolStatus(myPatrol.status);

    document.getElementById("patrolArea").innerText = myPatrol.area;

    document.getElementById("patrolTime").innerText =
      new Date(myPatrol.startTime).toLocaleTimeString();

    document.getElementById("missionName").innerText = myPatrol.title;

    document.getElementById("missionDetails").innerText =
  `Area: ${myPatrol.area}
Objective: ${myPatrol.objective || "No objective"}
Priority: ${(myPatrol.priority || "medium").toUpperCase()}
Mission Type: ${(myPatrol.missionType || "routine_patrol")
  .replaceAll("_", " ")
  .toUpperCase()}`;

    document.getElementById("missionStatusLabel").innerText =
  formatPatrolStatus(myPatrol.status);

    patrolBtn.innerText = "Patrol Assignment Active";
    patrolBtn.disabled = false;
    const completeBtn = document.getElementById("completePatrolBtn");
    const startBtn = document.getElementById("startPatrolBtn");
const holdBtn = document.getElementById("holdPatrolBtn");
const resumeBtn = document.getElementById("resumePatrolBtn");
const reportBtn = document.getElementById("submitReportBtn");

[startBtn, holdBtn, resumeBtn, reportBtn, completeBtn].forEach((btn) => {
  if (btn) btn.style.display = isPatrolLeader ? "inline-block" : "none";
});

if (isPatrolLeader) {
  startBtn.disabled =
    !["scheduled", "ready"].includes(myPatrol.status);

  holdBtn.disabled =
    myPatrol.status !== "active";

  resumeBtn.disabled =
    myPatrol.status !== "on_hold";

  reportBtn.disabled =
    !["active", "on_hold"].includes(myPatrol.status);

  completeBtn.disabled =
    myPatrol.status !== "active";

  completeBtn.innerText =
    myPatrol.status ===
    "pending_acknowledgement"
      ? "WAITING FOR ADMIN"
      : "COMPLETE PATROL";
} else {
  completeBtn.disabled = true;
  completeBtn.innerText = "LEADER ONLY";
}

if (completeBtn) {

  if (myPatrol.status === "scheduled") {
    patrolBtn.innerText =
      "Assigned Patrol Available";

    completeBtn.disabled = true;
    completeBtn.innerText =
      "WAITING TO START";

    document.getElementById(
      "missionStatusLabel"
    ).innerText = "ASSIGNED";
  }

  else if (
    myPatrol.status ===
    "pending_acknowledgement"
  ) {
    completeBtn.disabled = true;
    completeBtn.innerText =
      "WAITING FOR ADMIN";

    patrolBtn.innerText =
      "Waiting for Admin Acknowledgement";
  }
  
}
  } catch (error) {
    console.error("Load patrol error:", error);
  }
}

document.getElementById("patrolBtn").addEventListener("click", () => {
  if (!activePatrol) return;

  document.getElementById("modalMissionName").innerText = activePatrol.title;
  document.getElementById("modalStatus").innerText =
  formatPatrolStatus(activePatrol.status);
  document.getElementById("modalArea").innerText = activePatrol.area;
  document.getElementById("modalStartTime").innerText =
    new Date(activePatrol.startTime).toLocaleTimeString();

  document.getElementById("patrolModal").style.display = "block";

  loadPatrolLogs();

  setTimeout(initPatrolMap, 300);
});

document.getElementById("closePatrolModal").addEventListener("click", () => {
  document.getElementById("patrolModal").style.display = "none";
});

async function getLatency() {
  const start = performance.now();

  try {
    await fetch("/favicon.ico", { cache: "no-store" });
    return Math.round(performance.now() - start);
  } catch {
    return 999;
  }
}

function getNetworkType() {
  const connection =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;

  return connection?.effectiveType || "wifi";
}

function getSignalStrength(latency) {
  if (latency > 300) return 50;
  if (latency > 200) return 70;
  if (latency > 100) return 85;

  return 100;
}

async function sendPresenceTelemetry(position = null) {
  if (!user || !(user._id || user.id)) return;

  const latency = await getLatency();
  const networkType = getNetworkType();
  const signalStrength = getSignalStrength(latency);

  const telemetryData = {
    userId: user._id || user.id,
    signalStrength,
    latency,
    networkType,
  };

  if (position) {
    telemetryData.latitude = position.coords.latitude;
    telemetryData.longitude = position.coords.longitude;
    telemetryData.accuracy = position.coords.accuracy;
  } else if (latestPosition) {
    telemetryData.latitude = latestPosition.lat;
    telemetryData.longitude = latestPosition.lng;
    telemetryData.accuracy = latestPosition.accuracy;
  }

  socket.emit("user-online", telemetryData);
}

function updateLocalPosition(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;

  latestPosition = {
    lat,
    lng,
    accuracy: position.coords.accuracy,
    timestamp: new Date(),
  };

  if (patrolMarker && patrolMap) {
    patrolMarker.setLatLng([lat, lng]);
    patrolMap.setView([lat, lng], 16);
  }
}

function startLocationTracking() {
  if (watchId !== null) return;

  if (!navigator.geolocation) {
    alert("GPS is not supported by this browser.");
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      gpsErrorShown = false;
      updateLocalPosition(position);
      sendPresenceTelemetry(position);
    },
    (error) => {
      console.error("GPS error:", error);

      if (!gpsErrorShown) {
        gpsErrorShown = true;
        alert(
          "GPS permission is required. On your phone, allow Location for this site and turn on device Location Services."
        );
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 20000,
    }
  );
}

function initPatrolMap() {
  if (patrolMap) {
    patrolMap.invalidateSize();

    if (latestPosition) {
      patrolMap.setView([latestPosition.lat, latestPosition.lng], 16);
    }

    return;
  }

  const initialPosition = latestPosition
    ? [latestPosition.lat, latestPosition.lng]
    : [7.0731, 125.6128];

  patrolMap = L.map("patrolMap").setView(initialPosition, 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(patrolMap);

  patrolMarker = L.marker(initialPosition)
    .addTo(patrolMap)
    .bindPopup("Your Current Position")
    .openPopup();

  startLocationTracking();
}

document.getElementById("checkInBtn").addEventListener("click", async () => {
  if (!activePatrol) return;

  if (!latestPosition) {
    alert("GPS is still loading. Please wait a few seconds.");
    return;
  }

  const btn = document.getElementById("checkInBtn");
  btn.disabled = true;
  btn.innerText = "SAVING...";

  await savePatrolLog(
    "checkpoint",
    "Checkpoint verified successfully.",
    latestPosition.lat,
    latestPosition.lng
  );

  await loadPatrolLogs();

  btn.disabled = false;
btn.innerText = "CHECKED IN ✓";

setTimeout(() => {
  btn.innerText = "CHECK IN";
}, 2000);
});

document.getElementById("sosBtn").addEventListener("click", async () => {
  if (!activePatrol) return;

  if (!latestPosition) {
    alert("GPS is still loading. Please wait a few seconds.");
    return;
  }

  const btn = document.getElementById("sosBtn");
  btn.disabled = true;
  btn.innerText = "SENDING...";

  await savePatrolLog(
    "sos",
    "SOS alert sent to command center.",
    latestPosition.lat,
    latestPosition.lng
  );

  await loadPatrolLogs();

  btn.disabled = false;
btn.innerText = "🚨 SOS ALERT";

/* Optional success state */
btn.innerText = "SOS SENT ✓";

setTimeout(() => {
  btn.innerText = "🚨 SOS ALERT";
}, 2500);
});

document
  .getElementById("completePatrolBtn")
  .addEventListener("click", async () => {
    if (!activePatrol) return;

    if (!isPatrolLeader) {
  alert("Only the patrol leader can complete this patrol.");
  return;
}

    if (activePatrol.status === "scheduled") {
  alert("Patrol must be started by admin before it can be completed.");
  return;
}

    if (activePatrol.status === "pending_acknowledgement") {
      alert("This patrol is already waiting for admin acknowledgement.");
      return;
    }

    const confirmComplete = confirm(
      "Submit this patrol as completed for admin acknowledgement?"
    );

    if (!confirmComplete) return;

    try {
      const res = await fetch(`/api/patrols/${activePatrol._id}/complete`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Failed to submit patrol completion.");
        return;
      }

      activePatrol = data.patrol;

      await savePatrolLog(
        "note",
        "Patrol completion submitted. Waiting for admin acknowledgement."
      );

      document.getElementById("modalStatus").innerText =
        "WAITING ADMIN ACKNOWLEDGEMENT";

      document.getElementById("missionStatusLabel").innerText =
        "WAITING ADMIN ACKNOWLEDGEMENT";

      const btn = document.getElementById("completePatrolBtn");
      btn.disabled = true;
      btn.innerText = "WAITING FOR ADMIN";

      await loadPatrolLogs();

      alert("Patrol submitted for admin acknowledgement.");
    } catch (error) {
      console.error("Complete patrol error:", error);
      alert("Server error while submitting patrol completion.");
    }
  });

async function savePatrolLog(type, message, lat = null, lng = null) {
  try {
    const res = await fetch(`/api/patrols/${activePatrol._id}/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type,
        message,
        lat,
        lng,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Save patrol log failed:", data.message);
      alert(data.message || "Failed to save patrol log.");
      return null;
    }

    return data;
  } catch (error) {
    console.error("Save patrol log error:", error);
    return null;
  }
}

async function loadPatrolLogs() {
  if (!activePatrol) return;

  try {
    const res = await fetch(`/api/patrols/${activePatrol._id}/logs`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const logs = await res.json();

    if (!res.ok) {
      console.error("Load patrol logs failed:", logs.message);
      return;
    }

    const patrolLogs = document.getElementById("patrolLogs");

    if (!logs.length) {
      patrolLogs.innerHTML = `
        <p>Mission log initialized. Waiting for patrol action...</p>
      `;
      return;
    }

    patrolLogs.innerHTML = logs
      .map((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();

        return `
          <p>${time} — ${log.message}</p>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Load patrol logs error:", error);
  }
}

function logout() {
  localStorage.clear();
  window.location.href = "access-system.html";
}

socket.on("sos-acknowledged", (data) => {
  if (!activePatrol) return;

  if (String(data.patrolId) !== String(activePatrol._id)) return;

  showUserSosAcknowledged(data);

  loadPatrolLogs();
});

socket.on("patrol-started", async (data) => {
  await loadMyPatrol();

  alert(
    `PATROL STARTED\n\n${data.title}\nArea: ${data.area}`
  );
});

socket.on("patrol-status-updated", async () => {
  await loadMyPatrol();
});

function showUserSosAcknowledged(data) {
  let modal = document.getElementById("userSosAckModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "userSosAckModal";
    modal.className = "user-sos-ack-modal";

    modal.innerHTML = `
      <div class="user-sos-ack-box">
        <h2>✅ SOS RECEIVED</h2>
        <p>Command center has received your SOS alert.</p>
        <h3>Backup is coming.</h3>

        <small id="userSosAckTime"></small>

        <button onclick="closeUserSosAckModal()">
          Acknowledge
        </button>
      </div>
    `;

    document.body.appendChild(modal);
  }

  document.getElementById("userSosAckTime").innerText =
    new Date(data.timestamp).toLocaleString();

  modal.style.display = "flex";
}

function closeUserSosAckModal() {
  const modal = document.getElementById("userSosAckModal");
  if (modal) modal.style.display = "none";
}
document.getElementById("startPatrolBtn").addEventListener("click", async () => {
  if (!activePatrol) return;

  try {
    const res = await fetch(`/api/patrols/${activePatrol._id}/start`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to start patrol.");
      return;
    }

    activePatrol = data.patrol;

    await savePatrolLog("note", "Patrol started by patrol leader.");

    alert("Patrol started successfully.");
    loadMyPatrol();
    loadPatrolLogs();
  } catch (error) {
    console.error("Start patrol error:", error);
    alert("Server error while starting patrol.");
  }
});



document.getElementById("holdPatrolBtn").addEventListener("click", async () => {
  if (!activePatrol) return;

  await updatePatrolStatusFromPatrolPage("on_hold", "Patrol placed on hold.");
});

document.getElementById("resumePatrolBtn").addEventListener("click", async () => {
  if (!activePatrol) return;

  await updatePatrolStatusFromPatrolPage("active", "Patrol resumed.");
});



async function updatePatrolStatusFromPatrolPage(status, logMessage) {
  try {
    const res = await fetch(`/api/patrols/${activePatrol._id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to update patrol status.");
      return;
    }

    activePatrol = data.patrol;

    await savePatrolLog("note", logMessage);

    alert("Patrol status updated.");
    loadMyPatrol();
    loadPatrolLogs();
  } catch (error) {
    console.error("Update patrol status error:", error);
    alert("Server error while updating patrol status.");
  }
}

document.getElementById("submitReportBtn").addEventListener("click", async () => {
  if (!activePatrol) return;

  const summary = prompt("Enter patrol report summary:");
  if (!summary) {
    alert("Report summary is required.");
    return;
  }

  const incidents = prompt("Enter incidents, if any:") || "";
  const remarks = prompt("Enter remarks:") || "";

  try {
    const res = await fetch(`/api/patrols/${activePatrol._id}/report`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        summary,
        incidents,
        remarks,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to submit patrol report.");
      return;
    }

    activePatrol = data.patrol;

    await savePatrolLog("note", "Patrol report submitted.");

    alert("Patrol report submitted successfully.");
    loadPatrolLogs();
  } catch (error) {
    console.error("Submit report error:", error);
    alert("Server error while submitting patrol report.");
  }
});

loadMyPatrol();
setInterval(loadMyPatrol, 5000);
sendPresenceTelemetry();
setInterval(sendPresenceTelemetry, 5000);
socket.on("connect", sendPresenceTelemetry);
startLocationTracking();
