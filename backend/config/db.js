const mongoose = require("mongoose");

module.exports = () => {
  const MONGO_URI =
    process.env.MONGO_URI ||
    "mongodb+srv://r09892703_db_user:pbx704ir0dmkD02h@cluster0.agyaaqf.mongodb.net/aidbridge?retryWrites=true&w=majority";

  mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => {
      console.error("MongoDB Connection Error:", err);
      process.exit(1);
    });
};



