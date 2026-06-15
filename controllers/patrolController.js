const Patrol = require("../models/Patrol");
const User = require("../models/User");
const ActivityLog = require("../models/ActivityLog");

// CREATE PATROL
exports.createPatrol = async (req, res) => {
  try {
    const {
      title,
      area,
      objective,
      priority,
      missionType,
      assignedUsers,
      patrolLeader,
      startTime,
      endTime,
    } = req.body;

    if (
      !title ||
!area ||
!objective ||
!priority ||
!missionType ||
!patrolLeader ||
      !Array.isArray(assignedUsers) ||
      assignedUsers.length === 0 ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        message: "Please provide title, area, patrol leader, patrol members, start time, and end time.",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        message: "Invalid start or end time.",
      });
    }

    if (end <= start) {
      return res.status(400).json({
        message: "End time must be later than start time.",
      });
    }

    const selectedPersonnelIds = [
      patrolLeader,
      ...assignedUsers,
    ].map(String);

    const uniquePersonnelIds = [
      ...new Set(selectedPersonnelIds),
    ];

    if (selectedPersonnelIds.length !== uniquePersonnelIds.length) {
      return res.status(400).json({
        message: "Duplicate personnel selected in the same patrol assignment.",
      });
    }

    const leader = await User.findById(patrolLeader);

if (!leader || leader.role !== "patrol_leader") {
  return res.status(400).json({
    message: "Selected patrol leader is invalid.",
  });
}

const members = await User.find({
  _id: { $in: assignedUsers },
});

const blockingStatuses = [
  "scheduled",
  "ready",
  "active",
  "on_hold",
  "pending_acknowledgement",
];

const activePatrol = await Patrol.findOne({
  status: { $in: blockingStatuses },
  assignedUsers: { $in: uniquePersonnelIds },
});

if (activePatrol) {
  return res.status(400).json({
    message:
      "One or more selected personnel are already assigned to another ongoing patrol.",
  });
}

const invalidPersonnel = members.some(
  (member) =>
    member.unit !== leader.unit ||
    member.team !== leader.team
);

if (invalidPersonnel) {
  return res.status(400).json({
    message:
      "All patrol members must belong to the same unit and team as the patrol leader.",
  });
}

    const patrolPersonnel = assignedUsers;
    const assignedPersonnel = uniquePersonnelIds;

    if (req.user.role === "commander") {
  const unauthorizedMember =
    members.some(
      (member) =>
        String(member.assignedCommander) !==
        String(req.user._id)
    );

  if (unauthorizedMember) {
    return res.status(403).json({
      message:
        "You can only assign personnel under your command.",
    });
  }

  if (
    String(leader.assignedCommander) !==
    String(req.user._id)
  ) {
    return res.status(403).json({
      message:
        "Selected patrol leader is not under your command.",
    });
  }
}

    const patrol = await Patrol.create({
  title,
  area,
  objective,
  priority,
  missionType,
  assignedUsers: assignedPersonnel,
  startTime,
  endTime,
  patrolLeader,

  unit: leader.unit,
  team: leader.team,

  createdBy: req.user ? req.user._id : null,
});

    await ActivityLog.create({
      patrol: patrol._id,
      user: req.user ? req.user._id : null,
      type: "patrol_created",
      message: `Patrol "${title}" was created for ${area}.`,
    });

    res.status(201).json({
      message: "Patrol created successfully.",
      patrol,
    });
  } catch (error) {
    console.error("Create patrol error:", error);
    res.status(500).json({ message: "Server error while creating patrol." });
  }
};

// GET ALL PATROLS
exports.getPatrols = async (req, res) => {
  try {
    const patrols = await Patrol.find()
      .populate("assignedUsers", "name email role rank isOnline latitude longitude accuracy signalStrength latency")
      .populate("patrolLeader", "name email role rank isOnline latitude longitude accuracy signalStrength latency")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.json(patrols);
  } catch (error) {
    console.error("Get patrols error:", error);
    res.status(500).json({ message: "Server error while getting patrols." });
  }
};

