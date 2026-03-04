const userRepo = require("../repositories/UserRepository");
const userDeviceRepo = require("../repositories/UserDeviceRepository");
const redis = require("../config/RedisConfig");
const jwtUtil = require("../utils/JwtUtil");
const fileUtil = require("../utils/FileUtil");
const buildResponse = require("../utils/Response");
const userResponse = require("../response/UserResponse");
const logger = require("../utils/logger");
const User = require("../models/User");
const UserDevice = require("../models/UserDevice");
const userCacheService = require("../redis/UserCacheService");
const uploadToS3 = require("../utils/uploadToS3");
const userSessionRepo = require("../repositories/UserSessionRepository");
const SESSION_EVENTS = require("../constants/SessionEvents");
const UserSession = require("../models/UserSession");



// 🟢 Update profile
async function updateProfile(id, updates,file) {
  try {
    logger.info(`updateProfile: userId=${id}`);

    let profileUrl;

    if (file) {
      try {
        // profileUrl = await fileUtil.uploadFile(file);
        profileUrl = await uploadToS3(file);
         logger.info(`📸 Uploaded media file: ${profileUrl}`);
        
      } catch (err) {
        logger.error("❌ Failed to upload media file", {
          error: err.message,
        });
      }
    }
    
    // Ensure profileCompleted is always true internally
    const safeUpdates = {
      ...updates,
      profileUrl,
      profileCompleted: true
    };

    const updated = await userRepo.updateUser(id, safeUpdates);

    if (!updated) {
      logger.warn(`updateProfile: User not found id=${id}`);
      return buildResponse(404, "User not found", null);
    }
    const user = userResponse.buildUserResponse(updated);

        // 👇 Get latest device by userId
    const device = await UserDevice.findOne({ id }).sort({ createdAt: -1 });

    // Build response 
    const response = userResponse.buildFullUserResponse(user, device);
    //await publishUserEvent("USER_UPDATED", response);
     await userCacheService.cacheUser(response);
    return buildResponse(200, "User profile updated successfully",user );
  } catch (err) {
    logger.error(`updateProfile error: ${err.message}`);
    return buildResponse(500, err.message, null);
  }
}


async function requestOtp(countryCode, mobileNumber) {
  logger.info(`requestOtp for ${countryCode}${mobileNumber}`);

    // 1️⃣ Check if user already exists
  const user = await User.findOne({ countryCode, mobileNumber });

  if (user) {
    // 2️⃣ If user inactive (status = 2)
    if (user.status === 2) {
      return buildResponse(
        403,
        "Your account is inactive. Please contact administrator.",
        null
      );
    }
  }
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  await redis.set(`otp:${countryCode}${mobileNumber}`, otp, "EX", 60 * 5);

  if (process.env.NODE_ENV !== "production") {
    logger.info(`[DEV OTP] ${countryCode}${mobileNumber} -> ${otp}`);
  }

  return buildResponse(200, "OTP sent successfully", otp);
}

