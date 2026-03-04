const userService = require("../services/UserService");
const buildResponse = require("../utils/Response");
const fileUtil = require("../utils/FileUtil");
const logger = require("../utils/logger");
const userResponse = require("../response/UserResponse");
const userRepo = require("../repositories/UserRepository");
const axios = require("axios");
const uploadToS3 = require("../utils/uploadToS3");

// 🔹 Update Profile
exports.updateProfile = async (req, res) => {
  const { id, ...updates } = req.body;
  const file = req.file; // ✅ multer attaches uploaded file here

  logger.info(`📝 updateProfile called for userId=${id}`, {
    updates,
    hasFile: !!file,
    fileName: file ? file.originalname : null,
    fileSize: file ? file.size : null,
  });

  try {
    const result = await userService.updateProfile(id, updates, file);

    logger.info(`✅ Profile updated successfully for userId=${id}`, {
      responseCode: result.responseCode,
    });

    res.status(200).json(result);
  } catch (err) {
    logger.error(`❌ Failed to update profile for userId=${id}`, {
      error: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      responseCode: 500,
      responseMessage: "Internal server error",
    });
  }
};


// 🔹 Request OTP
exports.requestOtp = async (req, res) => {
  const { mobileNumber, countryCode } = req.body || {};
  if (!mobileNumber || !countryCode) {
    return res.status(200).json(buildResponse(400, "mobileNumber and countryCode required", null));
  }
  const result = await userService.requestOtp(countryCode, mobileNumber);
  res.status(200).json(result);
};

// 🔹 Verify OTP
exports.verifyOtp = async (req, res) => {
  const { mobileNumber, countryCode, otp, deviceType, deviceToken, voipToken } = req.body || {};
  if (!mobileNumber || !countryCode || !otp) {
    return res.status(200).json(buildResponse(400, "mobileNumber, countryCode and otp required", null));
  }
  const result = await userService.verifyOtp(countryCode, mobileNumber, otp,deviceType, deviceToken, voipToken);
  res.status(200).json(result);
};