// GET ACTIVE PATROLS
// GET ACTIVE + PENDING ACKNOWLEDGEMENT PATROLS
exports.getActivePatrols = async (req, res) => {
  try {
    const patrols = await Patrol.find({
      status: {
  $in: [
    "scheduled",
    "ready",
    "active",
    "on_hold",
    "pending_acknowledgement",
  ],
},
    })
      .populate("assignedUsers", "name email role rank isOnline latitude longitude accuracy signalStrength latency")
      .populate("patrolLeader", "name email role rank isOnline latitude longitude accuracy signalStrength latency")
      .sort({ createdAt: -1 });

    const patrolsWithRouteHistory = patrols.map((patrol) => {
      const patrolData = patrol.toObject();

      return {
        ...patrolData,
        routeHistory: Array.isArray(patrolData.routeHistory)
          ? patrolData.routeHistory
          : [],
      };
    });

    res.json(patrolsWithRouteHistory);

  } catch (error) {
    console.error(
      "Get patrols error:",
      error
    );

    res.status(500).json({
      message:
        "Server error while getting patrols.",
    });
  }
};

// GET ACTIVE SOS ALERTS
exports.getActiveSosAlerts = async (req, res) => {
  try {
    const patrols = await Patrol.find({
      "logs.type": "sos",
    })
      .populate("logs.user", "name email role")
      .sort({ updatedAt: -1 });

    const alerts = [];

    patrols.forEach((patrol) => {
      const logs = [...(patrol.logs || [])].sort((a, b) => {
        return new Date(a.timestamp) - new Date(b.timestamp);
      });

      let latestOpenSos = null;

      logs.forEach((log) => {
        if (log.type === "sos") {
          latestOpenSos = log;
        }

        if (log.type === "sos_acknowledged") {
          latestOpenSos = null;
        }
      });

      if (!latestOpenSos) return;

      alerts.push({
        alertId: latestOpenSos._id,
        patrolId: patrol._id,
        patrolTitle: patrol.title,
        area: patrol.area,
        message: latestOpenSos.message,
        lat: latestOpenSos.lat,
        lng: latestOpenSos.lng,
        timestamp: latestOpenSos.timestamp,
        status: "active",
        user: latestOpenSos.user || null,
      });
    });

    alerts.sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    res.json(alerts);
  } catch (error) {
    console.error("Get active SOS alerts error:", error);
    res.status(500).json({
      message: "Server error while getting active SOS alerts.",
    });
  }
};

// START PATROL
exports.startPatrol = async (req, res) => {
  try {
    const patrol = await Patrol.findById(req.params.id);

    if (!patrol) {
      return res.status(404).json({ message: "Patrol not found." });
    }

    const currentUserId = req.user._id.toString();
    const isCommandRole = ["admin", "commander"].includes(req.user.role);

    const isAssignedLeader =
      patrol.patrolLeader &&
      patrol.patrolLeader.toString() === currentUserId;

    if (!isCommandRole && !isAssignedLeader) {
      return res.status(403).json({
        message: "Only admin, commander, or the assigned patrol leader can start this patrol.",
      });
    }

    if (!["scheduled", "ready"].includes(patrol.status)) {
      return res.status(400).json({
        message: "Only scheduled or ready patrols can be started.",
      });
    }

    patrol.status = "active";
    patrol.startedAt = new Date();
    await patrol.save();

    const io = req.app.get("io");

io.emit("patrol-started", {
  patrolId: patrol._id,
  title: patrol.title,
  area: patrol.area,
  startedAt: patrol.startedAt,
});

    await ActivityLog.create({
      patrol: patrol._id,
      user: req.user ? req.user._id : null,
      type: "patrol_started",
      message: `Patrol "${patrol.title}" has started.`,
    });

    res.json({
      message: "Patrol started successfully.",
      patrol,
    });
  } catch (error) {
    console.error("Start patrol error:", error);
    res.status(500).json({ message: "Server error while starting patrol." });
  }
};

