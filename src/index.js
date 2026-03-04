require("dotenv").config({ path: ".env.template.dev" });

const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");

const connectDB = require("./config/DBConfig");
const userRoutes = require("./routes/UserRoute");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/SwaggerConfig"); // 👈 import swagger config


const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

//app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Swagger docs should match API versioning
app.use("/users/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ✅ All user routes under /users
app.use("/users", userRoutes);


// Health check
app.get("/health", (_, res) => res.json({ status: "up" }));

const PORT = process.env.PORT || 4002;
connectDB().then(() =>
  app.listen(PORT, () => console.log(`🚀 User Service running on port ${PORT}`))
);
