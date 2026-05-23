const mongoose = require("mongoose");

module.exports = () => {
  const MONGO_URI =
    process.env.MONGO_URI ||
    "mongodb+srv://er0711629_db_user:ashu12@cluster0.xb61asg.mongodb.net/fastaid?retryWrites=true&w=majority";

  mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => {
      console.error("MongoDB Connection Error:", err);
      process.exit(1);
    });
};



