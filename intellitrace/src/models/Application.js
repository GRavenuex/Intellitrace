const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true,
        unique: true
    },
    environment: {
        type: String,
        required: true,
        default: 'development'
    },
    baseUrl: {
        type: String
    },
    status: {
        type: String,
        enum: ['unknown', 'healthy', 'degraded', 'down'],
        default: 'unknown'
    },
    lastHeartbeat: {
        type: Date,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('Application', applicationSchema);
