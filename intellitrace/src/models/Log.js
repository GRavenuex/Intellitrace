const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        required: true
    },
    level: {
        type: String,
        required: true
    },
    service: {
        type: String,
        required: true
    },
    environment: {
        type: String,
        default: 'development'
    },
    message: {
        type: String,
        required: true
    },
    method: String,
    route: String,
    statusCode: Number,
    responseTime: Number,
    requestId: String
}, { timestamps: true });

module.exports = mongoose.model('Log', logSchema);
