const token = localStorage.getItem("token");
let user = JSON.parse(localStorage.getItem("user"));

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

if (!token || !user) {
  window.location.href = "access-system.html";
}

if (user.role === "admin") {
  window.location.href = "admin-dashboard.html";
}

if (user.role === "commander") {
  window.location.href = "commander-dashboard.html";
}

document.getElementById("userName").innerText = user?.name || "User";

const profileRole = document.querySelector(".user-profile span");

if (profileRole) {
  profileRole.innerText =
    user.role === "patrol_leader"
      ? "Patrol Leader"
      : "Patrol Member";
}

const socket = io();

socket.on("patrol-started", async (data) => {
  await loadDashboardPatrolStatus();

  alert(
    `MISSION ACTIVATED\n\n${data.title}\nArea: ${data.area}`
  );
});

socket.on("patrol-status-updated", async () => {
  await loadDashboardPatrolStatus();
});

async function syncCurrentUser() {
  try {
    const response = await fetch("/api/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return;

    const updatedUser = await response.json();

    localStorage.setItem(
      "user",
      JSON.stringify(updatedUser)
    );

    user = updatedUser;

    const redirects = {
      admin: "admin-dashboard.html",
      commander: "commander-dashboard.html",
      patrol_leader: "user-dashboard.html",
      patrol_member: "user-dashboard.html",
      communication_officer: "communication.html",
      monitoring_officer: "monitoring.html",
    };

    const currentPage =
      window.location.pathname.split("/").pop();

    const correctPage =
      redirects[updatedUser.role];

    if (
      correctPage &&
      currentPage !== correctPage
    ) {
      window.location.href = correctPage;
    }
  } catch (error) {
    console.error(
      "User sync failed:",
      error
    );
  }
}

async function getLatency() {
  const start = performance.now();

  try {
    await fetch("/favicon.ico", { cache: "no-store" });
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

  document.getElementById("signalStrength").innerText = signalStrength + "%";
  document.getElementById("networkType").innerText = networkType;
  document.getElementById("latency").innerText = latency + "ms";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      document.getElementById("locationStatus").innerText =
        "GPS Location Active";

      document.getElementById("latitude").innerText = latitude.toFixed(6);
      document.getElementById("longitude").innerText = longitude.toFixed(6);

      socket.emit("user-online", {
        userId: user._id || user.id,
        signalStrength,
        latency,
        networkType,
        latitude,
        longitude,
        accuracy,
      });
    },
    () => {
      document.getElementById("locationStatus").innerText =
        "Location Permission Denied";

      socket.emit("user-online", {
        userId: user._id || user.id,
        signalStrength,
        latency,
        networkType,
      });
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    }
  );
}

function sendEmergencyAlert() {
  socket.emit("emergency-alert", {
    userId: user._id || user.id,
    name: user.name,
    message: "Emergency alert sent by field user",
    createdAt: new Date(),
  });

  alert("Emergency alert sent to admin.");
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "access-system.html";
}

