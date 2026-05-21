const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../utils/verifyToken");
const Booking = require("../models/Booking");
const User = require("../models/User");

const connectedUsers = new Map();
const providerLocations = new Map(); // Store latest location per provider

module.exports = (io) => {

  io.on("connection", (socket) => {

    console.log("Socket connected:", socket.id);

    // ---------------------
    // REGISTER USER
    // ---------------------
    socket.on("register", ({ token }) => {
      try {
        if (!token) return;
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id;
        connectedUsers.set(userId, socket.id);
        socket.join(`user-${userId}`);
        console.log(`User Registered: ${userId}`);
      } catch (err) {
        console.log("Socket auth failed");
      }
    });

    // ---------------------
    // JOIN BOOKING ROOM (for live tracking)
    // ---------------------
    socket.on("join-booking", ({ bookingId, userId, token }) => {
      try {
        if (!token) return;
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.id !== userId) return; // Verify user
        socket.join(`booking-${bookingId}`);
        console.log(`User ${userId} joined booking ${bookingId}`);
      } catch (err) {
        console.log("Join booking auth failed");
      }
    });

    // ---------------------
    // PROVIDER LIVE LOCATION
    // ---------------------
    socket.on("provider-location", async (data) => {
      try {
        const { providerId, bookingId, latitude, longitude, token } = data;
        
        if (!token) return;
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.id !== providerId) return; // Verify provider

        // Store latest location
        providerLocations.set(providerId, {
          latitude,
          longitude,
          timestamp: new Date(),
          bookingId
        });

        // Update booking tracking info
        if (bookingId) {
          await Booking.findByIdAndUpdate(
            bookingId,
            {
              "tracking.providerLat": latitude,
              "tracking.providerLng": longitude,
              "tracking.updatedAt": new Date()
            },
            { new: true }
          );

          // Emit to all users in this booking room
          io.to(`booking-${bookingId}`).emit("location-update", {
            providerId,
            latitude,
            longitude,
            // emit also lat/lng for front-end compatibility
            lat: latitude,
            lng: longitude,
            timestamp: new Date()
          });
        }

        // Also emit to all connected users (fallback for non-room subscribers)
        io.emit("providerLocationUpdate", {
          providerId,
          latitude,
          longitude,
          // emit lat/lng aliases for clients expecting those keys
          lat: latitude,
          lng: longitude,
          bookingId,
          timestamp: new Date()
        });

        console.log(`Location updated for provider ${providerId}`);
      } catch (err) {
        console.error("Location update error:", err);
      }
    });

    // ---------------------
    // GET PROVIDER CURRENT LOCATION
    // ---------------------
    socket.on("get-provider-location", ({ providerId }, callback) => {
      try {
        const location = providerLocations.get(providerId);
        if (callback) {
          callback(location || null);
        }
      } catch (err) {
        console.error("Get location error:", err);
        if (callback) callback(null);
      }
    });

    // ---------------------
    // DISCONNECT
    // ---------------------
    socket.on("disconnect", () => {
      for (const [userId, socketId] of connectedUsers.entries()) {
        if (socketId === socket.id) {
          connectedUsers.delete(userId);
          providerLocations.delete(userId);
          break;
        }
      }
      console.log("Socket disconnected:", socket.id);
    });

  });

  return connectedUsers;
};