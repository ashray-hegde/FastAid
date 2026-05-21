const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_CHANGE_ME";

const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ error: "No token provided" });
  const parts = token.split(" ");
  if (parts.length !== 2) return res.status(401).json({ error: "Malformed token" });

  try {
    const decoded = jwt.verify(parts[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const signToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
};

module.exports = { verifyToken, signToken, JWT_SECRET };
