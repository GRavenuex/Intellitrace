const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async () => {
    try {
        await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 4000 });
        console.log('IntelliTrace MongoDB Connected');
    } catch (error) {
        if (env.MONGO_URI !== 'mongodb://127.0.0.1:27017/intellitrace') {
            console.warn('Atlas connection failed. Falling back to local MongoDB at mongodb://127.0.0.1:27017/intellitrace...');
            try {
                await mongoose.connect('mongodb://127.0.0.1:27017/intellitrace', { serverSelectionTimeoutMS: 4000 });
                console.log('IntelliTrace connected to local MongoDB');
                return;
            } catch (localErr) {
                console.error('Local MongoDB Connection Error:', localErr);
            }
        }
        console.error('IntelliTrace MongoDB Connection Error:', error);
        process.exit(1);
    }
};

module.exports = connectDB;
