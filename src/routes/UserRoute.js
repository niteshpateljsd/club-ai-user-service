/**
 * @openapi
 * tags:
 *   - name: User Controller
 *     description: User management and authentication APIs
 */
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/UserController");
const jwtUtil = require("../utils/JwtUtil");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * Middleware for JWT authentication
 */
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwtUtil.verify(t);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * @openapi
 * /users/addProfile:
 *   post:
 *     tags: [User Controller]
 *     summary: Update user profile
 *     description: Update a user's profile details and optionally upload a profile image.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 description: User ID
 *                 example: "68b5b8897b6b770203a65996"
 *               name:
 *                 type: string
 *                 description: Full name of the user
 *                 example: "John Doe"
 *               latitude:
 *                 type: number
 *                 description: Street latitude of the user
 *                 example: "0.2121"
 *               longitude:
 *                 type: number
 *                 description: Street longitude of the user
 *                 example: "0.7171"
 *               city:
 *                 type: string
 *                 description: City name
 *                 example: "Mumbai"
 *               country:
 *                 type: string
 *                 description: Country name
 *                 example: "India"
 *               descriptions:
 *                 type: string
 *                 description: Describe yourself
 *                 example: "I have best camel."
 *               profileFile:
 *                 type: string
 *                 format: binary
 *                 description: Profile image file to upload
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *       400:
 *         description: Bad request (validation error or missing fields)
 *       500:
 *         description: Internal server error
 */
router.post("/addProfile", upload.single("profileFile"), ctrl.updateProfile);

/**
 * @openapi
 * /users/requestOtp:
 *   post:
 *     tags: [User Controller]
 *     summary: Request OTP for login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mobileNumber:
 *                 type: string
 *                 example: "1234567890"
 *               countryCode:
 *                 type: string
 *                 example: "+91"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Invalid request
 */
router.post("/requestOtp", ctrl.requestOtp);

/**
 * @openapi
 * /users/verifyOtp:
 *   post:
 *     tags: [User Controller]
 *     summary: Verify OTP and login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               countryCode:
 *                 type: string
 *                 example: "+91"
 *               mobileNumber:
 *                 type: string
 *                 example: "1234567890"
 *               otp:
 *                 type: string
 *                 example: "1234"
 *               deviceType:
 *                 type: string
 *                 example: "android/ios"
 *               deviceToken:
 *                 type: string
 *                 example: "ab12d"
 *               voipToken:
 *                 type: string
 *                 example: "voip_token"
 *     responses:
 *       200:
 *         description: OTP verified, user logged in
 *       401:
 *         description: Invalid OTP
 */
router.post("/verifyOtp", ctrl.verifyOtp);


/**
 * @openapi
 * /users/blockUnblock:
 *   post:
 *     tags: [User Controller]
 *     summary: Block or Unblock a User
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               status:
 *                 type: integer
 *               remark:
 *                 type: string
 *     responses:
 *       200:
 *         description: User status updated
 */
router.post("/blockUnblock", ctrl.blockUnblockUser);



/**
 * @openapi
 * /users/getProfile:
 *   get:
 *     tags: [User Controller]
 *     summary: Get user profile by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         description: User ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get("/getProfile", ctrl.getProfile);

/**
 * @openapi
 * /users/viewProfile:
 *   get:
 *     tags: [User Controller]
 *     summary: Get user profile by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: loginUserId
 *         required: true
 *         description: Login User ID
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         required: true
 *         description: Other User ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get("/viewProfile", ctrl.viewUserProfile);


/**
 * @openapi
 * /users/getAllUser:
 *   get:
 *     tags: [User Controller]
 *     summary: Get list of all users (with pagination, optional status & search)
 *     description: Fetch paginated users, optionally filtered by status or search text. Results are sorted by createdAt in descending order.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pageIndex
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Page index (starting from 0)
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           example: "1"
 *         description: Optional user status (e.g., 1 for active, 2 for inactive)
 *       - in: query
 *         name: searchText
 *         schema:
 *           type: string
 *           example: "John"
 *         description: Optional search keyword (name, email, etc.)
 *     responses:
 *       200:
 *         description: List of users fetched successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/getAllUser", ctrl.getAllUsers);

/**
 * @openapi
 * /users/getAllUserLogs:
 *   get:
 *     tags: [User Controller]
 *     summary: Get list of all users logs (with pagination, optional status & search)
 *     description: Fetch paginated users, optionally filtered by status or search text. Results are sorted by createdAt in descending order.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pageIndex
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Page index (starting from 0)
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: searchText
 *         schema:
 *           type: string
 *           example: "John"
 *         description: Optional search keyword (name, email, etc.)
 *     responses:
 *       200:
 *         description: List of users logs fetched successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/getAllUserLogs", ctrl.getAllUserSessions);



/**
 * @swagger
 * /users/bulkGetProfiles:
 *   post:
 *     summary: Get multiple user profiles by IDs
 *     tags: [User Controller]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["u1", "u2", "u3"]
 *     responses:
 *       200:
 *         description: List of user profiles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *       400:
 *         description: Invalid request
 */
router.post("/bulkGetProfiles", ctrl.bulkGetProfiles);


/**
 * @openapi
 * /users/upload:
 *   post:
 *     tags: [User Controller]
 *     summary: Upload user profile image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *       401:
 *         description: Unauthorized
 */
router.post("/upload", upload.single("file"), ctrl.uploadFile);

/**
 * @openapi
 * /users/uploadMultipleFiles:
 *   post:
 *     tags: [User Controller]
 *     summary: Upload multiple files
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 *       401:
 *         description: Unauthorized
 */
router.post("/uploadMultipleFiles", upload.array("files", 50), ctrl.uploadMultipleFiles);


/**
 * @openapi
 * /users/logout:
 *   get:
 *     tags: [User Controller]
 *     summary: Logout user by token
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         description: User access token
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User Logout
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get("/logout", ctrl.logout);


/**
 * @openapi
 * /users/getUserCountGraph:
 *   get:
 *     tags: [User Controller]
 *     summary: Graph user count by filter
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: filterType
 *         required: true
 *         description: DAY/MONTH/YEAR
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Graph User count
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Graph User Count not found
 */
router.get("/getUserCountGraph", ctrl.getUserCountGraph);

/**
 * @openapi
 * /users/getUserStatsByCountry:
 *   get:
 *     tags: [User Controller]
 *     summary: Graph user count by filter
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Graph User count
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Graph User Count not found
 */
router.get("/getUserStatsByCountry", ctrl.getUserStatsByCountry);


/**
 * @openapi
 * /users/getTotalUserCount:
 *   get:
 *     tags: [User Controller]
 *     summary:  User count by filter
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User count
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User Count not found
 */
router.get("/getTotalUserCount", ctrl.getTotalUserCount);

module.exports = router;
