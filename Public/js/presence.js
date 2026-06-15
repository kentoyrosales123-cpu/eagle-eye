(function () {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (!token || !user || !(user._id || user.id) || typeof io !== "function") {
    return;
  }

  const socket = io();
  window.presenceSocket = socket;
  let intervalId = null;
  let watchId = null;
  let latestPosition = null;

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

  function startLocationTracking() {
    if (watchId !== null || !navigator.geolocation) return;

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        latestPosition = {
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
          accuracy: Number(position.coords.accuracy),
        };

        sendPresence();
      },
      (error) => {
        console.warn("Presence GPS unavailable:", error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 30000,
      }
    );
  }

  async function sendPresence() {
    const latency = await getLatency();

    const telemetryData = {
      userId: user._id || user.id,
      signalStrength: getSignalStrength(latency),
      latency,
      networkType: getNetworkType(),
    };

    if (latestPosition) {
      telemetryData.latitude = latestPosition.latitude;
      telemetryData.longitude = latestPosition.longitude;
      telemetryData.accuracy = latestPosition.accuracy;
    }

    socket.emit("user-online", telemetryData);
  }

  startLocationTracking();
  socket.on("connect", sendPresence);
  sendPresence();

  intervalId = setInterval(sendPresence, 5000);

  window.addEventListener("beforeunload", () => {
    if (intervalId) clearInterval(intervalId);
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
  });
})();
