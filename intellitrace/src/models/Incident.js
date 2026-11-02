const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
    incidentId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    fingerprint: {
        type: String,
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    ruleId: {
        type: String,
        required: true,
        index: true
    },
    category: {
        type: String,
        enum: ['availability', 'latency', 'database', 'communication', 'capacity', 'cascade', 'general'],
        default: 'general'
    },
    severity: {
        type: String,
        enum: ['critical', 'high', 'warning'],
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['open', 'investigating', 'resolved'],
        default: 'open',
        index: true
    },
    primaryService: {
        type: String,
        required: true,
        index: true
    },
    affectedServices: {
        type: [String],
        default: []
    },
    firstDetectedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    lastDetectedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    occurrenceCount: {
        type: Number,
        default: 1
    },
    consecutiveHealthyCount: {
        type: Number,
        default: 0
    },
    detectionSource: {
        type: String,
        default: 'telemetry_engine'
    },
    evidence: {
        metricSummary: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        recentLogs: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        recentSpans: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        errorDetails: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        threshold: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    relatedRequestIds: {
        type: [String],
        default: []
    },
    relatedTraceIds: {
        type: [String],
        default: []
    },
    relatedLogReferences: {
        type: [String],
        default: []
    },
    relatedMetricInformation: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    failureInjectionId: {
        type: String,
        default: null
    },
    failureInjectionDetails: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    serviceRecovered: {
        type: Boolean,
        default: false
    },
    recoveredAt: {
        type: Date,
        default: null
    },
    investigationSummary: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    timeline: [
        {
            timestamp: {
                type: Date,
                default: Date.now
            },
            type: {
                type: String,
                enum: ['created', 'reoccurrence', 'status_change', 'auto_resolved', 'manual_resolved', 'reopened'],
                default: 'created'
            },
            message: {
                type: String,
                required: true
            },
            actor: {
                type: String,
                default: 'system'
            }
        }
    ],
    resolutionNotes: {
        type: String,
        default: ''
    },
    environment: {
        type: String,
        default: 'development'
    }
}, {
    timestamps: true
});

// Compound indexes for fast filtering and deduplication
incidentSchema.index({ status: 1, severity: 1, primaryService: 1 });
incidentSchema.index({ fingerprint: 1, status: 1 });
incidentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Incident', incidentSchema);
