const express = require("express");
const router = express.Router();

const {
  createUser,
  getUsers,
  updateUserRoleRank,
  updateUserStatus,
  getCurrentUser,
  updateUserAssignment,
  updateUserProfile,
} = require("../controllers/userController");

const {
  protect,
  adminOnly,
  allowRoles,
} = require("../middleware/authMiddleware");

router.post("/", protect, adminOnly, createUser);
router.get("/", protect, allowRoles("admin", "commander"), getUsers);
router.put("/:id/role-rank", protect, adminOnly, updateUserRoleRank);
router.put("/:id/status", protect, adminOnly, updateUserStatus);
router.get("/me", protect, getCurrentUser);
router.put("/:id/assignment", protect, adminOnly, updateUserAssignment);
router.put("/:id/profile", protect, adminOnly, updateUserProfile);

module.exports = router;