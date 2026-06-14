(function () {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (!token || !user || !(user._id || user.id) || typeof io !== "function") {
    return;
  }

  const socket = io();
  let intervalId = null;

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

  async function sendPresence() {
    const latency = await getLatency();

    socket.emit("user-online", {
      userId: user._id || user.id,
      signalStrength: getSignalStrength(latency),
      latency,
      networkType: getNetworkType(),
    });
  }

  socket.on("connect", sendPresence);
  sendPresence();

  intervalId = setInterval(sendPresence, 5000);

  window.addEventListener("beforeunload", () => {
    if (intervalId) clearInterval(intervalId);
  });
})();
