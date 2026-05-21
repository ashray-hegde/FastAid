const router = require("express").Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Provider = require("../models/Provider");
const { verifyToken, signToken } = require("../utils/verifyToken");
const { randomUUID } = require("crypto");

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, fullName, age, mobileNumber, secondaryMobileNumber, addresses } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    if (await User.findOne({ email })) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    
    // Prepare user data
    const userData = {
      name,
      fullName: fullName || name,
      email,
      password: hash,
      role,
      age: age ? Number(age) : undefined,
      mobileNumber: mobileNumber || undefined,
      secondaryMobileNumber: secondaryMobileNumber || undefined
    };

    // If customer, store addresses
    if (role === "user" && addresses && Array.isArray(addresses) && addresses.length > 0) {
      userData.savedAddresses = addresses.map(addr => ({
        id: addr.id || randomUUID(),
        label: addr.label || "Home",
        street: addr.street,
        city: addr.city,
        state: addr.state,
        postalCode: addr.postalCode,
        coordinates: addr.coordinates
      })).slice(0, 10); // Max 10 addresses
    }

    const user = await User.create(userData);

    if (role === "provider") {
      await Provider.create({ userId: user._id, documents: {}, verified: false });
    }

    const token = signToken({ id: user._id, role: user.role, name: user.name });
    res.status(201).json({ token, role: user.role, name: user.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    const token = signToken({ id: user._id, role: user.role, name: user.name });
    res.json({ token, role: user.role, name: user.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user profile
router.put("/profile", verifyToken, async (req, res) => {
  try {
    const { fullName, age, mobileNumber, secondaryMobileNumber, profilePicture } = req.body;
    
    const updateData = {};
    if (fullName) updateData.fullName = fullName;
    if (age) updateData.age = Number(age);
    if (mobileNumber) updateData.mobileNumber = mobileNumber;
    if (secondaryMobileNumber) updateData.secondaryMobileNumber = secondaryMobileNumber;
    if (profilePicture) updateData.profilePicture = profilePicture;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true }
    ).select("-password");

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "Profile updated successfully", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/wallet/topup", verifyToken, async (req, res) => {
  try {
    const amount = Number(req.body.amount) || 0;
    if (amount <= 0) return res.status(400).json({ error: "Invalid top-up amount" });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { walletBalance: amount } },
      { new: true }
    );

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/update-location", verifyToken, async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Latitude and longitude are required" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        location: {
          type: "Point",
          coordinates: [longitude, latitude],
          address: address || ""
        },
        lastLocationUpdate: new Date()
      },
      { new: true }
    );

    res.json({ message: "Location updated successfully", location: user.location });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Saved addresses CRUD
router.post("/addresses", verifyToken, async (req, res) => {
  try {
    const { label, street, city, state, postalCode, coordinates } = req.body;
    if (!label || !coordinates) return res.status(400).json({ error: "Label and coordinates required" });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    user.savedAddresses = user.savedAddresses || [];
    user.savedAddresses.unshift({ id: randomUUID(), label, street, city, state, postalCode, coordinates });
    if (user.savedAddresses.length > 10) user.savedAddresses = user.savedAddresses.slice(0, 10);
    await user.save();
    res.json(user.savedAddresses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/addresses", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('savedAddresses');
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user.savedAddresses || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an address
router.put("/addresses/:id", verifyToken, async (req, res) => {
  try {
    const addrId = req.params.id;
    const { label, street, city, state, postalCode, coordinates } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const idx = (user.savedAddresses || []).findIndex(a => a.id === addrId);
    if (idx === -1) return res.status(400).json({ error: "Address not found" });

    const existing = user.savedAddresses[idx];
    user.savedAddresses[idx] = {
      ...existing,
      label: label || existing.label,
      street: street || existing.street,
      city: city || existing.city,
      state: state || existing.state,
      postalCode: postalCode || existing.postalCode,
      coordinates: coordinates || existing.coordinates,
      createdAt: existing.createdAt
    };

    await user.save();
    res.json(user.savedAddresses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/addresses/:id", verifyToken, async (req, res) => {
  try {
    const addrId = req.params.id;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const idx = (user.savedAddresses || []).findIndex(a => a.id === addrId);
    if (idx === -1) return res.status(400).json({ error: "Address not found" });
    user.savedAddresses.splice(idx, 1);
    await user.save();
    res.json(user.savedAddresses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get provider dashboard stats
router.get("/provider-stats", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "provider") {
      return res.status(403).json({ error: "Provider access required" });
    }

    const ProviderHistory = require("../models/ProviderHistory");
    
    const history = await ProviderHistory.find({ providerId: req.user.id });
    
    const stats = {
      totalOrdersCompleted: history.length,
      totalTipsReceived: history.reduce((sum, h) => sum + (h.tipGiven || 0), 0),
      highestTipReceived: Math.max(...history.map(h => h.tipGiven || 0), 0),
      highestRatingReceived: Math.max(...history.map(h => h.rating || 0), 0),
      averageRating: history.length > 0 
        ? (history.reduce((sum, h) => sum + (h.rating || 0), 0) / history.length).toFixed(1)
        : 0
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/users", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/providers", verifyToken, async (req, res) => {
  try {
    const providers = await Provider.find().populate("userId", "name email");
    res.json(providers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/verify-provider/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const provider = await Provider.findByIdAndUpdate(req.params.id, { verified: true }, { new: true });
    res.json(provider);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/users/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    await Provider.findOneAndDelete({ userId: req.params.id });
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
