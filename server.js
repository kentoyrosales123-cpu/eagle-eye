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

    const latitude =
      data.latitude !== undefined && data.latitude !== null && data.latitude !== ""
        ? Number(data.latitude)
        : null;

    const longitude =
      data.longitude !== undefined && data.longitude !== null && data.longitude !== ""
        ? Number(data.longitude)
        : null;

    const signalStrength = Number(data.signalStrength) || 0;
    const latency = Number(data.latency) || 0;
    const networkType = data.networkType || "unknown";

    console.log("Telemetry received:", {
      userId: data.userId,
      latitude,
      longitude,
      latency,
    });

    socket.userId = data.userId;

    onlineUsers.set(data.userId, {
      userId: data.userId,
      signalStrength,
      latency,
      networkType,
      latitude,
      longitude,
      socketId: socket.id,
      lastSeen: new Date(),
    });

    const updateData = {
      isOnline: true,
      signalStrength,
      latency,
      networkType,
      lastSeen: new Date(),
    };

    if (latitude !== null && longitude !== null) {
      updateData.latitude = latitude;
      updateData.longitude = longitude;
    }

    await User.findByIdAndUpdate(data.userId, updateData);

    const user = await User.findById(data.userId).select(
      "name email role isOnline signalStrength latency networkType latitude longitude lastSeen"
    );

    const livePayload = {
      userId: data.userId,
      _id: data.userId,
      name: user?.name || "User",
      email: user?.email || "",
      role: user?.role || "user",
      isOnline: true,
      signalStrength,
      latency,
      networkType,
      latitude,
      longitude,
      updatedAt: new Date(),
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
socket.on("sos-alert", (data) => {
  console.log("SOS ALERT RECEIVED:", data);

  activeAlertCount++;

  io.emit("sos-alert", {
    ...data,
    timestamp: data.timestamp || new Date(),
  });

  sendDashboardStats();
});

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
        onlineUsers.delete(socket.userId);

        await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date(),
        });
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