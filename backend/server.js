require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const passport = require("passport");

const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

const path = require("path");
require("./config/passport");

const connectDB = require("./config/db");

// ---------------------
// CONNECT DATABASE
// ---------------------

connectDB();

// ---------------------
// EXPRESS APP
// ---------------------

const app = express();

// ---------------------
// HTTP SERVER
// ---------------------

const server = http.createServer(app);

// ---------------------
// SOCKET SERVER
// ---------------------

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// ---------------------
// STORE SOCKET INSTANCE
// ---------------------

app.set("io", io);

// ---------------------
// SOCKET HANDLER
// ---------------------

require("./socket/socketHandler")(io);

// ---------------------
// SECURITY
// ---------------------

app.use(helmet());

app.use(cors({
  origin: true,
  credentials: true
}));


// Razorpay webhook must use express.raw() before express.json()
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

app.use(passport.initialize());

app.use(mongoSanitize());

app.use(xss());

// ---------------------
// STATIC UPLOADS
// ---------------------

app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(
    path.join(__dirname, "uploads")
  )
);

// ---------------------
// RATE LIMITER
// ---------------------

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 20 : 100,
  message: "Too many requests from this IP, please try again after 15 minutes"
});

// ---------------------
// ROUTES
// ---------------------

app.use(
  "/api/auth",
  authLimiter,
  require("./routes/authRoutes")
);

app.use(
  "/api/services",
  require("./routes/serviceRoutes")
);

app.use(
  "/api/bookings",
  require("./routes/bookingRoutes")
);

app.use(
  "/api/cart",
  require("./routes/cartRoutes")
);


// New Razorpay payment routes (production)
app.use("/api/payment", require("./routes/paymentRoutes"));
// Legacy/manual payment routes (backward compatibility)
app.use("/api/payments", require("./routes/paymentRoutes"));

app.use(
  "/api/admin-payments",
  require("./routes/adminPaymentRoutes")
);

app.use(
  "/api/reviews",
  require("./routes/reviewRoutes")
);

// ---------------------
// TEST ROUTE
// ---------------------

app.get("/", (req, res) => {

  res.send(
    "FastAid Backend Running 🚀"
  );

});

// ---------------------
// SOCKET EVENTS
// ---------------------

io.on("connection", (socket) => {

  console.log(
    "Socket connected:",
    socket.id
  );

  socket.on("disconnect", () => {

    console.log(
      "Socket disconnected:",
      socket.id
    );

  });

});

// ---------------------
// PRODUCTION STATIC FRONTEND
// ---------------------

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/build/index.html"));
  });
}

// ---------------------
// HEALTH CHECK ROUTE
// ---------------------

app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

// ---------------------
// START SERVER
// ---------------------

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});