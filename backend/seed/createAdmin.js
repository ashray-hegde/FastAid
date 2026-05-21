const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://r09892703_db_user:pbx704ir0dmkD02h@cluster0.agyaaqf.mongodb.net/aidbridge?retryWrites=true&w=majority";

const createAdmin = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const adminEmail = "Omchannabasavaraj@gmail.com";
    const adminPassword = "Chanu123";
    const adminName = "Channa";

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log("Admin user already exists!");
      process.exit(0);
    }

    // Hash password
    const hash = await bcrypt.hash(adminPassword, 10);

    // Create admin user
    const admin = await User.create({
      name: adminName,
      email: adminEmail,
      password: hash,
      role: "admin"
    });

    console.log(`Admin user created successfully!`);
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    
    process.exit(0);
  } catch (err) {
    console.error("Error creating admin:", err.message);
    process.exit(1);
  }
};

createAdmin();
