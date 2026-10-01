require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 4000,
    MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/intellitrace',
    JWT_SECRET: process.env.JWT_SECRET || 'fallback_secret',
    TELEMETRY_API_KEY: process.env.TELEMETRY_API_KEY || 'default_telemetry_key',
    NODE_ENV: process.env.NODE_ENV || 'development'
};
