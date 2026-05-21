const router = require("express").Router();
const { execFile } = require("child_process");
const path = require("path");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const { verifyToken } = require("../utils/verifyToken");

router.post("/verify", verifyToken, async (req, res) => {
  try {
    const { bookingId, amount, method, status, failureReason, transactionId } = req.body;
    const payment = await Payment.create({
      userId: req.user.id,
      bookingId,
      amount,
      method,
      status,
      transactionId,
      failureReason: failureReason || ""
    });

    if (bookingId && status === "paid") {
      await Booking.findByIdAndUpdate(bookingId, {
        paymentStatus: "paid",
        status: "assigned",
        updatedAt: new Date()
      });
    }

    res.json(payment);
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
