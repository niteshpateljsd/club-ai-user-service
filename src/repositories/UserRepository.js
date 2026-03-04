const User = require("../models/User");
const mongoose = require("mongoose");

async function createUser(data) {
  return await User.create(data);
}
async function findByCountryCodeAndMobileNumber(countryCode,mobileNumber) {
  return await User.findOne({ countryCode: countryCode, mobileNumber: mobileNumber });
}
async function findById(id) {
  return await User.findById(id);
}

async function findByIds(ids) {
  // Convert only valid ids, skip invalid ones
  const objectIds = ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  return User.find({ _id: { $in: objectIds } });
}
async function updateUser(id, updateData) {
  return await User.findByIdAndUpdate(
    id,
    { ...updateData, updatedAt: new Date() },
    { new: true }
  );
}
async function findAllUsers(query, skip, pageSize) {
  try {
    // Ensure skip and limit are numbers
  

    const users = await User.find(query)
      .sort({ createdAt: -1 }) // DESC order
      .skip(skip)
      .limit(pageSize);

    return users;
  } catch (error) {
    throw new Error("Error fetching users: " + error.message);
  }
}
async function countDocuments(query){
   return await User.countDocuments(query);
}

async function getUserCountByCountryAndStatus() {
  return User.aggregate([
    {
      $group: {
        _id: {
          country: { $ifNull: ["$country", "Unknown"] },
          status: "$status",
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.country",
        stats: {
          $push: {
            status: "$_id.status",
            count: "$count",
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        country: "$_id",
        activeCount: {
          $sum: {
            $map: {
              input: "$stats",
              as: "s",
              in: {
                $cond: [{ $eq: ["$$s.status", 1] }, "$$s.count", 0],
              },
            },
          },
        },
        inactiveCount: {
          $sum: {
            $map: {
              input: "$stats",
              as: "s",
              in: {
                $cond: [{ $eq: ["$$s.status", 2] }, "$$s.count", 0],
              },
            },
          },
        },
      },
    },
    {
      $addFields: {
        totalUsers: { $add: ["$activeCount", "$inactiveCount"] },
        activePercentage: {
          $cond: [
            { $eq: [{ $add: ["$activeCount", "$inactiveCount"] }, 0] },
            0,
            {
              $multiply: [
                {
                  $divide: [
                    "$activeCount",
                    { $add: ["$activeCount", "$inactiveCount"] },
                  ],
                },
                100,
              ],
            },
          ],
        },
      },
    },
    {
      $project: {
        country: 1,
        activeCount: 1,
        inactiveCount: 1,
        totalUsers: 1,
        activePercentage: { $round: ["$activePercentage", 2] },
      },
    },
    {
      $sort: { totalUsers: -1 },
    },
  ]);
}

// async function getUserCountryDistribution() {
//   return User.aggregate([
//     // 1️⃣ Group by country → total users
//     {
//       $group: {
//         _id: { $ifNull: ["$country", "Unknown"] },
//         countryUsers: { $sum: 1 },
//       },
//     },

//     // 2️⃣ Calculate global total using window function
//     {
//       $setWindowFields: {
//         output: {
//           globalTotal: {
//             $sum: "$countryUsers",
//             window: {},
//           },
//         },
//       },
//     },

//     // 3️⃣ Calculate percentage
//     {
//       $project: {
//         _id: 0,
//         country: "$_id",
//         totalUsers: "$countryUsers",
//         percentage: {
//           $round: [
//             {
//               $multiply: [
//                 { $divide: ["$countryUsers", "$globalTotal"] },
//                 100,
//               ],
//             },
//             2,
//           ],
//         },
//         globalTotal: 1,
//       },
//     },

//     // 4️⃣ Sort by highest users
//     {
//       $sort: { totalUsers: -1 },
//     },
//   ]);
// }

async function getUserCountryDistribution() {
  return User.aggregate([
    // 1️⃣ Group by country
    {
      $group: {
        _id: { $ifNull: ["$country", "Unknown"] },

        totalUsers: { $sum: 1 },

        activeUsers: {
          $sum: {
            $cond: [{ $eq: ["$status", 1] }, 1, 0],
          },
        },

        inactiveUsers: {
          $sum: {
            $cond: [{ $eq: ["$status", 2] }, 1, 0],
          },
        },
      },
    },

    // 2️⃣ Global total users (window function)
    {
      $setWindowFields: {
        output: {
          globalTotal: {
            $sum: "$totalUsers",
            window: {},
          },
        },
      },
    },

    // 3️⃣ Calculate percentage
    {
      $project: {
        _id: 0,
        country: "$_id",
        totalUsers: 1,
        activeUsers: 1,
        inactiveUsers: 1,
        percentage: {
          $round: [
            {
              $multiply: [
                { $divide: ["$totalUsers", "$globalTotal"] },
                100,
              ],
            },
            2,
          ],
        },
        globalTotal: 1,
      },
    },

    // 4️⃣ Sort by highest users
    {
      $sort: { totalUsers: -1 },
    },
  ]);
}






module.exports = { createUser, findByCountryCodeAndMobileNumber,
   findById,findByIds, updateUser, findAllUsers,countDocuments,
  getUserCountByCountryAndStatus, getUserCountryDistribution };