// 🟢 Verify OTP
async function verifyOtp(countryCode, mobileNumber, otp, deviceType, deviceToken, voipToken) {
  const key = `otp:${countryCode}${mobileNumber}`;
  logger.info(`verifyOtp started for ${key}`);

  try {
    // 🔹 Get OTP from Redis
    const stored = await redis.get(key);
    if (!stored || stored !== otp) {
      logger.warn(`verifyOtp: invalid or expired OTP for ${key}`);
      await userSessionRepo.createSession({
        eventType: SESSION_EVENTS.LOGIN_FAILED.type,
        description: SESSION_EVENTS.LOGIN_FAILED.desc,
        deviceType,
        deviceToken,
      });
      return buildResponse(401, "Invalid or expired OTP", null);
    }

    // 🔹 Create or get user
    const user = await createOrGetByMobile(countryCode, mobileNumber);
    logger.info(`User retrieved/created: ${user._id}`);

    // 🔹 Delete OTP from Redis
    await redis.del(key);
    logger.info(`OTP deleted from Redis for ${key}`);

    // 🔹 Generate JWT token
    const token = jwtUtil.generate({
      sub: String(user._id),
      mobileNumber: user.mobileNumber,
      countryCode: user.countryCode,
    });
    logger.info(`JWT token generated for user ${user._id}`);

    try{
        await userSessionRepo.createSession({
          userId: user._id,
          deviceType,
          deviceToken,
          sessionToken: token,
          loginAt: new Date(),
          isActive: true,
          eventType: SESSION_EVENTS.LOGIN_SUCCESS.type,
          description: SESSION_EVENTS.LOGIN_SUCCESS.desc,
        });

    }catch(err){
        logger.info(`Error occurs on user session creation ${err}`);
    }
    // 🔹 Update or create user device
    try {
      const userId = user._id;
      let userDeviceData = { userId, deviceType, deviceToken, voipToken };

      // Check if device exists
      const existingDevice = await userDeviceRepo.findByUserId(userId);
      if (existingDevice) {
        logger.info(`Existing device found for user ${userId}, updating device`);
        userDeviceData.id = existingDevice._id;
      } else {
        logger.info(`No existing device found for user ${userId}, creating new device`);
      }

      
      const updatedDevice = await userDeviceRepo.createUserDevice(userDeviceData);
      const response = userResponse.buildFullUserResponse(user, updatedDevice);
      if(user.profileCompleted){
        await userCacheService.cacheUser(response);
      }
      //await publishUserEvent("USER_UPDATED", response);
    
      //console.log(`✅ Cached user ${event.data.id} in Redis`);
      logger.info(`User device updated/created: ${updatedDevice._id}`);
    } catch (deviceErr) {
      logger.error(`Exception occurred while updating device token for user ${user._id}: ${deviceErr.message}`, deviceErr);
    }

    // 🔹 Return success response
    return buildResponse(200, "OTP verified successfully", {
      accessToken: token,
      user: userResponse.buildUserResponse(user),
    });

  } catch (err) {
    logger.error(`verifyOtp failed for ${key}: ${err.message}`, err);
    return buildResponse(500, "Internal server error", null);
  }
}

async function logout(token) {
  logger.info("Logout initiated", { token });

  try {
    // 🔹 Close active session using token
    const session = await userSessionRepo.closeSessionByToken(token);

    if (!session) {
      logger.warn("Logout attempted with invalid or expired session token", {
        token,
      });
      return buildResponse(401, "Invalid or expired session", null);
    }

    logger.info("Active session found for logout", {
      sessionId: session._id,
      userId: session.userId,
    });

    // 🔹 Update session audit info
    session.eventType = "LOGOUT";
    session.description = "User logout successfully";
    session.logoutAt = new Date();
    session.isActive = false;
    await session.save();

    logger.info("User session closed successfully", {
      sessionId: session._id,
      logoutAt: session.logoutAt,
    });

    // 🔹 Remove user device token
    try {
      logger.info("Attempting to delete user device tokens", {
        userId: session.userId,
      });

      await userDeviceRepo.deleteByUserId(session.userId);

      logger.info("User device tokens deleted successfully", {
        userId: session.userId,
      });
    } catch (deviceErr) {
      logger.error("Failed to delete device tokens during logout", {
        userId: session.userId,
        error: deviceErr.message,
      });
    }

    logger.info("Logout completed successfully", {
      userId: session.userId,
    });

    return buildResponse(200, "Logout successful", null);
  } catch (err) {
    logger.error("Logout failed due to server error", {
      token,
      error: err.message,
      stack: err.stack,
    });
    return buildResponse(500, "Logout failed", null);
  }
}



