document.addEventListener(
  "DOMContentLoaded",
  () => {
    const loginForm =
      document.getElementById(
        "loginForm"
      );

    const loginMessage =
      document.getElementById(
        "loginMessage"
      );

    loginForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();

        const email =
          document
            .getElementById("email")
            .value;

        const password =
          document
            .getElementById("password")
            .value;

        try {
          loginMessage.innerText =
            "Authenticating...";

          const data =
            await loginUser(
              email,
              password
            );

          localStorage.setItem(
            "token",
            data.token
          );

          localStorage.setItem(
            "user",
            JSON.stringify(data.user)
          );

          loginMessage.innerText =
            "Authentication successful";

          const redirects = {
  admin: "admin-dashboard.html",
  commander: "commander-dashboard.html",
  patrol_leader: "user-dashboard.html",
  patrol_member: "user-dashboard.html",
  communication_officer: "communication.html",
  monitoring_officer: "monitoring.html",
};

window.location.href = redirects[data.user.role] || "user-dashboard.html";
        } catch (err) {
          loginMessage.innerText =
            err.message;
        }
      }
    );
  }
);