const mongoose = require("mongoose");
module.exports = async function connectDB() {
  const uri = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/club_manager_ai";
  await mongoose.connect(uri);
  console.log("UserService Mongo connected");
};
