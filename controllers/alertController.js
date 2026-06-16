const Alert = require("../models/Alert");

exports.getAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find()
      .populate("user", "name email role rank unit")
      .populate("patrol", "title area team unit status")
      .populate("resolvedBy", "name email role")
      .sort({ createdAt: -1 });

    res.json(alerts);
  } catch (error) {
    res.status(500).json({
      message: "Failed to load alerts",
      error: error.message,
    });
  }
};

exports.getActiveAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find({ status: "active" })
      .populate("user", "name email role rank unit")
      .populate("patrol", "title area team unit status")
      .sort({ createdAt: -1 });

    res.json(alerts);
  } catch (error) {
    res.status(500).json({
      message: "Failed to load active alerts",
      error: error.message,
    });
  }
};

exports.resolveAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        status: "resolved",
        resolvedBy: req.user.id,
        resolvedAt: new Date(),
      },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({
        message: "Alert not found",
      });
    }

    res.json({
      message: "Alert resolved successfully",
      alert,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to resolve alert",
      error: error.message,
    });
  }
};

exports.getAlertAnalytics = async (req, res) => {
  try {
    const analytics = await Alert.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          count: -1,
        },
      },
    ]);

    const formatted = {
      sos: 0,
      emergency: 0,
      medical: 0,
      incident: 0,
      backup: 0,
      enemy_contact: 0,
      lost_connection: 0,
      patrol_delayed: 0,
    };

    analytics.forEach((item) => {
      formatted[item._id] = item.count;
    });

    res.json(formatted);
  } catch (error) {
    res.status(500).json({
      message: "Failed to load alert analytics",
      error: error.message,
    });
  }
};

exports.markUnresolved = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        status: "unresolved",
        resolvedBy: null,
        resolvedAt: null,
      },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({
        message: "Alert not found",
      });
    }

    res.json({
      message: "Alert marked as unresolved",
      alert,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update alert",
      error: error.message,
    });
  }
};