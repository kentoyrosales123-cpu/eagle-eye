const bcrypt = require("bcryptjs");
const User = require("../models/User");

const createDefaultAdmin = async () => {
  try {
    const adminEmail = "admin@agilacom.com";

    const existingAdmin = await User.findOne({ email: adminEmail });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);

      await User.create({
        name: "AgilaCom Admin",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        status: "active",
      });

      console.log("Default admin account created");
    } else {
      console.log("Default admin already exists");
    }
  } catch (error) {
    console.error("Admin creation failed:", error.message);
  }
};

module.exports = createDefaultAdmin;