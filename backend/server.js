require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

const path = require("path");

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

    origin: "*",

    methods: [
      "GET",
      "POST",
      "PUT",
      "DELETE"
    ]

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

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

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

const limiter = rateLimit({

  windowMs:
    15 * 60 * 1000,

  max: 120,

  message:
    "Too many requests from this IP, please try again after 15 minutes"

});

app.use(limiter);

// ---------------------
// ROUTES
// ---------------------

app.use(
  "/api/auth",
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

app.use(
  "/api/payments",
  require("./routes/paymentRoutes")
);

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
// START SERVER
// ---------------------

const PORT =
  process.env.PORT || 5000;

server.listen(PORT, () => {

  console.log(
    `Backend running on port ${PORT}`
  );

});