// 🟢 Create or get user by mobile
async function createOrGetByMobile(countryCode, mobileNumber) {
  logger.info(`createOrGetByMobile: ${countryCode}${mobileNumber}`);
  let user = await userRepo.findByCountryCodeAndMobileNumber(countryCode, mobileNumber);
  if (!user) {
    logger.info("User not found, creating new");
    user = await userRepo.createUser({
      countryCode,
      mobileNumber,
      status: 1,
      followersCount: 0,
      followingCount: 0,
      profileCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return user;
}

// ✅ Block/Unblock/Delete User
async function blockUnblockUser(id, status, remark) {
  try {
    logger.info(`📝 blockUnblockUser called for ID: ${id} with status: ${status}`);

    const user = await User.findById(id);
    if (!user) {
      logger.warn(`⚠️ User not found with ID: ${id}`);
      return buildResponse(404, "Record not found.");
    }

    // Check current status
    if (user.status === status) {
      if (status === 1) {
        logger.info(`ℹ️ User ${id} already active`);
        return buildResponse(400, "User already active.");
      }
      if (status === 2) {
        logger.info(`ℹ️ User ${id} already inactive`);
        return buildResponse(400, "User already inactive");
      }
    }

    // Update status
    const oldStatus = user.status;
    user.status = status;
    if(status!=3){
      await user.save();
    }
    
    logger.info(`✅ User ${id} status changed from ${oldStatus} to ${status}`);

    let message = "Invalid Request.";
    if (status === 0) message = "User deleted successfully.";
    if (status === 1) {
      message = "User activated successfully.";
    }
    if (status === 2){ 
      message = "User deactivated successfully.";
    }
    if (status === 3) {
      
      message = "User Warn successfully."
    };

    logger.info(`ℹ️ Response message for user ${id}: ${message}`);
    return buildResponse(200, message, userResponse.buildUserResponse(user));
  } catch (err) {
    logger.error(`❌ Error in blockUnblockUser for ID ${id}: ${err.stack || err.message}`);
    return buildResponse(500, "Internal Server Error!!", null);
  }
}


// 🟢 Get profile
async function getProfile(id) {
   
  logger.info(`getProfile: id=${id}`);
  try{
    const user = await userRepo.findById(id);
    if(user){
        return buildResponse(200, "Record found successfully", userResponse.buildUserResponse(user));
    }else{
      return buildResponse(404, "Record not found", null);
    }
  }catch(error){
    logger.error('Inter server error ',{error});
    return buildResponse(500, "Server Error", null);
  }
   
}

async function getProfileByIds(ids) {
  logger.info(`getProfileByIds: ids=${JSON.stringify(ids)}`);
  try {
    const users = await userRepo.findByIds(ids);

    if (users && users.length > 0) {
      return buildResponse(
        200,
        "Records found successfully",
        users.map((u) => userResponse.buildUserResponse(u))
      );
    } else {
      return buildResponse(404, "No records found", []);
    }
  } catch (error) {
    logger.error("Internal server error in getProfileByIds", {
      message: error.message,
      stack: error.stack,
    });
    return buildResponse(500, "Server Error", null);
  }
}



// async function getAllUsers({ pageIndex = 0, pageSize = 10, status, searchText = "" }) {
  
//   //logger.info(`getAllUsers: pageIndex=${pageIndex}, pageSize=${pageSize}, searchText=${searchText}`);
//   try {
//     let query = {
//     status: { $in: [DataConstant.SHORT_ONE, DataConstant.SHORT_TWO] },
//     };

//     // Convert status to integer if it’s a string
//     if (status !== undefined && status !== null && status !== "") {
//       const parsedStatus = parseInt(status, 10);
//       if (!isNaN(parsedStatus)) {
//         query.status = parsedStatus;
//       }
//     }

//     const skip = pageIndex * pageSize;
//     const users = await userRepo.findAllUsers(query,skip,pageSize);

//     if(!users){
//       return buildResponse(404, "Records not found",null);
//     }
//     const totalRecords = await userRepo.countDocuments(query);
    
//     return buildResponse(200, "Records fetched successfully", {
//       users: users.map(userResponse.buildUserResponse),
//       pagination: {
//         pageIndex,
//         pageSize,
//         totalRecords,
//         totalPages: Math.ceil(totalRecords / pageSize)
//       }
//     });
//   } catch (error) {
//     logger.error("getAllUsers service error", { error });
//     return buildResponse(500, "Internal server error", null);
//   }
// }


// 🟢 Request OTP

async function getAllUsers({ pageIndex = 0, pageSize = 10, status, searchText = "" }) {
  try {
    let query = { profileCompleted: true };

    // Base status condition (default)
    query.status = { $in: [1, 2] };

    // If status is provided, handle it properly
    if (status !== undefined && status !== null && status !== "") {
      let parsedStatus;

      // If multiple statuses are provided (e.g. "1,2,3")
      if (typeof status === "string" && status.includes(",")) {
        parsedStatus = status
          .split(",")
          .map(s => parseInt(s.trim(), 10))
          .filter(s => !isNaN(s));
        if (parsedStatus.length > 0) {
          query.status = { $in: parsedStatus };
        }
      } else {
        // Single status value
        const singleStatus = parseInt(status, 10);
        if (!isNaN(singleStatus)) {
          query.status = singleStatus;
        }
      }
    }

    // Optional search filter (for example: name or email)
    if (searchText && searchText.trim() !== "") {
      query.$or = [
        { name: { $regex: searchText, $options: "i" } },
        { email: { $regex: searchText, $options: "i" } },
        { mobileNumber: { $regex: searchText, $options: "i" } },
      ];
    }

    const skip = pageIndex * pageSize;
    const users = await userRepo.findAllUsers(query, skip, pageSize);
    const total = await userRepo.countDocuments(query);

    const activeQuery = { status: 1, profileCompleted: true }
    const totalActive  = await User.countDocuments(activeQuery);

    const inactiveQuery = { status: 2, profileCompleted: true }
    const totalInActive  = await User.countDocuments(inactiveQuery);
    if (!users || users.length === 0) {
      return buildResponse(404, "Records not found", null);
    }

    return buildResponse(200, "Records fetched successfully", {
      content: users.map(userResponse.buildUserResponse),
      pageIndex,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      isLast: pageIndex + 1 >= total,
      hasNext: pageIndex + 1 < total,
      hasPrevious: pageIndex > 0,
      totalActive,
      totalInActive

    });
  } catch (error) {
    logger.error("getAllUsers service error", { error });
    return buildResponse(500, "Internal server error", null);
  }
}


/**
 * Get all user sessions with pagination & filters
 */
async function getAllUserSessions({
  pageIndex = 0,
  pageSize = 10,
  searchText = "",
}) {
  try {
    let sessionQuery = {};

    const skip = pageIndex * pageSize;

    // 🔹 Aggregate to merge User + Session
    const sessions = await UserSession.aggregate([
      { $match: sessionQuery },

      // Join user data
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },

      // 🔹 Optional search
      ...(searchText
        ? [
            {
              $match: {
                $or: [
                  { "user.name": { $regex: searchText, $options: "i" } },
                  { "user.email": { $regex: searchText, $options: "i" } },
                  {
                    "user.mobileNumber": {
                      $regex: searchText,
                      $options: "i",
                    },
                  },
                ],
              },
            },
          ]
        : []),

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: pageSize },

      // 🔹 Shape response
      {
        $project: {
          _id: 0,
          sessionId: "$_id",
          eventType: 1,
          description: 1,
          isActive: 1,
          loginAt: {
            $dateToString: {
              format: "%d-%m-%Y %H:%M:%S",
              date: "$loginAt",
            },
          },
          logoutAt: {
            $cond: [
              { $ifNull: ["$logoutAt", false] },
              {
                $dateToString: {
                  format: "%d-%m-%Y %H:%M:%S",
                  date: "$logoutAt",
                },
              },
              null,
            ],
          },
          deviceType: 1,
          ipAddress: 1,

          user: {
            id: "$user._id",
            name: "$user.name",
            email: "$user.email",
            mobileNumber: "$user.mobileNumber",
            countryCode: "$user.countryCode",
            profileUrl: "$user.profileUrl",
            status: "$user.status",
          },
        },
      },
    ]);

    // 🔹 Count total
    const total = await UserSession.countDocuments(sessionQuery);

    // 🔹 Stats
    const totalLoginSuccess = await UserSession.countDocuments({
      eventType: "LOGIN_SUCCESS",
    });

    const totalLoginFailed = await UserSession.countDocuments({
      eventType: "LOGIN_FAILED",
    });

    const totalActiveSessions = await UserSession.countDocuments({
      isActive: true,
    });

    if (!sessions || sessions.length === 0) {
      return buildResponse(404, "Records not found", null);
    }

    return buildResponse(200, "Records fetched successfully", {
      content: sessions,
      pageIndex,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      isLast: pageIndex + 1 >= Math.ceil(total / pageSize),
      hasNext: pageIndex + 1 < Math.ceil(total / pageSize),
      hasPrevious: pageIndex > 0,

      // 🔹 Session stats
      totalLoginSuccess,
      totalLoginFailed,
      totalActiveSessions,
    });
  } catch (error) {
    logger.error("getAllUserSessions service error", { error });
    return buildResponse(500, "Internal server error", null);
  }
}




// 🟢 Upload profile pic
async function uploadProfile(file) {
  try {
    if (!file) {
      logger.warn("uploadProfile: file missing");
      return buildResponse(400, "File required", null);
    }

    const base = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 4002}`;
    const url = `${base}/uploads/${file.filename}`;

    logger.info(`uploadProfile: file uploaded successfully filename=${file.filename}`);

    return buildResponse(201, "File uploaded successfully", {
      url,
      filename: file.filename,
    });
  } catch (err) {
    logger.error(`uploadProfile error: ${err.message}`);
    return buildResponse(500, "Internal server error", null);
  }
}

async function uploadMultipleFiles(files) {
  try {
    if (!files || files.length === 0) {
      logger.warn("uploadMultipleFiles: no files provided");
      return buildResponse(400, "At least one file required", null);
    }

    const base = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 4002}`;

    // Build URLs for each uploaded file
    const uploadedFiles = files.map((file) => ({
      url: `${base}/uploads/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    }));

    logger.info(`uploadMultipleFiles: ${files.length} files uploaded successfully`);

    return buildResponse(201, "Files uploaded successfully", uploadedFiles);
  } catch (err) {
    logger.error(`uploadMultipleFiles error: ${err.message}`);
    return buildResponse(500, "Internal server error", null);
  }
}

const FilterType = {
  DAY: "DAY",
  MONTH: "MONTH",
  YEAR: "YEAR",
};

/**
 * Get user count grouped by DAY / MONTH / YEAR
 */
// async function getUserCountGraph(filterType) {
//   const resultList = [];
//   let dateFormat;

//   switch (filterType) {
//     case FilterType.DAY:
//       dateFormat = "%d-%m-%Y";
//       break;
//     case FilterType.MONTH:
//       dateFormat = "%m";
//       break;
//     case FilterType.YEAR:
//       dateFormat = "%Y";
//       break;
//     default:
//       //throw new Error("Invalid filter type");
//       return buildResponse(404, "Invalid filter type", null);
//   }

//   const pipeline = [];

//   const now = new Date();

// /**
//  * 📅 DAY → current month
//  */
// if (filterType === FilterType.DAY) {
//   const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
//   const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

//   pipeline.push({
//     $match: {
//       createdAt: {
//         $gte: startOfMonth,
//         $lt: endOfMonth,
//       },
//     },
//   });
// }

// /**
//  * 📅 MONTH → current year
//  */
// if (filterType === FilterType.MONTH) {
//   const startOfYear = new Date(now.getFullYear(), 0, 1);
//   const endOfYear = new Date(now.getFullYear() + 1, 0, 1);

//   pipeline.push({
//     $match: {
//       createdAt: {
//         $gte: startOfYear,
//         $lt: endOfYear,
//       },
//     },
//   });
// }

// /**
//  * 📅 YEAR → current year ONLY
//  */
// if (filterType === FilterType.YEAR) {
//   const startOfYear = new Date(now.getFullYear(), 0, 1);
//   const endOfYear = new Date(now.getFullYear() + 1, 0, 1);

//   pipeline.push({
//     $match: {
//       createdAt: {
//         $gte: startOfYear,
//         $lt: endOfYear,
//       },
//     },
//   });
// }



//   // 🔹 Project date + status
//   pipeline.push({
//     $project: {
//       date: {
//         $dateToString: {
//           format: dateFormat,
//           date: "$createdAt",
//         },
//       },
//       status: 1,
//     },
//   });

//   // 🔹 Group
//   // pipeline.push({
//   //   $group: {
//   //     _id: "$date",
//   //     count: { $sum: 1 },
//   //     active: {
//   //       $sum: {
//   //         $cond: [{ $eq: ["$status", 1] }, 1, 0],
//   //       },
//   //     },
//   //   },
//   // });

//   pipeline.push({
//   $group: {
//     _id: "$date",
//     count: { $sum: 1 },
//     active: {
//       $sum: {
//         $cond: [{ $eq: ["$status", 1] }, 1, 0],
//       },
//     },
//     inactive: {
//       $sum: {
//         $cond: [{ $eq: ["$status", 2] }, 1, 0],
//       },
//     },
//   },
// });


//   // 🔹 Final projection
//   // pipeline.push({
//   //   $project: {
//   //     _id: 0,
//   //     date: "$_id",
//   //     count: 1,
//   //     active: 1,
//   //   },
//   // });

//   pipeline.push({
//   $project: {
//     _id: 0,
//     date: "$_id",
//     count: 1,
//     active: 1,
//     inactive: 1,
//   },
// });


//   // 🔹 Sort
//   pipeline.push({
//     $sort: { date: 1 },
//   });

//   const results = await User.aggregate(pipeline).allowDiskUse(true);

//   /* =========================
//      POST PROCESSING
//      ========================= */

//   // 🔹 DAY → fill entire month
//   if (filterType === FilterType.DAY) {
//     const dayMap = new Map();
//     const now = new Date();
//     const year = now.getFullYear();
//     const month = now.getMonth() + 1;
//     const daysInMonth = new Date(year, month, 0).getDate();

//     for (let i = 1; i <= daysInMonth; i++) {
//       const day = `${String(i).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
//       dayMap.set(day, { date: day, count: 0, active: 0 });
//     }

//     for (const doc of results) {
//       if (dayMap.has(doc.date)) {
//         dayMap.set(doc.date, {
//           date: doc.date,
//           count: doc.count || 0,
//           active: doc.active || 0,
//         });
//       }
//     }

//     return Array.from(dayMap.values());
//   }

//   // 🔹 MONTH → fill all 12 months
//   if (filterType === FilterType.MONTH) {
//     const monthMap = new Map();
//     const year = new Date().getFullYear();

//     for (let i = 1; i <= 12; i++) {
//       const monthKey = String(i).padStart(2, "0");
//       const monthName = new Date(year, i - 1).toLocaleString("en-US", {
//         month: "long",
//       });

//       monthMap.set(monthKey, {
//         date: monthName,
//         count: 0,
//         active: 0,
//       });
//     }

//     for (const doc of results) {
//       if (monthMap.has(doc.date)) {
//         monthMap.set(doc.date, {
//           date: monthMap.get(doc.date).date,
//           count: doc.count || 0,
//           active: doc.active || 0,
//         });
//       }
//     }

 
    
//     return buildResponse(200, "Record Found!!", Array.from(monthMap.values()));
//   }

//   // 🔹 YEAR → direct mapping
//   for (const doc of results) {
//     resultList.push({
//       date: doc.date,
//       count: doc.count || 0,
//       active: doc.active || 0,
//     });
//   }

  
//   return buildResponse(200, "Record Found!!", resultList);
// }

async function getUserCountGraph(filterType) {
  const resultList = [];
  let dateFormat;

  switch (filterType) {
    case FilterType.DAY:
      dateFormat = "%d-%m-%Y";
      break;
    case FilterType.MONTH:
      dateFormat = "%m";
      break;
    case FilterType.YEAR:
      dateFormat = "%Y";
      break;
    default:
      return buildResponse(404, "Invalid filter type", null);
  }

  const pipeline = [];
  const now = new Date();

  /* =========================
     DATE RANGE FILTER
     ========================= */

  // 📅 DAY → current month
  if (filterType === FilterType.DAY) {
    pipeline.push({
      $match: {
        createdAt: {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        },
      },
    });
  }

  // 📅 MONTH & YEAR → current year
  if (filterType === FilterType.MONTH || filterType === FilterType.YEAR) {
    pipeline.push({
      $match: {
        createdAt: {
          $gte: new Date(now.getFullYear(), 0, 1),
          $lt: new Date(now.getFullYear() + 1, 0, 1),
        },
      },
    });
  }

  /* =========================
     PROJECT
     ========================= */
  pipeline.push({
    $project: {
      date: {
        $dateToString: {
          format: dateFormat,
          date: "$createdAt",
        },
      },
      status: 1,
    },
  });

  /* =========================
     GROUP
     ========================= */
  pipeline.push({
    $group: {
      _id: "$date",
      total: { $sum: 1 },
      active: {
        $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] },
      },
      inactive: {
        $sum: { $cond: [{ $eq: ["$status", 2] }, 1, 0] },
      },
    },
  });

  /* =========================
     FINAL PROJECTION
     ========================= */
  pipeline.push({
    $project: {
      _id: 0,
      date: "$_id",
      total: 1,
      active: 1,
      inactive: 1,
    },
  });

  pipeline.push({ $sort: { date: 1 } });

  const results = await User.aggregate(pipeline).allowDiskUse(true);

  /* =========================
     POST PROCESSING
     ========================= */

  // 🔹 DAY → fill full current month
  if (filterType === FilterType.DAY) {
    const dayMap = new Map();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
      const day = `${String(i).padStart(2, "0")}-${String(month).padStart(
        2,
        "0"
      )}-${year}`;

      dayMap.set(day, {
        date: day,
        total: 0,
        active: 0,
        inactive: 0,
      });
    }

    for (const doc of results) {
      if (dayMap.has(doc.date)) {
        dayMap.set(doc.date, {
          date: doc.date,
          total: doc.total || 0,
          active: doc.active || 0,
          inactive: doc.inactive || 0,
        });
      }
    }

    return buildResponse(200, "Record Found!!", Array.from(dayMap.values()));
  }

  // 🔹 MONTH → fill all 12 months
  if (filterType === FilterType.MONTH) {
    const monthMap = new Map();
    const year = now.getFullYear();

    for (let i = 1; i <= 12; i++) {
      const monthKey = String(i).padStart(2, "0");
      const monthName = new Date(year, i - 1).toLocaleString("en-US", {
        month: "long",
      });

      monthMap.set(monthKey, {
        date: monthName,
        total: 0,
        active: 0,
        inactive: 0,
      });
    }

    for (const doc of results) {
      if (monthMap.has(doc.date)) {
        const existing = monthMap.get(doc.date);
        monthMap.set(doc.date, {
          date: existing.date,
          total: doc.total || 0,
          active: doc.active || 0,
          inactive: doc.inactive || 0,
        });
      }
    }

    return buildResponse(200, "Record Found!!", Array.from(monthMap.values()));
  }

  // 🔹 YEAR → direct
  for (const doc of results) {
    resultList.push({
      date: doc.date,
      total: doc.total || 0,
      active: doc.active || 0,
      inactive: doc.inactive || 0,
    });
  }

  return buildResponse(200, "Record Found!!", resultList);
}



// async function getUserStatsByCountry() {
//   logger.info("getUserStatsByCountry called");

//   try {
//     const data = await userRepo.getUserCountryDistribution();

//     if (!data || data.length === 0) {
//       return buildResponse(404, "No user data found", null);
//     }

//     const totalUsers = data[0].globalTotal;

//     const countries = data.map(({ country, totalUsers, percentage }) => ({
//       country,
//       totalUsers,
//       percentage,
//     }));

//     return buildResponse(200, "User stats fetched successfully", {
//       totalUsers,
//       countries,
//     });
//   } catch (error) {
//     logger.error("❌ getUserStatsByCountry error", {
//       error: error.message,
//       stack: error.stack,
//     });
//     return buildResponse(500, "Internal server error", null);
//   }
// }

async function getUserStatsByCountry() {
  logger.info("getUserStatsByCountry called");

  try {
    const data = await userRepo.getUserCountryDistribution();

    if (!data || data.length === 0) {
      return buildResponse(404, "No user data found", null);
    }

    const totalUsers = data[0].globalTotal;

    const countries = data.map(
      ({ country, totalUsers, activeUsers, inactiveUsers, percentage }) => ({
        country,
        totalUsers,
        activeUsers,
        inactiveUsers,
        percentage,
      })
    );

    return buildResponse(200, "User stats fetched successfully", {
      totalUsers,
      countries,
    });
  } catch (error) {
    logger.error("❌ getUserStatsByCountry error", {
      error: error.message,
      stack: error.stack,
    });
    return buildResponse(500, "Internal server error", null);
  }
}

async function getTotalUserCount() {
  try {
    const totalUserCount = await User.countDocuments({
      status: { $ne: 0 },
    });

     return buildResponse(200, "Successfully fetched!!", totalUserCount);
    
  } catch (error) {
    logger.error("❌ Error fetching user count", {
      error: error.message
    });
    return buildResponse(500, "Internal Server Error!!", error.message);
  }
}


module.exports = {
  updateProfile,
  createOrGetByMobile,
  getProfile,
  getAllUsers,
  requestOtp,
  verifyOtp,
  uploadProfile,
  uploadMultipleFiles,
  blockUnblockUser,
  getProfileByIds,
  logout,
  getAllUserSessions,
  getUserCountGraph,
  getUserStatsByCountry,
  getTotalUserCount
};
