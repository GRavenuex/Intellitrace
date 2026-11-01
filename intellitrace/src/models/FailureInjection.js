const mongoose = require('mongoose');

const failureInjectionSchema = new mongoose.Schema({
    targetService: {
        type: String,
        required: true,
        enum: [
            'intellishop-gateway',
            'product-service',
            'cart-service',
            'order-service',
            'payment-service'
        ]
    },
    failureType: {
        type: String,
        required: true,
        enum: [
            'latency',
            'http_500',
            'service_unavailable',
            'database_timeout',
            'intermittent',
            'network_delay',
            'service_communication_failure',
            'traffic_spike',
            'cascading_failure'
        ]
    },
    targetRoute: {
        type: String,
        default: '*',
        trim: true
    },
    delayMs: {
        type: Number,
        default: 0,
        min: 0,
        max: 10000 // 10 seconds max
    },
    percentage: {
        type: Number,
        default: 100,
        min: 1,
        max: 100
    },
    durationSeconds: {
        type: Number,
        default: 60,
        min: 1,
        max: 300 // 5 minutes max
    },
    status: {
        type: String,
        enum: ['INACTIVE', 'ACTIVE', 'TRIGGERED', 'STOPPED', 'EXPIRED', 'DEACTIVATED'],
        default: 'ACTIVE'
    },
    triggerCount: {
        type: Number,
        default: 0
    },
    lastTriggeredAt: {
        type: Date,
        default: null
    },
    sourceService: {
        type: String,
        default: null
    },
    environment: {
        type: String,
        default: 'development'
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    },
    stoppedAt: {
        type: Date,
        default: null
    },
    createdBy: {
        type: String,
        default: 'system'
    },
    stoppedBy: {
        type: String,
        default: null
    },
    description: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Index for fast querying of active unexpired rules
failureInjectionSchema.index({ status: 1, targetService: 1, expiresAt: 1 });

module.exports = mongoose.model('FailureInjection', failureInjectionSchema);
