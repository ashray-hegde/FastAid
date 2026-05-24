const Razorpay = require('../utils/razorpay');
const Payment = require('../models/Payment');
const WalletTransaction = require('../models/Wallet');
const verifyRazorpaySignature = require('../middleware/paymentVerification');
const User = require('../models/User');
const Booking = require('../models/Booking');

// Create Razorpay order for booking or wallet top-up
exports.createOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes, type = 'booking' } = req.body;
    const options = {
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency,
      receipt,
      notes,
    };
    const order = await Razorpay.orders.create(options);

    // For wallet top-ups, create Payment document BEFORE payment starts
    if (type === 'wallet') {
      const userId = req.user?.id || req.user?._id || notes?.userId;
      if (!userId) {
        return res.status(400).json({ error: 'User ID required for wallet top-up' });
      }

      const payment = new Payment({
        userId,
        amount: Number(amount),
        currency,
        paymentMethod: 'razorpay',
        method: 'wallet',
        razorpay_order_id: order.id,
        transactionType: 'topup',
        status: 'created',
        metadata: { orderCreatedAt: new Date() }
      });
      await payment.save();
    }

    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
};

// Verify payment after frontend success
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId, type = 'booking' } = req.body;
    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) return res.status(400).json({ error: 'Invalid payment signature' });

    // Find existing payment
    let payment = await Payment.findOne({ razorpay_order_id });

    // Idempotency check: if already verified, return success without re-crediting
    if (payment && payment.status === 'paid') {
      return res.json({ success: true, duplicate: true, message: 'Payment already verified' });
    }

    if (!payment) {
      // For booking payments, create payment doc if not exists
      payment = new Payment({
        razorpay_order_id,
        razorpay_payment_id,
        amount: 0, // Will be updated from signature verification
        paymentMethod: 'razorpay',
        transactionType: type === 'wallet' ? 'topup' : 'booking',
        status: 'paid',
        bookingId: type === 'booking' ? bookingId : null,
        metadata: { verifiedAt: new Date() }
      });
    } else {
      // Update existing payment with verification details
      payment.status = 'paid';
      payment.razorpay_payment_id = razorpay_payment_id;
      payment.metadata = { ...payment.metadata, verifiedAt: new Date() };
    }

    // Save payment
    await payment.save();

    // Booking payment: update booking status
    if (type === 'booking' && bookingId) {
      await Booking.findByIdAndUpdate(bookingId, {
        paymentStatus: 'paid',
        bookingStatus: 'confirmed',
      });
    }

    // Wallet payment: increment user wallet and create transaction
    if (type === 'wallet' && payment.userId) {
      // Use atomic update to prevent race conditions
      const updated = await User.findByIdAndUpdate(
        payment.userId,
        { $inc: { wallet: payment.amount } },
        { new: true }
      );

      // Create wallet transaction record
      await WalletTransaction.updateOne(
        { paymentId: payment._id },
        {
          $set: {
            userId: payment.userId,
            amount: payment.amount,
            type: 'topup',
            status: 'success',
            paymentId: payment._id,
          }
        },
        { upsert: true }
      );

      // Emit socket events
      const io = req.app.get("io");
      if (io) {
        io.to(`user-${payment.userId}`).emit("walletUpdated", {
          amount: payment.amount,
          newBalance: updated?.wallet || 0,
          paymentId: payment.razorpay_payment_id
        });
        io.to(`user-${payment.userId}`).emit("paymentSuccess", {
          type: 'wallet',
          paymentId: payment.razorpay_payment_id,
          amount: payment.amount
        });
      }
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

    if (event === "payment.captured" || event === "order.paid") {
      const paymentId = payload?.payment?.entity?.id || payload?.order?.entity?.id;
      const orderId = payload?.payment?.entity?.order_id || payload?.order?.entity?.id;
      const amount = (payload?.payment?.entity?.amount || payload?.order?.entity?.amount) / 100;

      // Find payment by order ID
      let payment = await Payment.findOne({ razorpay_order_id: orderId });

      if (payment) {
        // Idempotency: if already paid, just acknowledge and return
        if (payment.status === "paid") {
          return res.json({ received: true, duplicate: true, message: "Already processed" });
        }

        // Update payment status to paid
        payment.status = "paid";
        payment.razorpay_payment_id = paymentId;
        await payment.save();
      } else {
        // Create payment if not exists (shouldn't happen for wallet topups as it's created in createOrder)
        payment = await Payment.create({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          amount,
          status: "paid",
          paymentMethod: "razorpay",
          transactionType: "booking"
        });
      }

      const bookingId = payment.bookingId;
      const userId = payment.userId;

      // Update booking if this is a booking payment
      if (bookingId && payment.transactionType === "booking") {
        await Booking.findByIdAndUpdate(bookingId, {
          paymentStatus: "paid",
          bookingStatus: "confirmed"
        });

        if (io) {
          io.to(`user-${userId}`).emit("bookingConfirmed", {
            bookingId,
            paymentId,
            status: "confirmed"
          });
          io.to(`user-${userId}`).emit("paymentSuccess", {
            bookingId,
            paymentId,
            amount
          });
          io.emit("providerAssigned", { bookingId });
        }
      }

      // Update wallet if this is a wallet topup
      if (payment.transactionType === "topup" && userId) {
        // Use atomic update to prevent duplicate crediting
        const updated = await User.findByIdAndUpdate(
          userId,
          { $inc: { wallet: payment.amount } },
          { new: true }
        );

        // Create/update wallet transaction
        await WalletTransaction.updateOne(
          { paymentId: payment._id },
          {
            $set: {
              userId,
              amount: payment.amount,
              type: "topup",
              status: "success",
              paymentId: payment._id,
            }
          },
          { upsert: true }
        );

        if (io) {
          io.to(`user-${userId}`).emit("walletUpdated", {
            amount: payment.amount,
            newBalance: updated?.wallet || 0,
            paymentId
          });
          io.to(`user-${userId}`).emit("paymentSuccess", {
            type: "wallet",
            paymentId,
            amount: payment.amount
          });
        }
      }
    } else if (event === "payment.failed") {
      const paymentId = payload?.payment?.entity?.id;
      const orderId = payload?.payment?.entity?.order_id;

      let payment = await Payment.findOne({ razorpay_order_id: orderId });
      if (payment) {
        payment.status = "failed";
        payment.failureReason = payload?.payment?.entity?.description || "Payment failed";
        await payment.save();

        const bookingId = payment.bookingId;
        const userId = payment.userId;

        if (io && userId) {
          io.to(`user-${userId}`).emit("paymentFailed", {
            bookingId,
            paymentId,
            reason: payment.failureReason
          });
        }
      }
    } else if (event === "refund.processed") {
      // Handle refund
      const paymentId = payload?.refund?.entity?.payment_id;
      let payment = await Payment.findOne({ razorpay_payment_id: paymentId });
      if (payment) {
        payment.status = "refunded";
        await payment.save();

        const userId = payment.userId;
        if (io && userId) {
          io.to(`user-${userId}`).emit("paymentRefunded", { paymentId });
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
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
