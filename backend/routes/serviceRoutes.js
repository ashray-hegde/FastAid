const router = require("express").Router();
const Service = require("../models/Service");
const { verifyToken } = require("../utils/verifyToken");
const { execFile } = require("child_process");
const path = require("path");

router.get("/", async (req, res) => {
  try {
    const services = await Service.find().sort({ popularityScore: -1, rating: -1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    const service = await Service.create(req.body);
    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/category/:category", async (req, res) => {
  try {
    const services = await Service.find({ category: req.params.category });
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json({ message: "Service deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/recommend-price", async (req, res) => {
  try {
    const input = {
      serviceName: req.body.serviceName || "",
      serviceCategory: req.body.serviceCategory || "",
      serviceBasePrice: Number(req.body.serviceBasePrice) || 0,
      serviceRating: Number(req.body.serviceRating) || 4.5,
      providerRating: Number(req.body.providerRating) || 4.6,
      customerUrgency: Number(req.body.customerUrgency) || 5,
      servicePopularity: Number(req.body.servicePopularity) || 50
    };
    const pythonPath = process.env.PYTHON_PATH || "python";
    const filePath = path.join(__dirname, "..", "ml", "pricing_model.py");

    const child = execFile(pythonPath, [filePath], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const fallback = Math.round((input.serviceBasePrice * (1 + (input.serviceRating - 4.5) * 0.05 + (input.customerUrgency / 10))) * 100) / 100;
        return res.json({ predictedPrice: fallback, fallback: true });
      }
      try {
        const result = JSON.parse(stdout.trim());
        res.json(result);
      } catch (parseErr) {
        const fallback = Math.round((input.serviceBasePrice * (1 + (input.serviceRating - 4.5) * 0.05 + (input.customerUrgency / 10))) * 100) / 100;
        res.json({ predictedPrice: fallback, fallback: true });
      }
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
