var dotenv = require("dotenv");

dotenv.config();

module.exports = {
  development: {
    user: process.env.GSA_DB_USER || "deploy",
    password: process.env.GSA_DB_PW || "",
    database: process.env.GSA_DB_NAME || "cny",
    host: process.env.GSA_DB_HOST || "cny-bullfrog.datawheel.us",
    port: process.env.GSA_DB_PORT || 5432,
    dialect: "postgres"
  },
  production: {
    user: process.env.GSA_DB_USER || "deploy",
    password: process.env.GSA_DB_PW || "",
    database: process.env.GSA_DB_NAME || "sos",
    host: process.env.GSA_DB_HOST || "cny-bullfrog.datawheel.us",
    port: process.env.GSA_DB_PORT || 5432,
    dialect: "postgres"
  }
};