// COMPLETE PATROL
// USER REQUEST COMPLETE PATROL
exports.completePatrol = async (req, res) => {
  try {
    const patrol = await Patrol.findById(req.params.id);

    if (!patrol) {
      return res.status(404).json({
        message: "Patrol not found.",
      });
    }

    const currentUserId = req.user._id.toString();

    if (req.user.role !== "patrol_leader") {
  return res.status(403).json({
    message: "Only the patrol leader can submit patrol completion.",
  });
}

const isAssigned = patrol.assignedUsers.some((u) => {
  return u.toString() === currentUserId;
});

const isAssignedLeader =
  patrol.patrolLeader
    ? patrol.patrolLeader.toString() === currentUserId
    : true;

if (!isAssigned || !isAssignedLeader) {
  return res.status(403).json({
    message: "Only the assigned patrol leader can submit this patrol.",
  });
}

    // only active patrol can request completion
    if (patrol.status !== "active") {
      return res.status(400).json({
        message:
          "Patrol must be started by admin before it can be completed."
      });
    }

    patrol.status =
      "pending_acknowledgement";

    patrol.completedRequestAt =
      new Date();

    await patrol.save();

    const io = req.app.get("io");

io.emit("patrol-status-updated", {
  patrolId: patrol._id,
  status: patrol.status,
});

    await ActivityLog.create({
      patrol: patrol._id,
      user: req.user?._id || null,
      type: "patrol_completion_requested",
      message: `Patrol "${patrol.title}" is waiting for admin acknowledgement.`,
    });

    res.json({
      message:
        "Patrol submitted for acknowledgement.",
      patrol,
    });

  } catch (error) {
    console.error(
      "Complete patrol error:",
      error
    );

    res.status(500).json({
      message:
        "Server error while completing patrol.",
    });
  }
};

// ADMIN ACKNOWLEDGE PATROL
exports.acknowledgePatrol =
  async (req, res) => {
    try {
      const patrol =
        await Patrol.findById(
          req.params.id
        );

      if (!patrol) {
        return res.status(404).json({
          message:
            "Patrol not found.",
        });
      }

      if (
        patrol.status !==
        "pending_acknowledgement"
      ) {
        return res.status(400)
          .json({
            message:
              "Patrol is not waiting for acknowledgement.",
          });
      }

      patrol.status =
        "completed";

      patrol.completedAt =
        new Date();

      patrol.acknowledgedAt =
        new Date();

      await patrol.save();

      const io = req.app.get("io");

      io.emit("patrol-status-updated", {
        patrolId: patrol._id,
        status: patrol.status,
      });

      await ActivityLog.create({
        patrol: patrol._id,
        user:
          req.user?._id ||
          null,
        type:
          "patrol_acknowledged",
        message:
          `Admin acknowledged patrol "${patrol.title}".`,
      });

      res.json({
        message:
          "Patrol acknowledged successfully.",
        patrol,
      });

    } catch (error) {
      console.error(
        "Acknowledge patrol error:",
        error
      );

      res.status(500).json({
        message:
          "Server error while acknowledging patrol.",
      });
    }
  };

