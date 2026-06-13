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

const commandRoles = [
  "admin",
  "commander",
  "communication_officer",
];

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

const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const messageTarget = document.getElementById("messageTarget");
const messageBox = document.getElementById("messageBox");
const communicationLogs = document.getElementById("communicationLogs");
const logCount = document.getElementById("logCount");

let logs = JSON.parse(localStorage.getItem("communicationLogs")) || [];

function saveLogs() {
  localStorage.setItem("communicationLogs", JSON.stringify(logs));
}

function renderLogs() {
  logCount.innerText = logs.length;

  if (!logs.length) {
    communicationLogs.innerHTML = "<p>No messages yet.</p>";
    return;
  }

  communicationLogs.innerHTML = logs
    .map(
      (log) => `
        <div class="communication-log-item">
          <strong>${log.sender}</strong>
          <span>${log.target}</span>
          <p>${log.message}</p>
          <small>${new Date(log.time).toLocaleString()}</small>
        </div>
      `
    )
    .join("");
}

function addMessageToBox(log, type = "outgoing") {
  const div = document.createElement("div");
  div.className = `message-bubble ${type}`;

  div.innerHTML = `
    <strong>${log.sender}</strong>
    <p>${log.message}</p>
    <small>${new Date(log.time).toLocaleTimeString()}</small>
  `;

  messageBox.appendChild(div);
  messageBox.scrollTop = messageBox.scrollHeight;
}

function sendCommandMessage(message, target = "all") {
  const log = {
    sender: user.name || "Command",
    senderRole: user.role,
    target,
    message,
    time: new Date(),
  };

  log.localId = Date.now() + "-" + Math.random();

socket.emit("command-message", log);

logs.unshift(log);
saveLogs();
renderLogs();
addMessageToBox(log, "outgoing");
}

messageForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const message = messageInput.value.trim();
  const target = messageTarget.value;

  if (!message) return;

  sendCommandMessage(message, target);

  messageInput.value = "";
});

function sendQuickMessage(message) {
  sendCommandMessage(message, "all");
}

socket.on("command-message", (log) => {
  const alreadyExists = logs.some(
    (item) => item.localId && item.localId === log.localId
  );

  if (alreadyExists) return;

  logs.unshift(log);
  saveLogs();
  renderLogs();
  addMessageToBox(log, "incoming");
});

document.addEventListener("DOMContentLoaded", () => {
  renderLogs();
});
