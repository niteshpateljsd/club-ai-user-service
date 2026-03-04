const mongoose = require("mongoose");
const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    countryCode: String,
    mobileNumber: { type: String, required: true },
    address: String,
    city: String,
    country: String,
    profileUrl: String,
    descriptions: String,
    status: { type: Number, default: 0 },
    followersCount: {type: Number, default: 0},
    followingCount: {type: Number, default: 0},
    latitude: {type: Number, default: 0.0},
    longitude: {type: Number, default: 0.0},
    profileCompleted: Boolean,
    agoraUserId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
    
  },
 
);
module.exports = mongoose.model("user", UserSchema);
