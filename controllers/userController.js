const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Patrol = require("../models/Patrol");

exports.createUser = async (req, res) => {
  try {
    const {
  name,
  email,
  password,
  role,
  rank,
  unit,
team,
assignedCommander,
} = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email, and password are required",
      });
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
  name,
  email: email.toLowerCase(),
  password: hashedPassword,
  role: role || "patrol_member",
  rank: rank || "PVT",
  unit: unit || "Alpha",
  team: team || "Team 1",
  assignedCommander: assignedCommander || null,
  status: "active",
});

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
rank: user.rank,
unit: user.unit,
team: user.team,
assignedCommander: user.assignedCommander,
status: user.status,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create user",
      error: error.message,
    });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");

    const usersWithPatrolStatus = await Promise.all(
      users.map(async (user) => {
        const patrol = await Patrol.findOne({
          assignedUsers: user._id,
          status: {
            $in: [
  "scheduled",
  "ready",
  "active",
  "on_hold",
  "pending_acknowledgement",
]
          },
        }).sort({ createdAt: -1 });

        let patrolStatus = "Available";

        if (patrol?.status === "active") {
          patrolStatus = "On Patrol";
        }

        if (patrol?.status === "scheduled") {
          patrolStatus = "Scheduled Patrol";
        }

        return {
          ...user.toObject(),
          patrolStatus,
        };
      })
    );

    res.json(usersWithPatrolStatus);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      message: "Failed to load users",
    });
  }
};

exports.updateUserRoleRank = async (req, res) => {
  try {
    const { role, rank } = req.body;

    const allowedRoles = [
      "admin",
      "commander",
      "patrol_leader",
      "patrol_member",
      "communication_officer",
      "monitoring_officer",
    ];

    const allowedRanks = [
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
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!allowedRanks.includes(rank)) {
      return res.status(400).json({ message: "Invalid rank" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, rank },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "User role and rank updated successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update user",
      error: error.message,
    });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      rank: user.rank,
      status: user.status,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get current user",
      error: error.message,
    });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const allowedStatus = ["active", "inactive"];

    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({
        message: "You cannot deactivate your own account",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({
      message: "User status updated successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update user status",
      error: error.message,
    });
  }
};

exports.updateUserAssignment = async (req, res) => {
  try {
    const { unit, team, assignedCommander } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { unit, team, assignedCommander: assignedCommander || null },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Unit assignment updated successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update unit assignment",
      error: error.message,
    });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const {
      name,
      email,
      role,
      rank,
      unit,
      team,
      assignedCommander,
      status,
    } = req.body;

    if (!name || !email || !role || !rank || !unit || !team || !status) {
      return res.status(400).json({
        message: "All required fields must be provided.",
      });
    }

    const existingEmail = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: req.params.id },
    });

    if (existingEmail) {
      return res.status(400).json({
        message: "Email is already used by another user.",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        name,
        email: email.toLowerCase(),
        role,
        rank,
        unit,
        team,
        assignedCommander: assignedCommander || null,
        status,
      },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    res.json({
      message: "User profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update user profile.",
      error: error.message,
    });
  }
};