const jwt = require("jsonwebtoken");
function generate(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || "dev_jwt_secret", {
    expiresIn: "30d",
  });
}
function verify(token) {
  return jwt.verify(token, process.env.JWT_SECRET || "dev_jwt_secret");
}
module.exports = { generate, verify };
