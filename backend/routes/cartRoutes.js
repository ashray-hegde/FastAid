const router = require("express").Router();
const Cart = require("../models/Cart");
const Service = require("../models/Service");
const User = require("../models/User");
const Provider = require("../models/Provider");
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const { verifyToken } = require("../utils/verifyToken");
const mongoose = require("mongoose");

const calculateCart = (cart) => {
  const subtotal = cart.items.reduce((sum, item) => sum + Math.max(0, item.price) * item.quantity, 0);
  const tax = Math.round(subtotal * 0.12);
  const platformFee = Math.round(subtotal * 0.02);
  const serviceCharge = 20; // flat service charge
  const discount = cart.discount || 0;
  const grandTotal = subtotal + tax + platformFee + serviceCharge - discount;

  cart.subtotal = subtotal;
  cart.tax = tax;
  cart.platformFee = platformFee;
  cart.serviceCharge = serviceCharge;
  cart.discount = discount;
  cart.total = grandTotal;
};

const findProviderForService = async (service) => {
  if (!service) return null;
  const providerRecord = await Provider.findOne({
    active: true,
    serviceCategories: { $in: [service.category] }
  }).sort({ lastOnlineAt: -1 });
  if (providerRecord) {
    return await User.findById(providerRecord.userId);
  }
  return await User.findOne({ role: "provider", "paymentMethods.upiIds": { $exists: true } });
};