async function loadDashboardPatrolStatus() {
  try {
    const res = await fetch("/api/patrols/active", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const patrols = await res.json();
    if (!res.ok) return;

    const currentUserId = user._id || user.id;

    const myPatrol = patrols.find((p) => {
      const leaderId =
        typeof p.patrolLeader === "string"
          ? p.patrolLeader
          : p.patrolLeader?._id || p.patrolLeader?.id;

      if (leaderId === currentUserId) return true;

      return p.assignedUsers?.some((u) => {
        const assignedId =
          typeof u === "string" ? u : u._id || u.id;

        return assignedId === currentUserId;
      });
    });

    const patrolStatus = document.getElementById("patrolStatus");
    const patrolName = document.getElementById("patrolName");
    const patrolDetails = document.getElementById("patrolDetails");

    if (!myPatrol) {
      patrolStatus.innerText = "STANDBY";
      patrolName.innerText = "No Active Patrol";
      patrolDetails.innerText = "Wait for command patrol assignment.";
      return;
    }

    patrolStatus.innerText = formatPatrolStatus(myPatrol.status);
    patrolName.innerText = myPatrol.title;

    patrolDetails.innerText =
  `${myPatrol.area}
Objective: ${myPatrol.objective || "No objective"}
Priority: ${(myPatrol.priority || "medium").toUpperCase()}
Type: ${(myPatrol.missionType || "routine_patrol")
  .replaceAll("_", " ")
  .toUpperCase()}
Role: ${
    user.role === "patrol_leader"
      ? "Patrol Leader"
      : "Patrol Member"
  }`;
      const patrolActions = document.getElementById("patrolActions");

if (patrolActions) {
  if (user.role === "patrol_leader") {
    patrolActions.innerHTML = `
  <button onclick="updateMyPatrolStatus('${myPatrol._id}', 'ready')">Mark Ready</button>
  <button onclick="startMyPatrol('${myPatrol._id}')">Start Patrol</button>
  <button onclick="updateMyPatrolStatus('${myPatrol._id}', 'on_hold')">Put On Hold</button>
  <button onclick="submitPatrolReport('${myPatrol._id}')">Submit Report</button>
  <button onclick="completeMyPatrol('${myPatrol._id}')">Submit Completion</button>
  <button onclick="sendPatrolLog('${myPatrol._id}', 'checkpoint')">Send Checkpoint</button>
  <button onclick="sendPatrolLog('${myPatrol._id}', 'sos')">Send SOS</button>
`;
  } else {
    patrolActions.innerHTML = `
      <button onclick="sendPatrolLog('${myPatrol._id}', 'checkpoint')">Send Status Update</button>
      <button onclick="sendPatrolLog('${myPatrol._id}', 'sos')">Send SOS</button>
    `;
  }
}
  } catch (error) {
    console.error("Dashboard patrol status error:", error);
  }
}

async function startMyPatrol(patrolId) {
  try {
    const res = await fetch(`/api/patrols/${patrolId}/start`, {
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

    alert("Patrol started successfully.");
    loadDashboardPatrolStatus();
  } catch (error) {
    console.error(error);
    alert("Server error while starting patrol.");
  }
}

async function completeMyPatrol(patrolId) {
  try {
    const res = await fetch(`/api/patrols/${patrolId}/complete`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to complete patrol.");
      return;
    }

    alert("Patrol submitted for admin acknowledgement.");
    loadDashboardPatrolStatus();
  } catch (error) {
    console.error(error);
    alert("Server error while completing patrol.");
  }
}

async function sendPatrolLog(patrolId, type) {
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      const message =
        type === "sos"
          ? "Emergency alert from field personnel."
          : "Checkpoint verified by patrol member.";

      try {
        const res = await fetch(
          `/api/patrols/${patrolId}/logs`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              type,
              message,
              lat: latitude,
              lng: longitude,
            }),
          }
        );

        const data = await res.json();

        if (!res.ok) {
          alert(data.message || "Failed to send update.");
          return;
        }

        alert(
          type === "sos"
            ? "SOS alert sent."
            : "Checkpoint shared successfully."
        );
      } catch (error) {
        console.error(error);
        alert("Server error while sending update.");
      }
    },
    () => {
      alert("GPS permission required.");
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    }
  );
}

async function updateMyPatrolStatus(patrolId, status) {
  try {
    const res = await fetch(`/api/patrols/${patrolId}/status`, {
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

    alert("Patrol status updated successfully.");
    loadDashboardPatrolStatus();
  } catch (error) {
    console.error(error);
    alert("Server error while updating patrol status.");
  }
}

async function submitPatrolReport(patrolId) {
  const summary = prompt("Enter patrol report summary:");

  if (!summary) {
    alert("Report summary is required.");
    return;
  }

  const incidents = prompt("Enter incidents, if any:") || "";
  const remarks = prompt("Enter remarks:") || "";

  try {
    const res = await fetch(`/api/patrols/${patrolId}/report`, {
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

    alert("Patrol report submitted successfully.");
    loadDashboardPatrolStatus();
  } catch (error) {
    console.error(error);
    alert("Server error while submitting patrol report.");
  }
}

syncCurrentUser();
setInterval(syncCurrentUser, 5000);

sendTelemetry();
setInterval(sendTelemetry, 5000);

loadDashboardPatrolStatus();
setInterval(loadDashboardPatrolStatus, 5000);