// GENERAL STATUS UPDATE
exports.updatePatrolStatus = async (req, res) => {
  try {
    const { status, cancelReason } = req.body;

    const allowedStatus = [
      "scheduled",
      "ready",
      "active",
      "on_hold",
      "pending_acknowledgement",
      "completed",
      "cancelled",
    ];

    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        message: "Invalid patrol status.",
      });
    }

    const patrol = await Patrol.findById(req.params.id);

    if (!patrol) {
      return res.status(404).json({
        message: "Patrol not found.",
      });
    }

    const currentUserId = req.user._id.toString();
    const isCommandRole = ["admin", "commander"].includes(req.user.role);

    const isAssignedLeader =
      patrol.patrolLeader &&
      patrol.patrolLeader.toString() === currentUserId;

    if (!isCommandRole && !isAssignedLeader) {
      return res.status(403).json({
        message: "Only admin, commander, or assigned patrol leader can update patrol status.",
      });
    }

    if (req.user.role === "patrol_leader") {
      const leaderAllowedStatus = [
        "ready",
        "active",
        "on_hold",
        "pending_acknowledgement",
      ];

      if (!leaderAllowedStatus.includes(status)) {
        return res.status(403).json({
          message: "Patrol leader cannot set this status.",
        });
      }
    }

    const validTransitions = {
      scheduled: ["ready", "active", "cancelled"],
      ready: ["active", "cancelled"],
      active: ["on_hold", "pending_acknowledgement"],
      on_hold: ["active", "pending_acknowledgement"],
      pending_acknowledgement: ["completed"],
      completed: [],
      cancelled: [],
    };

    if (
      !validTransitions[patrol.status]?.includes(status)
    ) {
      return res.status(400).json({
        message: `Invalid transition from ${patrol.status} to ${status}.`,
      });
    }

    patrol.status = status;

    if (status === "cancelled") {
      patrol.cancelReason = cancelReason || "Cancelled by command";
    }

    if (status === "active" && !patrol.startedAt) {
      patrol.startedAt = new Date();
    }

    if (status === "pending_acknowledgement" && !patrol.completedRequestAt) {
      patrol.completedRequestAt = new Date();
    }

    await patrol.save();

    const io = req.app.get("io");

    io.emit("patrol-status-updated", {
      patrolId: patrol._id,
      status: patrol.status,
    });

    await ActivityLog.create({
      patrol: patrol._id,
      user: req.user ? req.user._id : null,
      type: "note",
      message: `Patrol status updated to ${status}.`,
    });

    res.json({
      message: "Patrol status updated successfully.",
      patrol,
    });
  } catch (error) {
    console.error("Update patrol status error:", error);
    res.status(500).json({
      message: "Server error while updating patrol status.",
    });
  }
};

// ADD PATROL LOG
exports.addPatrolLog = async (req, res) => {
  try {
    const { type, message, lat, lng } = req.body;

    const allowedTypes = [
  "checkpoint",
  "sos",
  "sos_acknowledged",
  "backup_dispatched",
  "sos_resolved",
  "patrol_ended",
  "note",
];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        message: "Invalid patrol log type.",
      });
    }

    const patrol = await Patrol.findById(req.params.id);

    if (!patrol) {
      return res.status(404).json({
        message: "Patrol not found.",
      });
    }

    const currentUserId = req.user._id.toString();

const isCommandRole = ["admin", "commander"].includes(req.user.role);

const isAssigned = patrol.assignedUsers.some((u) => {
  return u.toString() === currentUserId;
});

const isAssignedLeader =
  patrol.patrolLeader &&
  patrol.patrolLeader.toString() === currentUserId;

const leaderAllowedTypes = [
  "checkpoint",
  "sos",
  "note",
  "backup_dispatched",
  "sos_resolved",
  "patrol_ended",
];

const memberAllowedTypes = [
  "checkpoint",
  "sos",
  "backup_dispatched",
  "sos_resolved",
  "note",
];

if (!isCommandRole && isAssignedLeader && !leaderAllowedTypes.includes(type)) {
  return res.status(403).json({
    message: "This log type is not allowed for patrol leader.",
  });
}

if (!isCommandRole && isAssigned && !isAssignedLeader && !memberAllowedTypes.includes(type)) {
  return res.status(403).json({
    message: "Patrol members are not allowed to perform this action.",
  });
}

