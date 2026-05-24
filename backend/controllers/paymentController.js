const Razorpay = require('../utils/razorpay');
const Payment = require('../models/Payment');
const WalletTransaction = require('../models/Wallet');
const verifyRazorpaySignature = require('../middleware/paymentVerification');
const User = require('../models/User');
const Booking = require('../models/Booking');

// Create Razorpay order for booking or wallet top-up
exports.createOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;
    const options = {
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency,
      receipt,
      notes,
    };
    const order = await Razorpay.orders.create(options);
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
};

// Verify payment after frontend success
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId, type } = req.body;
    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) return res.status(400).json({ error: 'Invalid payment signature' });

    // Update Payment record
    const payment = await Payment.findOneAndUpdate(
      { razorpay_order_id },
      { status: 'paid', razorpay_payment_id },
      { new: true }
    );

    if (type === 'booking' && bookingId) {
      await Booking.findByIdAndUpdate(bookingId, {
        paymentStatus: 'paid',
        bookingStatus: 'confirmed',
      });
      // TODO: Emit socket event for booking confirmation
    }
    if (type === 'wallet') {
      // Find wallet transaction and mark as success
      await WalletTransaction.findOneAndUpdate(
        { paymentId: payment._id },
        { status: 'success' }
      );
      // Increase user wallet balance
      await User.findByIdAndUpdate(payment.userId, { $inc: { wallet: payment.amount } });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Payment verification failed', details: err.message });
  }
};

// Wallet top-up
exports.walletTopup = async (req, res) => {
  try {
    const { userId, amount, paymentId } = req.body;
    const txn = new WalletTransaction({
      userId,
      amount,
      type: 'topup',
      status: 'pending',
      paymentId,
    });
    await txn.save();
    res.json({ success: true, txn });
  } catch (err) {
    res.status(500).json({ error: 'Wallet top-up failed', details: err.message });
  }
};

// Webhook handler
exports.webhook = async (req, res) => {
  // Razorpay webhook signature verification and event handling
  // Use express.raw() for this route in server.js
  try {
    const io = req.app.get("io");
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body;
    const expectedSignature = require("crypto")
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(body))
      .digest("hex");
    if (signature !== expectedSignature) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const event = body.event;
    const payload = body.payload;
    let paymentId, orderId, bookingId, userId, amount;

    // Idempotency: prevent duplicate processing
    const processed = new Set();

    if (event === "payment.captured" || event === "order.paid") {
      paymentId = payload?.payment?.entity?.id || payload?.order?.entity?.id;
      orderId = payload?.payment?.entity?.order_id || payload?.order?.entity?.id;
      amount = (payload?.payment?.entity?.amount || payload?.order?.entity?.amount) / 100;
      // Find payment/order
      let payment = await Payment.findOne({ razorpay_order_id: orderId });
      if (!payment) {
        // Create if not exists
        payment = await Payment.create({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          amount,
          status: "paid"
        });
      } else if (payment.status === "paid") {
        return res.json({ received: true, duplicate: true });
      } else {
        payment.status = "paid";
        payment.razorpay_payment_id = paymentId;
        await payment.save();
      }
      bookingId = payment.bookingId;
      userId = payment.userId;
      // Update booking
      if (bookingId) {
        await Booking.findByIdAndUpdate(bookingId, {
          paymentStatus: "paid",
          bookingStatus: "confirmed"
        });
        // Emit bookingConfirmed and paymentSuccess
        io.to(`user-${userId}`).emit("bookingConfirmed", { bookingId, paymentId, status: "confirmed" });
        io.to(`user-${userId}`).emit("paymentSuccess", { bookingId, paymentId, amount });
        // Assign provider (simulate)
        io.emit("providerAssigned", { bookingId });
      }
      // Wallet top-up
      if (payment.transactionType === "topup") {
        await WalletTransaction.findOneAndUpdate(
          { paymentId: payment._id },
          { status: "success" }
        );
        await User.findByIdAndUpdate(userId, { $inc: { wallet: payment.amount } });
        io.to(`user-${userId}`).emit("walletUpdated", { amount: payment.amount });
      }
    } else if (event === "payment.failed") {
      paymentId = payload?.payment?.entity?.id;
      orderId = payload?.payment?.entity?.order_id;
      let payment = await Payment.findOne({ razorpay_order_id: orderId });
      if (payment) {
        payment.status = "failed";
        await payment.save();
        bookingId = payment.bookingId;
        userId = payment.userId;
        io.to(`user-${userId}`).emit("paymentFailed", { bookingId, paymentId });
      }
    } else if (event === "refund.processed") {
      // Handle refund
      paymentId = payload?.refund?.entity?.payment_id;
      let payment = await Payment.findOne({ razorpay_payment_id: paymentId });
      if (payment) {
        payment.status = "refunded";
        await payment.save();
        userId = payment.userId;
        io.to(`user-${userId}`).emit("paymentRefunded", { paymentId });
      }
    }
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: 'Webhook error', details: err.message });
  }
};

// Payment history
exports.paymentHistory = async (req, res) => {
  try {
    const { userId } = req.query;
    const payments = await Payment.find({ userId }).sort({ createdAt: -1 });
    res.json({ payments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payment history', details: err.message });
  }
};
