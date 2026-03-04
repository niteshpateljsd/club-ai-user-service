// const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
// const path = require("path");
// const crypto = require("crypto");
// const logger = require("./logger");

// // Log env values ONCE (when file loads)
// logger.info("🔍 ENV CHECK for S3", {
//   AWS_REGION: process.env.AWS_REGION,
//   AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
//   ACCESS_KEY: process.env.AWS_ACCESS_KEY_ID ? "Loaded" : "Missing",
//   SECRET_KEY: process.env.AWS_SECRET_ACCESS_KEY ? "Loaded" : "Missing"
// });

// // VALIDATE ENV VARS
// if (!process.env.AWS_REGION) logger.error("❌ Missing AWS_REGION");
// if (!process.env.AWS_S3_BUCKET) logger.error("❌ Missing AWS_S3_BUCKET");
// if (!process.env.AWS_ACCESS_KEY_ID) logger.error("❌ Missing AWS_ACCESS_KEY_ID");
// if (!process.env.AWS_SECRET_ACCESS_KEY) logger.error("❌ Missing AWS_SECRET_ACCESS_KEY");

// // Initialize S3 (with fallback region)
// const s3 = new S3Client({
//   region: process.env.AWS_REGION || "eu-north-1",  // fallback
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
//   },
// });


// async function uploadToS3(file) {
//   try {
//     logger.info("📤 Starting S3 upload process...");

//     if (!file) {
//       logger.warn("⚠️ uploadToS3 called but NO FILE was received!");
//       throw new Error("No file received for S3 upload");
//     }

//     logger.info("📁 File details", {
//       originalName: file.originalname,
//       mimeType: file.mimetype,
//       size: file.size
//     });

//     // Generate unique file key
//     const fileExt = path.extname(file.originalname);
//     const randomName = crypto.randomBytes(16).toString("hex") + fileExt;

//     if (!process.env.AWS_S3_BUCKET) {
//       logger.error("❌ S3 bucket is missing in ENV");
//       throw new Error("AWS S3 Bucket is missing in ENV");
//     }

//     const uploadParams = {
//       Bucket: process.env.AWS_S3_BUCKET,
//       Key: randomName,
//       Body: file.buffer,
//       ContentType: file.mimetype,
//     };

//     logger.info("📦 Uploading to S3", {
//       bucket: process.env.AWS_S3_BUCKET,
//       key: randomName
//     });

//     await s3.send(new PutObjectCommand(uploadParams));

//     logger.info("✅ File uploaded to S3 successfully");

//     // CloudFront URL
//     if (process.env.CLOUDFRONT_URL) {
//       const url = `${process.env.CLOUDFRONT_URL}/${randomName}`;
//       logger.info(`🌐 CloudFront URL: ${url}`);
//       return url;
//     }

//     // Default S3 URL
//     const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${randomName}`;
//     logger.info(`🌐 S3 URL: ${s3Url}`);

//     return s3Url;

//   } catch (err) {
//     logger.error("❌ S3 Upload Error", {
//       message: err.message,
//       stack: err.stack
//     });
//     throw err;
//   }
// }

// module.exports = uploadToS3;
