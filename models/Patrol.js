const mongoose = require("mongoose");

const patrolSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    area: {
      type: String,
      required: true,
      trim: true,
    },

    objective: {
  type: String,
  required: true,
  trim: true,
},
priority: {
  type: String,
  enum: ["low", "medium", "high", "critical"],
  default: "medium",
},

missionType: {
  type: String,
  enum: [
    "routine_patrol",
    "reconnaissance",
    "security_sweep",
    "emergency_response",
    "search_and_rescue",
  ],
  default: "routine_patrol",
},

cancelReason: {
  type: String,
  default: "",
},

    unit: {
  type: String,
  required: true,
},

team: {
  type: String,
  enum: [
    "Alpha Patrol",
    "Bravo Patrol",
    "Charlie Patrol",
    "Delta Patrol",
    "Echo Patrol",
  ],
  default: "Alpha Patrol",
},

    assignedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    patrolLeader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    

    status: {
  type: String,
  enum: [
  "scheduled",
  "ready",
  "active",
  "on_hold",
  "pending_acknowledgement",
  "completed",
  "cancelled",
],
default: "scheduled",
},

    startTime: {
      type: Date,
      required: true,
    },

    endTime: {
      type: Date,
      required: true,
    },

    startedAt: Date,
    completedAt: Date,
    completedRequestAt: Date,
acknowledgedAt: Date,
report: {
  summary: {
    type: String,
    default: "",
  },
  incidents: {
    type: String,
    default: "",
  },
  remarks: {
    type: String,
    default: "",
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  submittedAt: {
    type: Date,
    default: null,
  },
},

    routeHistory: [
  {
    lat: Number,
    lng: Number,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
],
logs: [
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    type: {
  type: String,
  enum: [
    "checkpoint",
    "sos",
    "sos_acknowledged",
    "patrol_ended",
    "note",
  ],
  required: true,
},
    message: {
      type: String,
      required: true,
    },
    lat: Number,
    lng: Number,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Patrol", patrolSchema);
