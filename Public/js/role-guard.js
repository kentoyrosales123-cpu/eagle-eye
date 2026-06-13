function getStoredAuth() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"));

  if (!token || !user) {
    window.location.href = "access-system.html";
    return null;
  }

  return { token, user };
}

function getRoleHomePage(role) {
  const homePages = {
    admin: "admin-dashboard.html",
    commander: "commander-dashboard.html",
    communication_officer: "communication.html",
    monitoring_officer: "monitoring.html",
    patrol_leader: "user-dashboard.html",
    patrol_member: "user-dashboard.html",
  };

  return homePages[role] || "user-dashboard.html";
}

function requireRoles(allowedRoles) {
  const auth = getStoredAuth();
  if (!auth) return;

  const { user } = auth;

  if (!allowedRoles.includes(user.role)) {
    alert("Access denied. Your role cannot open this page.");
    window.location.href = getRoleHomePage(user.role);
  }
}

function applyRoleMenu() {
  const auth = getStoredAuth();
  if (!auth) return;

  const role = auth.user.role;

  const permissions = {
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

    patrol_leader: [
      "user-dashboard.html",
      "communication.html",
      "alerts.html",
    ],

    patrol_member: [
      "user-dashboard.html",
      "alerts.html",
    ],

    communication_officer: [
      "communication.html",
      "alerts.html",
    ],

    monitoring_officer: [
      "monitoring.html",
      "alerts.html",
    ],
  };

  const allowedLinks = permissions[role] || [];

  document.querySelectorAll("nav a").forEach((link) => {
    if (
      role === "commander" &&
      link.getAttribute("href") === "admin-dashboard.html"
    ) {
      link.setAttribute("href", "commander-dashboard.html");
    }

    const href = link.getAttribute("href");

    if (href && href !== "#" && !allowedLinks.includes(href)) {
      link.style.display = "none";
    }
  });
}
