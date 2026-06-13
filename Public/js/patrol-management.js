const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user"));

let unavailablePersonnelIds = new Set();

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

if (!token || !user || !["admin", "commander"].includes(user.role)) {
  window.location.href = "access-system.html";
}

document.getElementById("adminName").innerText = user?.name || "Admin";

const socket = io();

socket.on("patrol-started", async () => {
  await loadPatrols();
  await loadUsers();
});

socket.on("patrol-status-updated", async () => {
  await loadPatrols();
  await loadUsers();
});

if (user && (user._id || user.id)) {
  socket.emit("user-online", {
    userId: user._id || user.id,
    signalStrength: 100,
    latency: 0,
    networkType: "admin",
  });
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "access-system.html";
}

let allUsers = [];

async function loadUsers() {
  try {
    const res = await fetch("/api/users", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const users = await res.json();
    allUsers = users;

    const leaderSelect = document.getElementById("patrolLeader");
    const membersSelect = document.getElementById("patrolMembers");

    leaderSelect.innerHTML = '<option value="">Select patrol leader</option>';
    membersSelect.innerHTML = "";

    const memberRoles = ["patrol_member", "communication_officer", "monitoring_officer"];

    users
  .filter((u) => u.role === "patrol_leader")
  .forEach((u) => {
    const id = String(u._id || u.id);
    const option = document.createElement("option");

    option.value = id;
    option.textContent = unavailablePersonnelIds.has(id)
      ? `${formatPersonnel(u)} - Already Assigned`
      : formatPersonnel(u);

    option.disabled = unavailablePersonnelIds.has(id);

    leaderSelect.appendChild(option);
  });

    leaderSelect.onchange = () => {
  const selectedLeader = allUsers.find(
    (u) =>
      String(u._id || u.id) ===
      String(leaderSelect.value)
  );

  membersSelect.innerHTML = "";

  if (!selectedLeader) return;

  allUsers
    .filter(
  (u) =>
    memberRoles.includes(u.role) &&
    u.unit === selectedLeader.unit &&
    u.team === selectedLeader.team &&
    String(u._id || u.id) !==
      String(selectedLeader._id || selectedLeader.id)
)
    .forEach((u) => {
  const id = String(u._id || u.id);
  const option = document.createElement("option");

  option.value = id;
  option.textContent = unavailablePersonnelIds.has(id)
    ? `${formatPersonnel(u)} - Already Assigned`
    : formatPersonnel(u);

  option.disabled = unavailablePersonnelIds.has(id);

  membersSelect.appendChild(option);
});
};
  } catch (error) {
    console.error("Load users error:", error);
  }
}

function getUserId(userData) {
  return userData?._id || userData?.id || userData;
}

function formatPersonnel(userData) {
  return `${userData.rank || "PVT"} ${userData.name} - ${formatRole(userData.role)}`;
}

function formatRole(role) {
  return (role || "patrol_member")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPatrolMembers(patrol) {
  const leaderId = String(getUserId(patrol.patrolLeader) || "");

  return (patrol.assignedUsers || []).filter((u) => {
    return String(getUserId(u)) !== leaderId;
  });
}

function formatAssignedPersonnel(patrol) {
  const leader = patrol.patrolLeader
    ? formatPersonnel(patrol.patrolLeader)
    : "No patrol leader";

  const members = getPatrolMembers(patrol);
  const memberText = members.length
    ? members.map(formatPersonnel).join(", ")
    : "No patrol members";

  return `
    <p><b>Leader:</b> ${leader}</p>
    <p><b>Members:</b> ${memberText}</p>
  `;
}

async function loadPatrols() {
  try {
    const res = await fetch("/api/patrols", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const patrols = await res.json();

    unavailablePersonnelIds = new Set();

patrols
  .filter((p) =>
    ["scheduled", "ready", "active", "on_hold", "pending_acknowledgement"].includes(p.status)
  )
  .forEach((p) => {
    (p.assignedUsers || []).forEach((u) => {
      unavailablePersonnelIds.add(String(u._id || u.id || u));
    });

    if (p.patrolLeader) {
      unavailablePersonnelIds.add(String(p.patrolLeader._id || p.patrolLeader.id || p.patrolLeader));
    }
  });

    const activePatrols = patrols.filter(
  (p) =>
    ["scheduled", "ready", "active", "on_hold", "pending_acknowledgement"].includes(p.status)
);

const completedPatrols = patrols.filter(
  (p) =>
    p.status === "completed" ||
    p.status === "cancelled"
);

    document.getElementById("activePatrolCountTop").innerText =
  activePatrols.length;

document.getElementById("completedPatrolCountTop").innerText =
  completedPatrols.length;

    document.getElementById("activePatrolCount").innerText =
      activePatrols.length;

    document.getElementById(
  "completedPatrolCount"
).innerText =
  completedPatrols.length;

    const list = document.getElementById("patrolList");
    const completedList =
  document.getElementById(
    "completedPatrolList"
  );

  const activeSosAlerts =
  JSON.parse(localStorage.getItem("activeSosAlerts")) || [];

document.getElementById("sosAlertCount").innerText =
  activeSosAlerts.length;

    if (activePatrols.length === 0) {
  list.innerHTML = "<p>No ongoing patrols.</p>";
} else {
  list.innerHTML = activePatrols
    .map(
        (p) => `
          <div class="patrol-item">
            <div>
              <h3>${p.title}</h3>

              ${formatAssignedPersonnel(p)}

              <p><b>Area:</b> ${p.area}</p>
              <p><b>Status:</b> ${formatPatrolStatus(p.status)}</p>

              <p>
                <b>Start:</b>
                ${new Date(p.startTime).toLocaleString()}
              </p>

              <p>
                <b>End:</b>
                ${new Date(p.endTime).toLocaleString()}
              </p>
            </div>

            <div class="patrol-actions">
  <button onclick="viewTeamComposition('${p._id}')">
    View Team
  </button>

  <button onclick="viewPatrolLogs('${p._id}', '${p.title.replace(/'/g, "\\'")}')">
    View Logs
  </button>

              ${
                p.status === "scheduled"
                  ? `
                    <button onclick="startPatrol('${p._id}')">
                      Start
                    </button>
                  `
                  : ""
              }

              ${
  p.status === "pending_acknowledgement"
    ? `
      <button onclick="acknowledgePatrol('${p._id}')">
        Acknowledge Patrol
      </button>
    `
    : ""
}
            </div>
          </div>
        `
        
      )
      
      .join("");}
      completedList.innerHTML =
  completedPatrols.length
    ? completedPatrols
        .map(
          (p) => `
            <div class="patrol-item completed-patrol">
              <div>
                <h3>${p.title}</h3>

                ${formatAssignedPersonnel(p)}

                <p><b>Area:</b> ${p.area}</p>
                <p><b>Status:</b> ${formatPatrolStatus(p.status)}</p>

                <p>
                  <b>Start:</b>
                  ${new Date(p.startTime).toLocaleString()}
                </p>

                <p>
                  <b>End:</b>
                  ${new Date(p.endTime).toLocaleString()}
                </p>

                <p>
                  <b>Completed:</b>
                  ${
                    p.completedAt
                      ? new Date(p.completedAt).toLocaleString()
                      : "N/A"
                  }
                </p>
              </div>

              <div class="patrol-actions">
              <button
                onclick="viewTeamComposition('${p._id}')"
                >
                  View Team
                </button>
                <button onclick="viewPatrolLogs('${p._id}', '${p.title.replace(/'/g, "\\'")}')">
                  View Logs
                </button>
              </div>
            </div>
          `
        )
        .join("")
    : "<p>No completed patrols yet.</p>";
  } catch (error) {
    console.error("Load patrols error:", error);
  }
}

document.getElementById("patrolForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    title: document.getElementById("title").value,
    area: document.getElementById("area").value,
    objective: document.getElementById("objective").value,
    priority: document.getElementById("priority").value,
    missionType: document.getElementById("missionType").value,
    patrolLeader: document.getElementById("patrolLeader").value,
    assignedUsers: Array.from(
      document.getElementById("patrolMembers").selectedOptions
    ).map((option) => option.value),
    startTime: document.getElementById("startTime").value,
    endTime: document.getElementById("endTime").value,
  };

  if (!payload.assignedUsers.length) {
    alert("Please select at least one patrol member.");
    return;
  }

  try {
    const res = await fetch("/api/patrols", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to assign patrol");
      return;
    }

    alert("Patrol assigned successfully");

    document.getElementById("patrolForm").reset();

    loadPatrols();
  } catch (error) {
    alert("Server error while assigning patrol");
    console.error(error);
  }
});

async function startPatrol(id) {
  try {
    const res = await fetch(`/api/patrols/${id}/start`, {
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
    loadPatrols();
  } catch (error) {
    console.error(error);
    alert("Server error while starting patrol.");
  }
}

async function acknowledgePatrol(id) {
  const confirmAck = confirm(
    "Acknowledge and close this completed patrol?"
  );

  if (!confirmAck) return;

  try {
    const res = await fetch(`/api/patrols/${id}/acknowledge`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to acknowledge patrol.");
      return;
    }

    alert("Patrol acknowledged successfully.");
    loadPatrols();
  } catch (error) {
    console.error(error);
    alert("Server error while acknowledging patrol.");
  }
}

async function viewPatrolLogs(patrolId, patrolTitle) {
  try {
    const res = await fetch(`/api/patrols/${patrolId}/logs`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const logs = await res.json();

    if (!res.ok) {
      alert(logs.message || "Failed to load patrol logs.");
      return;
    }

    const cleanLogs = logs.filter(
  (log) => log.type !== "patrol_ended"
);

const logHtml = cleanLogs.length
  ? cleanLogs
      .map((log) => {
            const time = new Date(log.timestamp).toLocaleString();
            const name = log.user?.name || "Field Personnel";

            return `
              <div class="admin-log-item ${log.type}">
                <strong>${name}</strong>
                <p>${log.message}</p>
                <small>${time}</small>
              </div>
            `;
          })
          .join("")
      : "<p>No patrol logs yet.</p>";

    document.getElementById("adminLogTitle").innerText = patrolTitle;
    document.getElementById("adminPatrolLogs").innerHTML = logHtml;
    document.getElementById("adminLogsModal").style.display = "block";
  } catch (error) {
    console.error("View patrol logs error:", error);
  }
}

function closeAdminLogsModal() {
  document.getElementById("adminLogsModal").style.display = "none";
}

async function viewTeamComposition(
  patrolId
) {
  try {
    const res = await fetch(
      "/api/patrols",
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      }
    );

    const patrols =
      await res.json();

    const patrol =
      patrols.find(
        (p) => p._id === patrolId
      );

    if (!patrol) {
      alert("Patrol not found.");
      return;
    }

    document.getElementById(
      "teamMissionTitle"
    ).innerText =
      patrol.title;

    const leader =
      patrol.patrolLeader;

    const members =
      getPatrolMembers(patrol);

    const memberHtml =
      members.length
        ? members
            .map(
              (m) => `
              <div class="team-member-card">
                <strong>
                  ${m.rank || "PVT"}
                  ${m.name}
                </strong>

                <p>
                  ${formatRole(m.role)}
                </p>

                <p>
                  Status:
                  ${
                    m.isOnline
                      ? "🟢 Online"
                      : "🔴 Offline"
                  }
                </p>

                <p>
                  Signal:
                  ${
                    m.signalStrength || 0
                  }%
                </p>
              </div>
            `
            )
            .join("")
        : "<p>No members assigned.</p>";

    document.getElementById(
  "teamCompositionContent"
).innerHTML = `

<div class="mission-summary-card">

  <h3>Patrol Details</h3>

  <p>
    <strong>Mission:</strong>
    ${patrol.title}
  </p>

  <p>
    <strong>Area:</strong>
    ${patrol.area}
  </p>

  <p>
    <strong>Status:</strong>
    ${formatPatrolStatus(patrol.status)}
  </p>

  <p>
    <strong>Unit:</strong>
    ${leader.unit || "N/A"}
  </p>

  <p>
    <strong>Team:</strong>
    ${leader.team || "N/A"}
  </p>

  <p>
    <strong>Start Time:</strong>
    ${new Date(
      patrol.startTime
    ).toLocaleString()}
  </p>

  <p>
    <strong>End Time:</strong>
    ${new Date(
      patrol.endTime
    ).toLocaleString()}
  </p>

</div>

<hr>

<div class="team-leader-card">
  <h3>Patrol Leader</h3>

  <p>
    <strong>
      ${leader.rank || "PVT"}
      ${leader.name}
    </strong>
  </p>

  <p>
    ${formatRole(
      leader.role
    )}
  </p>

  <p>
    Status:
    ${
      leader.isOnline
        ? "🟢 Online"
        : "🔴 Offline"
    }
  </p>

  <p>
    Signal:
    ${
      leader.signalStrength || 0
    }%
  </p>
</div>

<hr>

<h3>Patrol Members</h3>

${memberHtml}
`;

    document.getElementById(
      "teamCompositionModal"
    ).style.display =
      "block";

  } catch (error) {
    console.error(error);
    alert(
      "Failed to load team composition."
    );
  }
}

function closeTeamModal() {
  document.getElementById(
    "teamCompositionModal"
  ).style.display = "none";
}

async function initPatrolManagement() {
  await loadPatrols();
  await loadUsers();
}

initPatrolManagement();

setInterval(async () => {
  await loadPatrols();
  await loadUsers();
}, 5000);
