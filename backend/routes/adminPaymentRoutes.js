const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const PaymentConfig = require("../models/PaymentConfig");
const { verifyToken } = require("../utils/verifyToken");

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-").toLowerCase()}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only image files allowed"), false);
    }
    cb(null, true);
  }
});

const buildConfig = (config) => ({
  upiIds: Array.isArray(config.upiIds) ? config.upiIds : [],
  qrCodes: Array.isArray(config.qrCodes) ? config.qrCodes : [],
  bankAccounts: Array.isArray(config.bankAccounts) ? config.bankAccounts : [],
  cardSupported: config.cardSupported ?? true,
  codSupported: config.codSupported ?? true,
  enabled: config.enabled ?? true,
  updatedAt: config.updatedAt,
  createdAt: config.createdAt
});

router.get("/config", async (req, res) => {
  try {
    let config = await PaymentConfig.findOne();
    if (!config) {
      config = await PaymentConfig.create({
        upiIds: [],
        qrCodes: [],
        bankAccounts: [],
        cardSupported: true,
        codSupported: true,
        enabled: true
      });
    }
    res.json(buildConfig(config));
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/config", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin only" });
    }

    let config = await PaymentConfig.findOne();
    if (!config) {
      config = new PaymentConfig();
    }

    config.upiIds = Array.isArray(req.body.upiIds)
      ? req.body.upiIds
          .filter((item) => item?.value)
          .map((item) => ({
            value: item.value,
            label: item.label || item.value,
            enabled: item.enabled !== false
          }))
      : config.upiIds || [];

    config.bankAccounts = Array.isArray(req.body.bankAccounts)
      ? req.body.bankAccounts
          .filter((item) => item?.accountNumber)
          .map((item) => ({
            bankName: item.bankName || "",
            accountName: item.accountName || "",
            accountNumber: item.accountNumber,
            ifsc: item.ifsc || "",
            enabled: item.enabled !== false
          }))
      : config.bankAccounts || [];

    if (!Array.isArray(config.qrCodes)) {
      config.qrCodes = [];
    }
    if (Array.isArray(req.body.qrCodes)) {
      config.qrCodes = req.body.qrCodes
        .filter((item) => item?.url)
        .map((item) => ({
          url: item.url,
          label: item.label || "QR Code",
          enabled: item.enabled !== false
        }));
    }

    config.cardSupported = req.body.cardSupported ?? config.cardSupported ?? true;
    config.codSupported = req.body.codSupported ?? config.codSupported ?? true;
    config.enabled = req.body.enabled ?? config.enabled ?? true;
    config.updatedAt = new Date();

    await config.save();
    const io = req.app.get("io");
    if (io) {
      io.emit("payment-config-updated", buildConfig(config));
    }
    res.json({ success: true, message: "Payment config saved successfully", config: buildConfig(config) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/upload-qr", verifyToken, upload.single("qrCode"), async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin only" });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: "QR image is required" });
    }

    const config = (await PaymentConfig.findOne()) || new PaymentConfig();
    config.qrCodes = Array.isArray(config.qrCodes) ? config.qrCodes : [];
    config.qrCodes.push({
      url: `/uploads/${req.file.filename}`,
      label: req.body.label || req.file.originalname,
      enabled: true
    });
    await config.save();
    const io = req.app.get("io");
    if (io) {
      io.emit("payment-config-updated", buildConfig(config));
    }
    res.json({ success: true, config: buildConfig(config) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/upload-qr/:qrId", verifyToken, upload.single("qrCode"), async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin only" });
    }
    const config = (await PaymentConfig.findOne()) || new PaymentConfig();
    if (!Array.isArray(config.qrCodes)) config.qrCodes = [];

    const existingQr = config.qrCodes.id(req.params.qrId);
    if (!existingQr) {
      return res.status(404).json({ success: false, error: "QR code record not found" });
    }

    if (req.file) {
      const filePath = path.join(uploadDir, path.basename(existingQr.url));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      existingQr.url = `/uploads/${req.file.filename}`;
      existingQr.label = req.body.label || existingQr.label || req.file.originalname;
    }

    await config.save();
    const io = req.app.get("io");
    if (io) {
      io.emit("payment-config-updated", buildConfig(config));
    }
    res.json({ success: true, config: buildConfig(config) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/upload-qr/:qrId", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin only" });
    }

    const config = (await PaymentConfig.findOne()) || new PaymentConfig();
    if (!Array.isArray(config.qrCodes)) config.qrCodes = [];
    const qr = config.qrCodes.id(req.params.qrId);
    if (!qr) {
      return res.status(404).json({ success: false, error: "QR code not found" });
    }

    const filePath = path.join(uploadDir, path.basename(qr.url));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    config.qrCodes = config.qrCodes.filter(
      (item) => item._id?.toString() !== req.params.qrId
    );
    await config.save();
    const io = req.app.get("io");
    if (io) {
      io.emit("payment-config-updated", buildConfig(config));
    }
    res.json({ success: true, config: buildConfig(config) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const User = require("../models/User");

router.get("/payments/pending", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin only" });
    }

    const payments = await Payment.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .populate("userId", "name email walletBalance")
      .populate("bookingId", "serviceName servicePrice paymentStatus paymentMethod");

    res.json(payments);
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/payments/review/:paymentId", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admin only" });
    }
    const { action, reason } = req.body;
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, error: "Payment record not found" });
    }

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, error: "Invalid review action" });
    }

    if (action === "approve") {
      payment.status = "paid";
      payment.adminReview = {
        status: "approved",
        reviewer: req.user.id,
        reason: reason || "Approved by admin",
        reviewedAt: new Date()
      };

      if (payment.transactionType === "topup") {
        const user = await User.findById(payment.userId);
        if (user) {
          user.walletBalance = Number(user.walletBalance || 0) + Number(payment.amount);
          await user.save();
        }
      }
      if (payment.bookingId) {
        const booking = await Booking.findById(payment.bookingId);
        if (booking) {
          booking.paymentStatus = "paid";
          await booking.save();
        }
      }
    } else {
      payment.status = "failed";
      payment.adminReview = {
        status: "rejected",
        reviewer: req.user.id,
        reason: reason || "Rejected by admin",
        reviewedAt: new Date()
      };
      if (payment.bookingId) {
        const booking = await Booking.findById(payment.bookingId);
        if (booking) {
          booking.paymentStatus = "failed";
          await booking.save();
        }
      }
    }

    await payment.save();
    const io = req.app.get("io");
    if (io) {
      io.emit("payment-reviewed", {
        paymentId: payment._id,
        status: payment.status,
        bookingId: payment.bookingId,
        userId: payment.userId
      });
    }

    res.json({ success: true, payment });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;