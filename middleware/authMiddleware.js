const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Not authorized, no token",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    if (req.user.status !== "active") {
  return res.status(403).json({
    message:
      "Your account is inactive. Contact administrator.",
  });
}

    next();
  } catch (error) {
    res.status(401).json({
      message: "Not authorized, token failed",
    });
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({
      message: "Admin access only",
    });
  }
};

exports.adminOrCommander = (req, res, next) => {
  if (req.user && ["admin", "commander"].includes(req.user.role)) {
    next();
  } else {
    res.status(403).json({
      message: "Admin or commander access only",
    });
  }
};

exports.allowRoles = (...roles) => {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({
        message: "Access denied for this role",
      });
    }
  };
};

exports.adminOrCommander = (req, res, next) => {
  if (req.user && ["admin", "commander"].includes(req.user.role)) {
    next();
  } else {
    res.status(403).json({
      message: "Admin or commander access only",
    });
  }
};