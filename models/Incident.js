const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
  {
    patrol: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patrol",
    },

    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },

    location: {
      lat: Number,
      lng: Number,
    },

    status: {
      type: String,
      enum: ["open", "reviewing", "resolved"],
      default: "open",
    },
    photo: {
  type: String,
  default: "",
},
  },
  { timestamps: true }
);

module.exports = mongoose.model("Incident", incidentSchema);