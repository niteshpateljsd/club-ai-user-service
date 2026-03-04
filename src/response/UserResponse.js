// utils/userResponse.js
function buildUserResponse(user) {
  if (!user) return null;

  return {
    id: user._id,
    name: user.name || "",
    email: user.email || "",
    countryCode: user.countryCode || "",
    mobileNumber: user.mobileNumber || "",
    address: user.address || "",
    city: user.city || "",
    country: user.country || "",
    descriptions: user.descriptions || "",
    profileUrl: user.profileUrl || "",
    status: user.status,
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    latitude: user.latitude || 0,
    longitude: user.longitude || 0,
    profileCompleted: user.profileCompleted || false,
    descriptions: user.descriptions || "",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function buildOtherUserResponse(user, isFollowed) {
  if (!user) return null;

  return {
    id: user._id,
    name: user.name || "",
    email: user.email || "",
    countryCode: user.countryCode || "",
    mobileNumber: user.mobileNumber || "",
    address: user.address || "",
    city: user.city || "",
    country: user.country || "",
    descriptions: user.descriptions || "",
    profileUrl: user.profileUrl || "",
    status: user.status,
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    latitude: user.latitude || 0,
    longitude: user.longitude || 0,
    profileCompleted: user.profileCompleted || false,
    descriptions: user.descriptions || "",
    isFollowed: isFollowed,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function buildFullUserResponse(user, device = null) {
  if (!user) return null;

  return {
    id: user._id,
    name: user.name || "",
    email: user.email || "",
    countryCode: user.countryCode || "",
    mobileNumber: user.mobileNumber || "",
    address: user.address || "",
    city: user.city || "",
    country: user.country || "",
    profileUrl: user.profileUrl || "",
    status: user.status,
    followersCount: user.followersCount || 0,
    followingCount: user.followingCount || 0,
    latitude: user.latitude || 0,
    longitude: user.longitude || 0,
    profileCompleted: user.profileCompleted || false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    descriptions: user.descriptions || "",
    // 👇 Device info added directly
    deviceType: device ? device.deviceType : null,
    deviceToken: device ? device.deviceToken : null,
    voipToken: device? device.voipToken: null,
    notificationEnable: device ? device.notificationEnable : null,
  };
}

module.exports = {buildUserResponse,buildFullUserResponse,buildOtherUserResponse};

