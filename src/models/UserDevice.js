const mongoose = require("mongoose");
const UserDeviceSchema = new mongoose.Schema(
  {
    userId: String,
    deviceType: String,
    deviceToken: String,
    voipToken: String,
    notificationEnable: Boolean,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
 
);
module.exports = mongoose.model("user_device", UserDeviceSchema);