if (!isCommandRole && !isAssigned && !isAssignedLeader) {
  return res.status(403).json({
    message: "You are not allowed to add logs to this patrol.",
  });
}

    const logEntry = {
      user: req.user._id,
      type,
      message,
      lat,
      lng,
      timestamp: new Date(),
    };

    const updatedPatrol = await Patrol.findByIdAndUpdate(
      patrol._id,
      {
        $push: {
          logs: logEntry,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    // REAL-TIME SOS ALERT
if (type === "sos") {
  const io = req.app.get("io");

  const populatedUser = await User.findById(
    req.user._id
  ).select("name email role");

  io.emit("sos-alert", {
    patrolId: patrol._id,
    patrolTitle: patrol.title,
    area: patrol.area,

    user: {
      id: populatedUser?._id,
      name: populatedUser?.name || "Unknown Personnel",
      email: populatedUser?.email || "",
      role: populatedUser?.role || "user",
    },

    message,
    lat,
    lng,
    timestamp: new Date(),
  });

  console.log(
    "🚨 SOS ALERT EMITTED:",
    populatedUser?.name
  );
}
if (type === "sos_acknowledged") {
  const io = req.app.get("io");

  const adminUser = await User.findById(req.user._id).select("name email role");

  io.emit("sos-acknowledged", {
    patrolId: patrol._id,
    patrolTitle: patrol.title,
    area: patrol.area,
    message,
    acknowledgedBy: {
      id: adminUser?._id,
      name: adminUser?.name || "Admin Command",
      email: adminUser?.email || "",
      role: adminUser?.role || "admin",
    },
    timestamp: new Date(),
  });

  console.log("✅ SOS ACKNOWLEDGED:", patrol.title);
}

    res.status(201).json({
      message: "Patrol log saved successfully.",
      logs: updatedPatrol.logs,
    });
    
  } catch (error) {
    console.error("Add patrol log error:", error);
    res.status(500).json({
      message: "Server error while saving patrol log.",
    });
  }
};

exports.submitPatrolReport = async (req, res) => {
  try {
    const { summary, incidents, remarks } = req.body;

    if (!summary) {
      return res.status(400).json({
        message: "Patrol report summary is required.",
      });
    }

    const patrol = await Patrol.findById(req.params.id);

    if (!patrol) {
      return res.status(404).json({
        message: "Patrol not found.",
      });
    }

    const currentUserId = req.user._id.toString();

    const isAssigned = patrol.assignedUsers.some((u) => {
  return u.toString() === currentUserId;
});

    const isAssignedLeader =
      patrol.patrolLeader &&
      patrol.patrolLeader.toString() === currentUserId;

    if (req.user.role !== "patrol_leader" || !isAssignedLeader || !isAssigned) {
      return res.status(403).json({
        message: "Only the assigned patrol leader can submit patrol report.",
      });
    }

    patrol.report = {
      summary,
      incidents: incidents || "",
      remarks: remarks || "",
      submittedBy: req.user._id,
      submittedAt: new Date(),
    };

    await patrol.save();

    await ActivityLog.create({
      patrol: patrol._id,
      user: req.user._id,
      type: "note",
      message: `Patrol report submitted for "${patrol.title}".`,
    });

    res.json({
      message: "Patrol report submitted successfully.",
      patrol,
    });
  } catch (error) {
    console.error("Submit patrol report error:", error);
    res.status(500).json({
      message: "Server error while submitting patrol report.",
    });
  }
};

// GET PATROL LOGS
exports.getPatrolLogs = async (req, res) => {
  try {
    const patrol = await Patrol.findById(req.params.id)
      .populate("logs.user", "name email role");

    if (!patrol) {
      return res.status(404).json({
        message: "Patrol not found.",
      });
    }

    const currentUserId = req.user._id.toString();

    const isCommandRole = ["admin", "commander"].includes(req.user.role);

    const isAssigned = patrol.assignedUsers.some((u) => {
      return u.toString() === currentUserId;
    });

    const isAssignedLeader =
      patrol.patrolLeader &&
      patrol.patrolLeader.toString() === currentUserId;

    if (!isCommandRole && !isAssigned && !isAssignedLeader) {
      return res.status(403).json({
        message: "You are not allowed to view logs for this patrol.",
      });
    }

    res.json(patrol.logs);
  } catch (error) {
    console.error("Get patrol logs error:", error);
    res.status(500).json({
      message: "Server error while getting patrol logs.",
    });
  }
};
