const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async () => {
    try {
        await mongoose.connect(env.MONGO_URI);
        console.log('IntelliTrace MongoDB Connected');
    } catch (error) {
        console.error('IntelliTrace MongoDB Connection Error:', error);
        process.exit(1);
    }
};

module.exports = connectDB;
