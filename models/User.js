const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "AgilaCom Admin",
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
  type: String,
  enum: [
    "admin",
    "commander",
    "patrol_leader",
    "patrol_member",
    "communication_officer",
    "monitoring_officer",
  ],
  default: "patrol_member",
},

rank: {
  type: String,
  enum: [
    "PVT",
    "PFC",
    "CPL",
    "SGT",
    "SSG",
    "TSG",
    "MSG",
    "SMS",
    "CMS",
    "2LT",
    "1LT",
    "CPT",
    "MAJ",
    "LTC",
    "COL",
  ],
  default: "PVT",
},
unit: {
  type: String,
  enum: ["Alpha", "Bravo", "Charlie", "Delta"],
  default: "Alpha",
},

team: {
  type: String,
  default: "Team 1",
},

assignedCommander: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // LIVE SIGNAL DATA
    isOnline: {
      type: Boolean,
      default: false,
    },

    signalStrength: {
      type: Number,
      default: 0,
    },

    latency: {
      type: Number,
      default: 0,
    },

    networkType: {
      type: String,
      default: "unknown",
    },

    // GPS LOCATION
    latitude: {
      type: Number,
      default: null,
    },

    longitude: {
      type: Number,
      default: null,
    },

    accuracy: {
      type: Number,
      default: null,
    },

    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
