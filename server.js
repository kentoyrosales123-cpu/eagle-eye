require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const User = require("./models/User");
const Patrol = require("./models/Patrol");

const connectDB = require("./config/db");
const createDefaultAdmin = require("./utils/createAdmin");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const patrolRoutes = require("./routes/patrolRoutes");
const Alert = require("./models/Alert");
const alertRoutes = require("./routes/alertRoutes");


const app = express();
const server = http.createServer(app);

const io = new Server(server);
app.set("io", io);

const onlineUsers = new Map();
let activeAlertCount = 0;

function isValidObjectId(value) {
  return Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));
}

app.use(cors());
app.use(express.json());

connectDB().then(() => {
  createDefaultAdmin();
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/patrols", patrolRoutes);
app.use("/api/alerts", alertRoutes);

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

async function markUserOffline(userId) {
  if (!isValidObjectId(userId)) return null;

  onlineUsers.delete(String(userId));

  const disconnectedUser = await User.findByIdAndUpdate(userId, {
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
    userId: String(userId),
    _id: String(userId),
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

  await sendDashboardStats();

  return offlinePayload;
}

async function cleanupStaleOnlineUsers() {
  try {
    const staleCutoff = new Date(Date.now() - 45000);

    const staleUsers = await User.find({
      isOnline: true,
      $or: [
        { lastSeen: null },
        { lastSeen: { $lt: staleCutoff } },
      ],
    }).select("_id");

    await Promise.all(
      staleUsers.map((user) => markUserOffline(user._id))
    );
  } catch (error) {
    console.error("Stale online cleanup error:", error.message);
  }
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
socket.on("sos-alert", async (data = {}) => {
  try {
    console.log("SOS ALERT RECEIVED:", data);

    let savedAlert = null;
    let activePatrol = null;

if (isValidObjectId(data?.userId)) {
  activePatrol = await Patrol.findOne({
    status: { $in: ["active", "on_hold"] },
    $or: [
      { patrolLeader: data.userId },
      { assignedUsers: data.userId },
    ],
  });
}

    if (isValidObjectId(data?.userId)) {
      savedAlert = await Alert.create({
        user: data.userId,
        patrol: isValidObjectId(data?.patrolId)
  ? data.patrolId
  : activePatrol?._id || null,
        type: data.type || "sos",
        message: data.message || "Emergency alert sent",
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        accuracy: data.accuracy || null,
        status: "active",
        patrolTeam: data.team || activePatrol?.team || "",
patrolUnit: data.unit || activePatrol?.unit || "",
patrolTitle:
  data.patrolTitle ||
  activePatrol?.title ||
  activePatrol?.name ||
  "",
      });

      await User.findByIdAndUpdate(data.userId, {
        tacticalStatus: "emergency",
      });
    }

    activeAlertCount = await Alert.countDocuments({
      status: "active",
    });

    io.emit("sos-alert", {
  ...data,
  alertId: savedAlert?._id,
  patrolId: data.patrolId || activePatrol?._id,
  patrolTitle:
    data.patrolTitle ||
    activePatrol?.title ||
    activePatrol?.name ||
    "Unknown Patrol",
  team: data.team || activePatrol?.team || "Unassigned",
  unit: data.unit || activePatrol?.unit || "N/A",
  timestamp: savedAlert?.createdAt || new Date(),
});

    sendDashboardStats();
  } catch (error) {
    console.error("SOS alert save error:", error.message);
  }
});

socket.on(
  "sos-acknowledged",
  async (data) => {
    try {

    if (isValidObjectId(data?.userId)) {
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
    } catch (error) {
      console.error("SOS acknowledge error:", error.message);
    }
  }
);

socket.on("incident-alert", async (data = {}) => {
  try {
    console.log("INCIDENT ALERT RECEIVED:", data);

    let savedAlert = null;
    let activePatrol = null;

if (isValidObjectId(data?.userId)) {
  activePatrol = await Patrol.findOne({
    status: { $in: ["active", "on_hold"] },
    $or: [
      { patrolLeader: data.userId },
      { assignedUsers: data.userId },
    ],
  });
}

    if (isValidObjectId(data?.userId)) {
      savedAlert = await Alert.create({
        user: data.userId,
        patrol: isValidObjectId(data?.patrolId)
  ? data.patrolId
  : activePatrol?._id || null,
        type: data.type || "incident",
        message: data.message || "Incident alert sent",
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        accuracy: data.accuracy || null,
        status: "active",
        patrolTeam: data.team || activePatrol?.team || "",
patrolUnit: data.unit || activePatrol?.unit || "",
patrolTitle:
  data.patrolTitle ||
  activePatrol?.title ||
  activePatrol?.name ||
  "",
      });
    }

    activeAlertCount = await Alert.countDocuments({
      status: "active",
    });

    io.emit("sos-alert", {
  ...data,
  alertId: savedAlert?._id,
  type: data.type || "incident",
  patrolId: data.patrolId || activePatrol?._id,
  patrolTitle:
    data.patrolTitle ||
    activePatrol?.title ||
    activePatrol?.name ||
    "Unknown Patrol",
  team: data.team || activePatrol?.team || "Unassigned",
  unit: data.unit || activePatrol?.unit || "N/A",
  timestamp: savedAlert?.createdAt || new Date(),
});

    sendDashboardStats();
  } catch (error) {
    console.error("Incident alert save error:", error.message);
  }
});

socket.on("dispatch-backup", (data) => {
  const timestamp = data.timestamp || new Date();

  io.emit("backup-request", {
    ...data,
    type: "backup_request",
    alertId: data.alertId || Date.now(),
    timestamp,
  });

  io.emit("backup-dispatched", {
    ...data,
    timestamp,
  });
});

socket.on("resolve-sos", async (data) => {
  const resolveFields = {
    status: "resolved",
    resolvedAt: new Date(),
    resolvedBy: isValidObjectId(data?.resolvedBy) ? data.resolvedBy : null,
  };

  if (isValidObjectId(data?.alertId)) {
    await Alert.findByIdAndUpdate(data.alertId, resolveFields);
  }

  if (isValidObjectId(data?.patrolId)) {
    await Alert.updateMany(
      {
        patrol: data.patrolId,
        status: "active",
      },
      resolveFields
    );
  }

  activeAlertCount = await Alert.countDocuments({
  status: "active",
});

  if (isValidObjectId(data.patrolId)) {
    const patrol =
      await Patrol.findById(
        data.patrolId
      );

    const members = [
      patrol?.patrolLeader,
      ...(patrol?.assignedUsers || [])
    ].filter(Boolean);

    await User.updateMany(
      {
        _id: { $in: members }
      },
      {
        tacticalStatus:
          "active"
      }
    );
  }

  io.emit("sos-resolved", {
    ...data,
    timestamp:
      data.timestamp ||
      new Date(),
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

socket.on("user-offline", async (data, callback) => {
  try {
    const userId = String(data?.userId || socket.userId || "");

    if (!userId) {
      if (callback) callback({ success: false, message: "Missing userId" });
      return;
    }

    socket.userId = userId;
    await markUserOffline(userId);

    if (callback) callback({ success: true });
  } catch (error) {
    console.error("User offline error:", error.message);

    if (callback) {
      callback({
        success: false,
        message: error.message,
      });
    }
  }
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

        await markUserOffline(socket.userId);
      }

      sendDashboardStats();

      console.log("Disconnected:", socket.id);
      console.log("Online Users:", onlineUsers.size);
    } catch (error) {
      console.error("Disconnect error:", error.message);
    }
  });
});

setInterval(cleanupStaleOnlineUsers, 30000);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
