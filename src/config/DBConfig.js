const mongoose = require("mongoose");
module.exports = async function connectDB() {
  const uri = process.env.MONGO_URL || "mongodb+srv://club_manager_ai:n2YqMUqg8yjP2cEH@clubmanagerai.zvy9qpq.mongodb.net/?appName=clubmanagerai";
  await mongoose.connect(uri);
  console.log("UserService Mongo connected");
};
