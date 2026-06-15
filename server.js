require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const User = require("./models/User");
const Patrol = require("./models/Patrol");

const connectDB = require("./config/db");
const createDefaultAdmin = require("./utils/createAdmin");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const patrolRoutes = require("./routes/patrolRoutes");


const app = express();
const server = http.createServer(app);

const io = new Server(server);
app.set("io", io);

const onlineUsers = new Map();
let activeAlertCount = 0;

app.use(cors());
app.use(express.json());

connectDB().then(() => {
  createDefaultAdmin();
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/patrols", patrolRoutes);

app.use(express.static(path.join(__dirname, "Public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Public", "index.html"));
});

async function sendDashboardStats() {
  const users = Array.from(onlineUsers.values());

  const totalSignal = users.reduce((sum, user) => {
    return sum + (user.signalStrength || 0);
  }, 0);

  const avgSignal =
    users.length > 0 ? Math.round(totalSignal / users.length) : 0;

  const activePatrols = await Patrol.countDocuments({
  status: {
    $in: [
  "scheduled",
  "ready",
  "active",
  "on_hold",
  "pending_acknowledgement",
],
  },
});

  io.emit("dashboardStats", {
  onlineUnits: users.length,
  activePatrols,
  activeAlerts: activeAlertCount,
  signalHealth: avgSignal,
});
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("user-online", async (data, callback) => {
  try {
    if (!data || !data.userId) {
      if (callback) callback({ success: false, message: "Missing userId" });
      return;
    }

    const latitudeValue =
      data.latitude !== undefined && data.latitude !== null && data.latitude !== ""
        ? Number(data.latitude)
        : null;

    const longitudeValue =
      data.longitude !== undefined && data.longitude !== null && data.longitude !== ""
        ? Number(data.longitude)
        : null;

    const accuracyValue =
      data.accuracy !== undefined && data.accuracy !== null && data.accuracy !== ""
        ? Number(data.accuracy)
        : null;

    const latitude =
      Number.isFinite(latitudeValue) ? latitudeValue : null;

    const longitude =
      Number.isFinite(longitudeValue) ? longitudeValue : null;

    const accuracy =
      Number.isFinite(accuracyValue) && accuracyValue > 0 ? accuracyValue : null;

    const signalStrength = Number(data.signalStrength) || 0;
    const latency = Number(data.latency) || 0;
    const networkType = data.networkType || "unknown";

    const userId = String(data.userId);

    console.log("Telemetry received:", {
      userId,
      latitude,
      longitude,
      accuracy,
      latency,
    });

    socket.userId = userId;

    const now = new Date();
    const currentOnlineUser = onlineUsers.get(userId);
    const socketIds = currentOnlineUser?.socketIds || new Set();
    socketIds.add(socket.id);

    const hasLocation = latitude !== null && longitude !== null;
    const previousLatitude = currentOnlineUser?.latitude ?? null;
    const previousLongitude = currentOnlineUser?.longitude ?? null;
    const hasPreviousLocation =
      previousLatitude !== null && previousLongitude !== null;
    const locationChanged =
      hasLocation &&
      (!hasPreviousLocation ||
        Number(previousLatitude).toFixed(6) !== Number(latitude).toFixed(6) ||
        Number(previousLongitude).toFixed(6) !== Number(longitude).toFixed(6));
    const noMovement =
      hasLocation && hasPreviousLocation && !locationChanged;
    const nextLastMovedAt =
      locationChanged
        ? now
        : currentOnlineUser?.lastMovedAt ?? (hasLocation ? now : null);

    const nextLatitude =
      latitude !== null ? latitude : currentOnlineUser?.latitude ?? null;
    const nextLongitude =
      longitude !== null ? longitude : currentOnlineUser?.longitude ?? null;
    const nextAccuracy =
      accuracy !== null ? accuracy : currentOnlineUser?.accuracy ?? null;

    onlineUsers.set(userId, {
      userId,
      signalStrength,
      latency,
      networkType,
      latitude: nextLatitude,
      longitude: nextLongitude,
      accuracy: nextAccuracy,
      socketId: socket.id,
      socketIds,
      lastSeen: now,
      lastMovedAt: nextLastMovedAt,
    });

    const updateData = {
      isOnline: true,
      signalStrength,
      latency,
      networkType,
      lastSeen: now,
      tacticalStatus: "active",
    };

    if (latitude !== null && longitude !== null) {
      updateData.latitude = latitude;
      updateData.longitude = longitude;
      updateData.accuracy = accuracy;
    }

if (noMovement) {
  const idleMinutes =
    nextLastMovedAt
      ? (Date.now() - new Date(nextLastMovedAt).getTime()) /
        1000 /
        60
      : 0;

  if (idleMinutes >= 2) {
    updateData.tacticalStatus = "idle";
  }
}

    await User.findByIdAndUpdate(userId, updateData);

    if (locationChanged) {
  const activePatrol = await Patrol.findOne({
    status: { $in: ["active", "on_hold"] },
    $or: [
      { patrolLeader: userId },
      { assignedUsers: userId },
    ],
  });

  if (activePatrol) {
    const routePoint = {
      lat: latitude,
      lng: longitude,
      timestamp: new Date(),
    };

    const updatedPatrol = await Patrol.findByIdAndUpdate(
      activePatrol._id,
      {
        $push: {
          routeHistory: routePoint,
        },
      },
      {
        new: true,
      }
    );

    io.emit("patrol-route-updated", {
      patrolId: activePatrol._id,
      routeHistory: updatedPatrol?.routeHistory || [],
    });
  }
}

    const user = await User.findById(userId).select(
  "name email role isOnline signalStrength latency networkType latitude longitude accuracy lastSeen tacticalStatus"
);

    const payloadLatitude =
      latitude !== null ? latitude : user?.latitude ?? nextLatitude;
    const payloadLongitude =
      longitude !== null ? longitude : user?.longitude ?? nextLongitude;
    const payloadAccuracy =
      accuracy !== null ? accuracy : user?.accuracy ?? nextAccuracy;

    const livePayload = {
      userId,
      _id: userId,
      name: user?.name || "User",
      email: user?.email || "",
      role: user?.role || "user",
      isOnline: true,
      signalStrength,
      latency,
      networkType,
      latitude: payloadLatitude,
      longitude: payloadLongitude,
      accuracy: payloadAccuracy,
      updatedAt: new Date(),
      tacticalStatus: updateData.tacticalStatus,
    };

    /*
      Broadcast to all admin/user maps.
      Use multiple event names so your existing pages can receive it.
    */
    io.emit("patrol-location-update", livePayload);
    io.emit("user-location-update", livePayload);
    io.emit("user-online-update", livePayload);

    sendDashboardStats();

    if (callback) callback({ success: true });

    console.log("Online Users:", onlineUsers.size);
  } catch (error) {
    console.error("User online error:", error.message);

    if (callback) {
      callback({
        success: false,
        message: error.message,
      });
    }
  }
});
socket.on("sos-alert", async (data) => {
  console.log("SOS ALERT RECEIVED:", data);

  activeAlertCount++;

  if (data.userId) {
  await User.findByIdAndUpdate(
    data.userId,
    {
      tacticalStatus:
        "emergency",
    }
  );
}

  io.emit("sos-alert", {
    ...data,
    timestamp: data.timestamp || new Date(),
  });

  sendDashboardStats();
});

socket.on(
  "sos-acknowledged",
  async (data) => {

    if (data.userId) {
      await User.findByIdAndUpdate(
        data.userId,
        {
          tacticalStatus:
            "active",
        }
      );
    }

    io.emit(
      "sos-acknowledged",
      data
    );
  }
);

socket.on("incident-alert", (data) => {
  console.log("INCIDENT ALERT RECEIVED:", data);

  activeAlertCount++;

  io.emit("sos-alert", {
    ...data,
    type: "incident",
    timestamp: data.timestamp || new Date(),
  });

  sendDashboardStats();
});

socket.on("alert-count-sync", (data) => {
  activeAlertCount = Number(data.count) || 0;

  sendDashboardStats();
});

socket.on("command-message", (data) => {
  console.log("COMMAND MESSAGE:", data);

  io.emit("command-message", {
    ...data,
    time: data.time || new Date(),
  });
});

  socket.on("disconnect", async () => {
    try {
      if (socket.userId) {
        const onlineUser = onlineUsers.get(socket.userId);

        if (onlineUser?.socketIds) {
          onlineUser.socketIds.delete(socket.id);
        }

        if (onlineUser?.socketIds?.size > 0) {
          onlineUsers.set(socket.userId, onlineUser);
          sendDashboardStats();

          console.log("Disconnected:", socket.id);
          console.log("Online Users:", onlineUsers.size);
          return;
        }

        onlineUsers.delete(socket.userId);

        const disconnectedUser = await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          signalStrength: null,
          latency: null,
          networkType: "unknown",
          latitude: null,
          longitude: null,
          accuracy: null,
          lastSeen: null,
          tacticalStatus: "offline",
        }).select("name email role");

        const offlinePayload = {
          userId: socket.userId,
          _id: socket.userId,
          name: disconnectedUser?.name || "User",
          email: disconnectedUser?.email || "",
          role: disconnectedUser?.role || "user",
          isOnline: false,
          signalStrength: null,
          latency: null,
          networkType: "unknown",
          latitude: null,
          longitude: null,
          accuracy: null,
          lastSeen: null,
          updatedAt: new Date(),
          tacticalStatus: "offline",
        };

        io.emit("patrol-location-update", offlinePayload);
        io.emit("user-location-update", offlinePayload);
        io.emit("user-online-update", offlinePayload);
      }

      sendDashboardStats();

      console.log("Disconnected:", socket.id);
      console.log("Online Users:", onlineUsers.size);
    } catch (error) {
      console.error("Disconnect error:", error.message);
    }
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