router.get("/", verifyToken, async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) {
      cart = await Cart.create({ userId: req.user.id, items: [] });
    }
    calculateCart(cart);
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/add", verifyToken, async (req, res) => {
  try {
    const { serviceId, quantity = 1, savedForLater = false } = req.body;
    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ error: "Service not found" });

    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) cart = await Cart.create({ userId: req.user.id, items: [] });

    const existing = cart.items.find((item) => item.serviceId.equals(serviceId));
    if (existing) {
      existing.quantity = Math.max(1, existing.quantity + quantity);
      existing.price = service.basePrice;
      existing.savedForLater = savedForLater;
    } else {
      cart.items.push({
        serviceId,
        serviceName: service.name,
        quantity,
        price: service.basePrice,
        savedForLater
      });
    }

    calculateCart(cart);
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/item/:itemId", verifyToken, async (req, res) => {
  try {
    const { quantity, savedForLater } = req.body;
    const cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) return res.status(404).json({ error: "Cart not found" });

    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Cart item not found" });

    if (typeof quantity === "number") item.quantity = Math.max(1, quantity);
    if (typeof savedForLater === "boolean") item.savedForLater = savedForLater;
    calculateCart(cart);
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/item/:itemId", verifyToken, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) return res.status(404).json({ error: "Cart not found" });
    cart.items.id(req.params.itemId)?.remove();
    calculateCart(cart);
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/clear", verifyToken, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) return res.status(404).json({ error: "Cart not found" });
    cart.items = [];
    cart.discount = 0;
    calculateCart(cart);
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/checkout", verifyToken, async (req, res) => {
  try {
    const { paymentMethod = "cod", couponCode, tip = 0, location, coordinates, locationDetails = {}, transactionId = null, transactionNote = "" } = req.body;
    const cart = await Cart.findOne({ userId: req.user.id });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    if (!location || !coordinates || typeof coordinates.lat !== "number" || typeof coordinates.lng !== "number") {
      return res.status(400).json({ error: "Delivery location is required for checkout." });
    }

    if (couponCode) {
      cart.couponCode = couponCode;
      cart.discount = 100;
    }

    calculateCart(cart);
    await cart.save();
    const bookings = [];
    const payments = [];
    const services = await Service.find({ _id: { $in: cart.items.map((item) => item.serviceId) } });
    const serviceMap = new Map(services.map((service) => [service._id.toString(), service]));
    const totalAmount = cart.total;
    const tipAmount = Number(tip || 0);
    const tipShare = totalAmount > 0 ? (tipAmount / totalAmount) : 0;

    let totalWalletDeducted = 0;
    if (paymentMethod === "wallet") {
      // use transaction to deduct total amount and create bookings/payments atomically
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const user = await User.findById(req.user.id).session(session);
        if (!user) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ error: "User not found" });
        }
        if (Number(user.walletBalance || 0) < totalAmount) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ error: "Insufficient wallet balance for full checkout" });
        }
        user.walletBalance = Number(user.walletBalance || 0) - totalAmount;
        await user.save({ session });

        for (const item of cart.items) {
          const service = serviceMap.get(item.serviceId.toString());
          if (!service) continue;
          const servicePrice = Number(item.price || service.basePrice) * Number(item.quantity || 1);
          const itemTip = Math.round(servicePrice * tipShare * 100) / 100;
          const bookingAmount = servicePrice + itemTip;

          let paymentStatus = "pending";
          let requiresApproval = false;
          let itemWalletDeducted = false;

          if (paymentMethod === "cod") {
            paymentStatus = "cod";
          } else if (paymentMethod === "wallet") {
            itemWalletDeducted = true;
            paymentStatus = "paid";
          } else if (paymentMethod === "upi" || paymentMethod === "qr") {
            paymentStatus = "paid";
            requiresApproval = false;
          } else if (["bank", "card", "manual"].includes(paymentMethod)) {
            paymentStatus = "pending";
            requiresApproval = true;
          } else {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ error: "Unsupported payment method" });
          }

          const bookingArr = await Booking.create([
            {
              userId: req.user.id,
              providerId: null,
              serviceId: item.serviceId,
              serviceName: item.serviceName || service.name,
              servicePrice,
              quantity: Number(item.quantity || 1),
              location,
              coordinates,
              locationDetails,
              status: "pending",
              paymentStatus,
              paymentMethod,
              transactionId: paymentMethod !== "cod" ? transactionId || `TX-${Date.now()}-${Math.random().toString(36).substr(2, 6)}` : null,
              tip: itemTip,
              couponCode: couponCode || undefined,
              etaMinutes: null
            }
          ], { session });

          const booking = bookingArr[0];

          await Payment.create([
            {
              userId: req.user.id,
              providerId: null,
              bookingId: booking._id,
              amount: booking.servicePrice + booking.tip,
              method: paymentMethod,
              status: paymentStatus === "paid" ? "paid" : "pending",
              transactionId: booking.transactionId,
              requiresApproval,
              transactionType: "booking",
              metadata: {
                transactionNote: transactionNote || undefined,
                walletDeducted: itemWalletDeducted
              }
            }
          ], { session });

          const io = req.app.get("io");
          if (io) io.emit("booking-created", { booking });

          bookings.push(booking);
          payments.push((await Payment.find({ bookingId: booking._id }).session(session)).slice(-1)[0]);
        }

        // clear cart inside transaction
        cart.items = [];
        cart.discount = 0;
        cart.couponCode = undefined;
        calculateCart(cart);
        await cart.save({ session });

        await session.commitTransaction();
        session.endSession();

        return res.json({ message: "Checkout complete", bookings, payments, cart });
      } catch (txErr) {
        try { await session.abortTransaction(); } catch (e) {}
        session.endSession();
        console.error(txErr);
        return res.status(500).json({ error: txErr.message });
      }
    }

    for (const item of cart.items) {
      const service = serviceMap.get(item.serviceId.toString());
      if (!service) continue;
      const servicePrice = Number(item.price || service.basePrice) * Number(item.quantity || 1);
      const itemTip = Math.round(servicePrice * tipShare * 100) / 100;
      const bookingAmount = servicePrice + itemTip;

      let paymentStatus = "pending";
      let requiresApproval = false;
      let itemWalletDeducted = false;

      if (paymentMethod === "cod") {
        paymentStatus = "cod";
      } else if (paymentMethod === "wallet") {
        totalWalletDeducted += bookingAmount;
        itemWalletDeducted = true;
        paymentStatus = "paid";
      } else if (paymentMethod === "upi" || paymentMethod === "qr") {
        paymentStatus = "paid";
        requiresApproval = false;
      } else if (["bank", "card", "manual"].includes(paymentMethod)) {
        paymentStatus = "pending";
        requiresApproval = true;
      } else {
        return res.status(400).json({ error: "Unsupported payment method" });
      }

      const booking = await Booking.create({
        userId: req.user.id,
        providerId: null,
        serviceId: item.serviceId,
        serviceName: item.serviceName || service.name,
        servicePrice,
        quantity: Number(item.quantity || 1),
        location,
        coordinates,
        locationDetails,
        status: "pending",
        paymentStatus,
        paymentMethod,
        transactionId: paymentMethod !== "cod" ? transactionId || `TX-${Date.now()}-${Math.random().toString(36).substr(2, 6)}` : null,
        tip: itemTip,
        couponCode: couponCode || undefined,
        etaMinutes: null
      });

      const payment = await Payment.create({
        userId: req.user.id,
        providerId: null,
        bookingId: booking._id,
        amount: booking.servicePrice + booking.tip,
        method: paymentMethod,
        status: paymentStatus === "paid" ? "paid" : "pending",
        transactionId: booking.transactionId,
        requiresApproval,
        transactionType: "booking",
        metadata: {
          transactionNote: transactionNote || undefined,
          walletDeducted: itemWalletDeducted
        }
      });

      const io = req.app.get("io");
      if (io) {
        io.emit("booking-created", { booking });
      }

      bookings.push(booking);
      payments.push(payment);
    }

    cart.items = [];
    cart.discount = 0;
    cart.couponCode = undefined;
    calculateCart(cart);
    await cart.save();
    res.json({ message: "Checkout complete", bookings, payments, cart });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
