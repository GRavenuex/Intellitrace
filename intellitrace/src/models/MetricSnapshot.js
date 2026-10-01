const mongoose = require('mongoose');

const metricSnapshotSchema = new mongoose.Schema({
    application: {
        type: String,
        required: true,
        index: true
    },
    environment: {
        type: String,
        default: 'development'
    },
    timestamp: {
        type: Date,
        required: true,
        index: true
    },
    requestsTotal: {
        type: Number,
        default: 0
    },
    errorsTotal: {
        type: Number,
        default: 0
    },
    durationSum: {
        type: Number,
        default: 0
    },
    durationCount: {
        type: Number,
        default: 0
    },
    ordersCreatedTotal: { type: Number, default: 0 },
    paymentsStartedTotal: { type: Number, default: 0 },
    paymentsSuccessTotal: { type: Number, default: 0 },
    paymentsFailedTotal: { type: Number, default: 0 },
    cartOperationsTotal: { type: Number, default: 0 }
});

// Compound index for querying a specific app's metrics ordered by time
metricSnapshotSchema.index({ application: 1, timestamp: -1 });

module.exports = mongoose.model('MetricSnapshot', metricSnapshotSchema);


