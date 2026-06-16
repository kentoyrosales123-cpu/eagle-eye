const express = require("express");
const router = express.Router();

const {
  getAlerts,
  getActiveAlerts,
  getAlertAnalytics,
  resolveAlert,
  markUnresolved
} = require("../controllers/alertController");

const {
  protect,
  adminOrCommander,
} = require("../middleware/authMiddleware");

router.get("/", protect, getAlerts);
router.get("/active", protect, getActiveAlerts);
router.get("/analytics", protect, getAlertAnalytics);

router.put(
  "/:id/resolve",
  protect,
  adminOrCommander,
  resolveAlert
);

router.put(
  "/:id/unresolve",
  protect,
  adminOrCommander,
  markUnresolved
);

module.exports = router;