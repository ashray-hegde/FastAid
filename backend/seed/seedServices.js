const mongoose = require("mongoose");
const Service = require("../models/Service");

// MongoDB connection string
const MONGO_URI = "mongodb+srv://tanukumarsb_db_user:fkQs0hvbltkXXeiy@cluster0.88lwrhn.mongodb.net/";

const services = [
  {
    name: "Plumber",
    category: "Home Repair",
    rating: 4.5
  },
  {
    name: "Electrician",
    category: "Home Repair",
    rating: 4.7
  },
  {
    name: "AC Repair",
    category: "Appliance",
    rating: 4.3
  },
  {
    name: "Carpenter",
    category: "Home Repair",
    rating: 4.6
  },
  {
    name: "House Cleaning",
    category: "Cleaning",
    rating: 4.4
  },
  {
    name: "Painting",
    category: "Home Repair",
    rating: 4.2
  },
  {
    name: "Pest Control",
    category: "Cleaning",
    rating: 4.1
  },
  {
    name: "Gardening",
    category: "Outdoor",
    rating: 4.0
  },
  {
    name: "Appliance Repair",
    category: "Appliance",
    rating: 4.5
  },
  {
    name: "Moving & Packing",
    category: "Transport",
    rating: 4.3
  }
];

const seedServices = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    // Clear existing services
    await Service.deleteMany();
    console.log("Cleared existing services");

    // Insert new services
    const createdServices = await Service.insertMany(services);
    console.log(`Seeded ${createdServices.length} services`);

    console.log("Seed completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Error seeding services:", err.message);
    process.exit(1);
  }
};

seedServices();
