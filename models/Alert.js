const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    patrol: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patrol",
      default: null,
    },

    patrolTeam: {
  type: String,
  default: "",
},

patrolUnit: {
  type: String,
  default: "",
},

patrolTitle: {
  type: String,
  default: "",
},

    type: {
      type: String,
      enum: [
        "sos",
        "emergency",
        "medical",
        "incident",
        "backup",
        "enemy_contact",
        "lost_connection",
        "patrol_delayed",
      ],
      default: "sos",
    },

    message: {
      type: String,
      default: "",
    },

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

    status: {
  type: String,
  enum: [
    "active",
    "resolved",
    "unresolved",
  ],
  default: "unresolved",
},

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Alert", alertSchema);