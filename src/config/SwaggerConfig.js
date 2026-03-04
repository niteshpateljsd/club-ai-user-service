const swaggerJSDoc = require("swagger-jsdoc");

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Club AI User Service",
      version: "1.0.0",
      description: "API documentation for User Service",
    },
    servers: [
    {
      url: "http://localhost:4002", 
      description: "club ai user server",
    },
    {
      url: "http://localhost:4002", 
      description: "Local server",
    },
   ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT", // optional
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.js", "./src/controllers/*.js"], // path to your route/controller files
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

module.exports = swaggerSpec;
