const express = require("express");
const router = express.Router();

const {
  createPatrol,
  getPatrols,
  getActivePatrols,
  startPatrol,
  completePatrol,
  acknowledgePatrol,
  updatePatrolStatus,
  addPatrolLog,
  getPatrolLogs,
submitPatrolReport,
} = require("../controllers/patrolController");

const {
  protect,
  adminOnly,
  allowRoles,
} = require("../middleware/authMiddleware");

router.post(
  "/",
  protect,
  allowRoles("admin", "commander"),
  createPatrol
);



router.get(
  "/",
  protect,
  allowRoles("admin", "commander"),
  getPatrols
);

router.patch(
  "/:id/start",
  protect,
  allowRoles("admin", "commander", "patrol_leader"),
  startPatrol
);

router.patch(
  "/:id/acknowledge",
  protect,
  allowRoles("admin", "commander"),
  acknowledgePatrol
);

router.patch(
  "/:id/status",
  protect,
  allowRoles("admin", "commander", "patrol_leader"),
  updatePatrolStatus
);

router.get("/active", protect, getActivePatrols);

// USER REQUEST COMPLETE
router.patch(
  "/:id/complete",
  protect,
  allowRoles("patrol_leader"),
  completePatrol
);

router.post("/:id/logs", protect, addPatrolLog);
router.get("/:id/logs", protect, getPatrolLogs);
router.patch(
  "/:id/report",
  protect,
  allowRoles("patrol_leader"),
  submitPatrolReport
);

module.exports = router;