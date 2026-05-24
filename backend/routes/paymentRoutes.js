const express = require("express");
const router = express.Router();
const { verifyToken } = require("../utils/verifyToken");
const paymentController = require("../controllers/paymentController");
const { execFile } = require("child_process");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const User = require("../models/User");
// --- Razorpay Production Endpoints ---
router.post("/create-order", verifyToken, paymentController.createOrder);
router.post("/verify-payment", verifyToken, paymentController.verifyPayment);
router.post("/wallet-topup", verifyToken, paymentController.walletTopup);
router.get("/history", verifyToken, paymentController.paymentHistory);
// Webhook route will be mounted with express.raw() in server.js

// setup uploads for payment proofs
const uploadDir = path.join(__dirname, "..", "uploads", "payments");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-").toLowerCase()}`)
});
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    cb(null, allowed.includes(file.mimetype));
  }
});

const updateBookingPaymentStatus = async (bookingId, status) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) return null;
  booking.paymentStatus = status;
  await booking.save();
  return booking;
};

router.post("/verify", verifyToken, async (req, res) => {
  try {
    const { bookingId, amount, method, status, failureReason, transactionId, transactionNote } = req.body;
    const booking = bookingId ? await Booking.findById(bookingId) : null;
    if (bookingId && !booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const paymentAmount = Number(amount || (booking ? booking.servicePrice + booking.tip : 0));
    const manualMethods = ["bank", "card", "manual"];
    const isManualMethod = manualMethods.includes(method);
    const statusValue = isManualMethod ? "pending" : status === "paid" ? "paid" : status === "failed" ? "failed" : "pending";
    const requiresApproval = isManualMethod || status === "pending";

    const payment = await Payment.create({
      userId: req.user.id,
      bookingId,
      amount: paymentAmount,
      method,
      transactionId,
      status: statusValue,
      failureReason: failureReason || "",
      transactionType: bookingId ? "booking" : "topup",
      requiresApproval,
      metadata: { transactionNote: transactionNote || "" }
    });

    if (booking && !isManualMethod && status === "paid") {
      await updateBookingPaymentStatus(bookingId, "paid");
    }

    if (booking && status === "failed") {
      await updateBookingPaymentStatus(bookingId, "failed");
    }

    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/wallet-topup", verifyToken, async (req, res) => {
  try {
    const { amount, method = "bank", transactionId, transactionNote, proofUrl } = req.body;
    const topupAmount = Number(amount);
    if (!topupAmount || topupAmount <= 0) {
      return res.status(400).json({ error: "Top-up amount must be greater than zero" });
    }
    const payment = await Payment.create({
      userId: req.user.id,
      amount: topupAmount,
      method,
      transactionId,
      transactionType: "topup",
      status: "pending",
      requiresApproval: true,
      metadata: {
        transactionNote: transactionNote || "Wallet top-up request",
        proofUrl: proofUrl || ""
      }
    });
    res.status(201).json({ success: true, payment, message: "Wallet top-up request submitted and waiting for admin approval." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/transactions", verifyToken, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/pending", verifyToken, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user.id, status: "pending" }).sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/methods", verifyToken, async (req, res) => {
  try {
    const PaymentConfig = require("../models/PaymentConfig");
    const config = await PaymentConfig.findOne({ enabled: true }).lean();
    return res.json(config || { upiIds: [], qrCodes: [], bankAccounts: [], cardSupported: true, codSupported: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// customer upload proof (attach to payment/booking later)
router.post("/upload-proof", verifyToken, upload.single("proof"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Proof image is required" });
    const url = `/uploads/payments/${req.file.filename}`;
    res.json({ success: true, url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/tip-recommendation", verifyToken, async (req, res) => {
  try {
    const pythonPath = process.env.PYTHON_PATH || "python";
    const filePath = path.join(__dirname, "..", "ml", "tip_model.py");
    const input = {
      baseAmount: Number(req.query.baseAmount) || 0,
      serviceRating: Number(req.query.serviceRating) || 4.5,
      paymentMethod: req.query.paymentMethod || "card",
      urgencyScore: Number(req.query.urgencyScore) || 5
    };

    const child = execFile(pythonPath, [filePath], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        return res.status(200).json({ recommendTip: Math.round(input.baseAmount * 0.1 * 100) / 100, fallback: true });
      }
      try {
        const output = JSON.parse(stdout.trim());
        return res.json(output);
      } catch (parseErr) {
        return res.status(500).json({ error: "Tip recommendation parse error" });
      }
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/failed", verifyToken, async (req, res) => {
  try {
    const failures = await Payment.find({ userId: req.user.id, status: "failed" }).sort({ createdAt: -1 });
    res.json(failures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
