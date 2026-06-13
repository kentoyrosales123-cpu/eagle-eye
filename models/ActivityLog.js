const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    patrol: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patrol",
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    type: {
      type: String,
      enum: [
  "patrol_created",
  "patrol_started",
  "patrol_completion_requested",
  "patrol_acknowledged",
  "patrol_completed",
  "location_update",
  "sos",
  "incident_reported",
],
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    location: {
      lat: Number,
      lng: Number,
    },
    metadata: {
  type: Object,
  default: {},
},
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);