module.exports = {
  apps: [
    {
      name: "club-ai-user-service",
      script: "./src/index.js",
      watch: false,
      env: { NODE_ENV: "development" },
      env_production: { NODE_ENV: "production" },
    },
  ],
};
