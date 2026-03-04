const cloudinary = require("cloudinary").v2;
const crypto = require("crypto");
const logger = require("../utils/logger");

// Log ENV values ONCE
logger.info("🔍 ENV CHECK for Cloudinary", {
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ? "Loaded" : "Missing",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ? "Loaded" : "Missing"
});
// Validate ENV
if (!process.env.CLOUDINARY_CLOUD_NAME) logger.error("❌ Missing CLOUDINARY_CLOUD_NAME");
if (!process.env.CLOUDINARY_API_KEY) logger.error("❌ Missing CLOUDINARY_API_KEY");
if (!process.env.CLOUDINARY_API_SECRET) logger.error("❌ Missing CLOUDINARY_API_SECRET");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 🔥 SAME FUNCTION NAME (as requested)
async function uploadToS3(file) {
  try {
    logger.info("📤 Starting Cloudinary upload process...");

    if (!file) {
      logger.warn("⚠️ uploadToS3 called but NO FILE was received!");
      throw new Error("No file received for upload");
    }

    logger.info("📁 File details", {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    });

    // Generate unique public ID
    const randomName = crypto.randomBytes(16).toString("hex");

    // Upload using buffer (stream)
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "uploads",
          public_id: randomName,
          resource_type: "auto" // auto detect image/video/file
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      stream.end(file.buffer);
    });

    logger.info("✅ File uploaded to Cloudinary successfully", {
      url: uploadResult.secure_url
    });

    return uploadResult.secure_url;

  } catch (err) {
    logger.error("❌ Cloudinary Upload Error", {
      message: err.message,
      stack: err.stack
    });
    throw err;
  }
}

module.exports = uploadToS3;