exports.blockUnblockUser = async (req, res) => {
  try {
    const { id, status, remark } = req.body;
    const updatedUser = await userService.blockUnblockUser(id, status, remark);
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🔹 Me
exports.getProfile = async (req, res) => {
  const { id } = req.query; // 👈 get id from query param
  console.log(`📥 Incoming request: getProfile with id=${id}`);

  try {
    const result = await userService.getProfile(id);
    console.log(`✅ getProfile success:`, result);

    res.status(200).json(result);
  } catch (error) {
    console.error(`❌ getProfile failed for id=${id}:`, error.message);

    res.status(500).json({
      responseCode: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.logout = async (req, res) => {
  const { token } = req.query; // 👈 get id from query param
  console.log(`📥 Incoming request: logout with token=${token}`);

  try {
    const result = await userService.logout(token);
    console.log(`✅ Logout success:`, result);

    res.status(200).json(result);
  } catch (error) {
    console.error(`❌ Logout failed for id=${token}:`, error.message);

    res.status(500).json({
      responseCode: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getUserCountGraph = async (req, res) => {
  const { filterType } = req.query; // 👈 get id from query param
  console.log(`📥 Incoming request: getUserCountGraph with filterType=${filterType}`);

  try {
    const result = await userService.getUserCountGraph(filterType);
    console.log(`✅ getUserCountGraph success:`, result);

    res.status(200).json(result);
  } catch (error) {
    console.error(`❌ getUserCountGraph failed for id=${filterType}:`, error.message);

    res.status(500).json({
      responseCode: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getUserStatsByCountry = async (req, res) => {
  const response = await userService.getUserStatsByCountry();
  res.status(200).json(response);
};
exports.getTotalUserCount = async (req, res) => {
  const response = await userService.getTotalUserCount();
  res.status(200).json(response);
};


exports.viewUserProfile = async (req, res) => {
  const { loginUserId, userId } = req.query;
  const SOCIAL_SERVICE_URL = process.env.SOCIAL_SERVICE_URL || "http://localhost:4004";

  logger.info(`📄 viewUserProfile called | loginUserId=${loginUserId}, userId=${userId}`);

  try {
    // 1️⃣ Get user info from DB
    const user = await userRepo.findById(userId);
    if (!user) {
      return res.status(404).json(buildResponse(404, "User not found", null));
    }

    // 2️⃣ Check follow status from social-service
    let isFollowed = false;

    try {
      const response = await axios.get(`${SOCIAL_SERVICE_URL}/social/follow/status`, {
        params: { followerId: loginUserId, followingId: userId },
        timeout: 5000,
      });

      if (response?.data?.responseBody?.isFollowed !== undefined) {
        isFollowed = response.data.responseBody.isFollowed;
        logger.info("✅ Follow status fetched successfully", { loginUserId, userId, isFollowed });
      } else {
        logger.warn("⚠️ Unexpected follow status response format", { data: response.data });
      }
    } catch (err) {
      logger.warn("⚠️ Failed to fetch follow status from social-service", {
        error: err.message,
        url: `${SOCIAL_SERVICE_URL}/social/follow/status`,
        params: { followerId: loginUserId, followingId: userId },
      });
    }

    // 3️⃣ Build response with follow status
    const profileResponse = userResponse.buildOtherUserResponse(user, isFollowed);

    return res.status(200).json(
      buildResponse(200, "Profile fetched successfully", profileResponse)
    );

  } catch (error) {
    logger.error("❌ viewUserProfile failed", { error });
    return res.status(500).json(buildResponse(500, "Internal Server Error", null));
  }
};


exports.bulkGetProfiles = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(200).json({ error: "ids must be a non-empty array" });
    }

    const profiles = await userService.getProfileByIds(ids);
    res.json(profiles);
  } catch (error) {
    console.error("Error fetching profiles:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};



exports.getAllUsers = async (req, res) => {
  try {
    // Safely extract from query or body depending on how you're sending them
    const {
      pageIndex = 0,
      pageSize = 10,
      status,
      searchText,
    } = req.query || req.body || {};

    // Parse numeric values safely
    const parsedPageIndex = Number.isInteger(parseInt(pageIndex)) ? parseInt(pageIndex, 10) : 0;
    const parsedPageSize = Number.isInteger(parseInt(pageSize)) ? parseInt(pageSize, 10) : 10;

    // Only trim searchText if it's a string
    const trimmedSearchText = typeof searchText === "string" ? searchText.trim() : "";

    // Pass parameters safely to service
    const result = await userService.getAllUsers({
      pageIndex: parsedPageIndex,
      pageSize: parsedPageSize,
      status,
      searchText: trimmedSearchText,
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error("getAllUsers controller error", { error });
    return res.status(500).json(buildResponse(500, "Internal server error", null));
  }
};

exports.getAllUserSessions = async (req, res) => {
  try {
    // Safely extract from query or body depending on how you're sending them
    const {
      pageIndex = 0,
      pageSize = 10,
      searchText,
    } = req.query || req.body || {};

    // Parse numeric values safely
    const parsedPageIndex = Number.isInteger(parseInt(pageIndex)) ? parseInt(pageIndex, 10) : 0;
    const parsedPageSize = Number.isInteger(parseInt(pageSize)) ? parseInt(pageSize, 10) : 10;

    // Only trim searchText if it's a string
    const trimmedSearchText = typeof searchText === "string" ? searchText.trim() : "";

    // Pass parameters safely to service
    const result = await userService.getAllUserSessions({
      pageIndex: parsedPageIndex,
      pageSize: parsedPageSize,
      searchText: trimmedSearchText,
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error("getAllUserSessions controller error", { error });
    return res.status(200).json(buildResponse(500, "Internal server error", null));
  }
};



// 🔹 Upload Profile
// exports.uploadProfile = async (req, res) => {
//   const result = await userService.uploadProfile( req.file);
//   res.status(200).json(result);
// };

// // 🔹 Upload Profile
// exports.uploadMultipleFiles = async (req, res) => {
//   const result = await userService.uploadMultipleFiles( req.files);
//   res.status(200).json(result);
// };

exports.uploadFile = async(req, res)=> {
  try {
    const file = req.file;

    if (!file) {
      return res.status(200).json(buildResponse(400, "No file provided", null));
    }

    //const url = await fileUtil.uploadFile(file);

    const url = await uploadToS3(file);
    return res.status(200).json(buildResponse(200, "File upload successful", url));
  } catch (err) {
    console.error("uploadFile error:", err);
    return res
      .status(500)
      .json(buildResponse(500, "Server error", null));
  }
};



exports.uploadMultipleFiles = async (req, res) => {
  try {
    const files = req.files; // Multer puts multiple files in req.files

    if (!files || files.length === 0) {
      return res
        .status(400)
        .json(buildResponse(400, "No files provided", null));
    }

    // Upload each file using fileUtil
    const urls = [];
    for (const file of files) {
      const url = await fileUtil.uploadFile(file);
      urls.push(url);
    }

    return res
      .status(200)
      .json(buildResponse(200, "Files uploaded successfully", urls));
  } catch (err) {
    console.error("uploadFiles error:", err);
    return res
      .status(500)
      .json(buildResponse(500, "Server error", null));
  }
};
