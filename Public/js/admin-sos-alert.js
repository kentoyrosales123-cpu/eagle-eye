let activeSosAlerts = JSON.parse(localStorage.getItem("activeSosAlerts")) || [];
let selectedPriorityAlert = activeSosAlerts[0] || null;
const sosSocket = window.socket || io();

document.addEventListener("DOMContentLoaded", () => {
  renderPriorityIncident();
});

sosSocket.on("sos-alert", (data) => {
  console.log("ADMIN RECEIVED SOS:", data);

  const alertId =
    data.patrolId ||
    data.userId ||
    data.user?._id ||
    data.user?.id ||
    Date.now();

  const exists = activeSosAlerts.some(
    (alert) => String(alert.alertId) === String(alertId)
  );

  if (!exists) {
    activeSosAlerts.unshift({
      ...data,
      alertId,
      timestamp: data.timestamp || new Date(),
    });
  }

  selectedPriorityAlert = activeSosAlerts[0];

  saveActiveAlerts();
  renderPriorityIncident();

  const panel = document.getElementById("priorityIncidentPanel");

  if (panel) {
    panel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
});

function saveActiveAlerts() {
  localStorage.setItem("activeSosAlerts", JSON.stringify(activeSosAlerts));

  if (sosSocket) {
    sosSocket.emit("alert-count-sync", {
      count: activeSosAlerts.length,
    });
  }
}

function renderPriorityIncident() {
  const panel = document.getElementById("priorityIncidentPanel");
  const activeAlertsCounter = document.getElementById("activeAlerts");
  const status = document.getElementById("priorityIncidentStatus");
  const title = document.getElementById("priorityIncidentTitle");
  const message = document.getElementById("priorityIncidentMessage");
  const info = document.getElementById("priorityIncidentInfo");

  const personnel = document.getElementById("priorityPersonnel");
  const patrol = document.getElementById("priorityPatrol");
  const area = document.getElementById("priorityArea");

  const respondBtn = document.getElementById("priorityRespondBtn");
  const mapBtn = document.getElementById("priorityMapBtn");
  const viewAllBtn = document.getElementById("viewAllAlertsBtn");
  const clearBtn = document.getElementById("clearIncidentBtn");

  if (activeAlertsCounter) {
  activeAlertsCounter.innerText =
    activeSosAlerts.length || 0;
}

  if (!status || !title || !message) return;

  if (!activeSosAlerts.length) {
    selectedPriorityAlert = null;

    if (panel) panel.classList.remove("alert-active");

    status.innerText = "CLEAR";
    title.innerText = "No Active Incident";
    message.innerText = "No emergency alert received.";

    if (info) info.style.display = "none";

    if (respondBtn) respondBtn.disabled = true;
    if (mapBtn) mapBtn.disabled = true;
    if (viewAllBtn) viewAllBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = true;

    return;
  }

  selectedPriorityAlert = selectedPriorityAlert || activeSosAlerts[0];

  if (panel) panel.classList.add("alert-active");

  status.innerText = "URGENT";
  title.innerText = `${
  selectedPriorityAlert.user?.name ||
  selectedPriorityAlert.name ||
  selectedPriorityAlert.userName ||
  "Personnel"
} SOS Alert`;
  message.innerText =
    selectedPriorityAlert.message || "Emergency alert received.";

  if (info) info.style.display = "grid";

  if (personnel) {
    personnel.innerText =
      selectedPriorityAlert.user?.name || "Unknown Personnel";
  }

  if (patrol) {
    patrol.innerText =
      selectedPriorityAlert.patrolTitle || "Unknown Patrol";
  }

  if (area) {
    area.innerText =
      selectedPriorityAlert.area || "Unknown Area";
  }

  if (respondBtn) respondBtn.disabled = false;
  if (mapBtn) mapBtn.disabled = false;
  if (viewAllBtn) {
    viewAllBtn.disabled = false;
    viewAllBtn.innerText = `View All (${activeSosAlerts.length})`;
  }
  if (clearBtn) clearBtn.disabled = false;
}

async function acknowledgePriorityAlert() {
  if (!selectedPriorityAlert) return;

  if (!selectedPriorityAlert.patrolId) {
    clearPriorityIncident();
    return;
  }

  await acknowledgeAlert(selectedPriorityAlert.patrolId);
}

function openPriorityAlertMap() {
  if (!selectedPriorityAlert?.lat || !selectedPriorityAlert?.lng) return;

  window.open(
    `https://www.google.com/maps?q=${selectedPriorityAlert.lat},${selectedPriorityAlert.lng}`,
    "_blank"
  );
}

function clearPriorityIncident() {
  if (!selectedPriorityAlert) return;

  activeSosAlerts = activeSosAlerts.filter(
    (a) =>
      String(a.alertId || a.patrolId) !==
      String(selectedPriorityAlert.alertId || selectedPriorityAlert.patrolId)
  );

  selectedPriorityAlert = activeSosAlerts[0] || null;

  saveActiveAlerts();
  renderPriorityIncident();
  renderAllAlertsModal();
}

async function acknowledgeAlert(patrolId) {
  const alertData = activeSosAlerts.find(
    (a) => String(a.patrolId) === String(patrolId)
  );

  if (!alertData) return;

  try {
    const token = localStorage.getItem("token");

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

    if (!res.ok) return;

    activeSosAlerts = activeSosAlerts.filter(
      (a) => String(a.patrolId) !== String(patrolId)
    );

    selectedPriorityAlert = activeSosAlerts[0] || null;

    saveActiveAlerts();
    renderPriorityIncident();
    const alertCounter =
  document.getElementById("activeAlerts");

if (alertCounter) {
  alertCounter.innerText =
    activeSosAlerts.length;
}
    renderAllAlertsModal();
  } catch (error) {
    console.error("Acknowledge alert error:", error);
  }
}

function openAllAlertsModal() {
  let modal = document.getElementById("allAlertsModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "allAlertsModal";
    modal.className = "global-sos-modal";

    modal.innerHTML = `
      <div class="global-sos-box all-alerts-box">
        <div class="global-sos-header">
          <div class="sos-icon">🚨</div>
          <div>
            <h2>Active SOS Alerts</h2>
            <span>Multiple field incidents monitoring</span>
          </div>
        </div>

        <div id="allAlertsList" class="all-alerts-list"></div>

        <div class="global-sos-actions">
          <button class="ack-btn" onclick="closeAllAlertsModal()">
            Close
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  renderAllAlertsModal();
  modal.style.display = "flex";
}

function renderAllAlertsModal() {
  const list = document.getElementById("allAlertsList");
  if (!list) return;

  if (!activeSosAlerts.length) {
    list.innerHTML = `<p>No active SOS alerts.</p>`;
    return;
  }

  list.innerHTML = activeSosAlerts
    .map((alert) => {
      const time = new Date(alert.timestamp).toLocaleString();

      return `
        <div class="all-alert-item">
          <h3>${alert.user?.name || "Unknown Personnel"}</h3>
          <p><b>Patrol:</b> ${alert.patrolTitle || "Unknown Patrol"}</p>
          <p><b>Area:</b> ${alert.area || "Unknown Area"}</p>
          <p><b>Message:</b> ${alert.message || "SOS alert activated."}</p>
          <p><b>Time:</b> ${time}</p>

          <div class="action-row">
            <button onclick="acknowledgeAlert('${alert.patrolId}')">
              Acknowledge
            </button>

            <button onclick="window.open('https://www.google.com/maps?q=${alert.lat},${alert.lng}', '_blank')">
              Open Map
            </button>

            <button onclick="removeAlertOnly('${alert.patrolId}')">
              Clear
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function removeAlertOnly(patrolId) {
  activeSosAlerts = activeSosAlerts.filter(
    (a) => String(a.patrolId) !== String(patrolId)
  );

  selectedPriorityAlert = activeSosAlerts[0] || null;

  saveActiveAlerts();
  renderPriorityIncident();
  renderAllAlertsModal();
}

function closeAllAlertsModal() {
  const modal = document.getElementById("allAlertsModal");
  if (modal) modal.style.display = "none";
}