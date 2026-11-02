const mongoose = require('mongoose');

const incidentEvidenceSchema = new mongoose.Schema({
    evidenceId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    incidentId: {
        type: String,
        required: true,
        index: true
    },
    evidenceType: {
        type: String,
        required: true,
        enum: ['log', 'trace', 'metric', 'health', 'failure_injection', 'error_detail', 'dependency'],
        index: true
    },
    sourceService: {
        type: String,
        required: true,
        index: true
    },
    timestamp: {
        type: Date,
        required: true,
        index: true
    },
    requestId: {
        type: String,
        index: true,
        default: null
    },
    traceId: {
        type: String,
        index: true,
        default: null
    },
    spanId: {
        type: String,
        default: null
    },
    matchMethod: {
        type: String,
        enum: ['exact_trace_id', 'exact_request_id', 'service_operation_time', 'service_error_time', 'time_window'],
        required: true
    },
    confidence: {
        type: Number,
        required: true,
        min: 0,
        max: 1
    },
    sourceReference: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    summary: {
        type: String,
        required: true
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Compound indexes for efficient querying
incidentEvidenceSchema.index({ incidentId: 1, evidenceType: 1 });
incidentEvidenceSchema.index({ incidentId: 1, confidence: -1 });
incidentEvidenceSchema.index({ incidentId: 1, timestamp: -1 });

module.exports = mongoose.model('IncidentEvidence', incidentEvidenceSchema);

