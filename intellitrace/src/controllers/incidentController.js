const Incident = require('../models/Incident');
const IncidentEvidence = require('../models/IncidentEvidence');
const { getRules, getRuleById, updateRule, resetRules } = require('../config/incidentRules');
const { evaluateIncidentsNow } = require('../services/incidentDetector');
const { correlateIncidentEvidence } = require('../services/evidenceCorrelator');

// Helper to look up incident by either incidentId (INC-...) or MongoDB _id
async function findIncident(id) {
    if (!id) return null;
    if (id.startsWith('INC-')) {
        return await Incident.findOne({ incidentId: id });
    }
    if (id.length === 24) {
        const byMongoId = await Incident.findById(id);
        if (byMongoId) return byMongoId;
    }
    return await Incident.findOne({ incidentId: id });
}

// GET /api/incidents - List incidents with filtering, search, pagination
exports.getIncidents = async (req, res, next) => {
    try {
        const {
            status,
            severity,
            service,
            search,
            page = 1,
            limit = 20,
            sort = '-lastDetectedAt'
        } = req.query;

        const query = {};

        // Status filter ('open', 'investigating', 'resolved', or comma-separated)
        if (status && status !== 'ALL' && status !== 'all') {
            if (status.includes(',')) {
                query.status = { $in: status.split(',').map(s => s.trim().toLowerCase()) };
            } else {
                query.status = status.toLowerCase();
            }
        }

        // Severity filter ('critical', 'high', 'warning')
        if (severity && severity !== 'ALL' && severity !== 'all') {
            query.severity = severity.toLowerCase();
        }

        // Service filter
        if (service && service !== 'ALL' && service !== 'all') {
            query.$or = [
                { primaryService: service },
                { affectedServices: service }
            ];
        }

        // Search text
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            const searchConditions = [
                { title: regex },
                { description: regex },
                { incidentId: regex },
                { primaryService: regex }
            ];
            if (query.$or) {
                query.$and = [{ $or: query.$or }, { $or: searchConditions }];
                delete query.$or;
            } else {
                query.$or = searchConditions;
            }
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const total = await Incident.countDocuments(query);
        const incidents = await Incident.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        const totalPages = Math.ceil(total / limitNum) || 1;

        res.json({
            success: true,
            count: incidents.length,
            total,
            page: pageNum,
            totalPages,
            limit: limitNum,
            hasMore: pageNum < totalPages,
            data: incidents
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/incidents/stats - Summary statistics
exports.getIncidentStats = async (req, res, next) => {
    try {
        const [
            total,
            open,
            investigating,
            resolved,
            critical,
            high,
            warning
        ] = await Promise.all([
            Incident.countDocuments(),
            Incident.countDocuments({ status: 'open' }),
            Incident.countDocuments({ status: 'investigating' }),
            Incident.countDocuments({ status: 'resolved' }),
            Incident.countDocuments({ severity: 'critical', status: { $in: ['open', 'investigating'] } }),
            Incident.countDocuments({ severity: 'high', status: { $in: ['open', 'investigating'] } }),
            Incident.countDocuments({ severity: 'warning', status: { $in: ['open', 'investigating'] } })
        ]);

        res.json({
            success: true,
            data: {
                total,
                open,
                investigating,
                resolved,
                critical,
                high,
                warning,
                active: open + investigating
            }
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/incidents/rules - Get detection rules
exports.getRules = async (req, res, next) => {
    try {
        const rules = getRules();
        res.json({
            success: true,
            count: rules.length,
            data: rules
        });
    } catch (err) {
        next(err);
    }
};

// PATCH /api/incidents/rules/:ruleId - Update rule configuration
exports.updateRule = async (req, res, next) => {
    try {
        const { ruleId } = req.params;
        const updated = updateRule(ruleId, req.body);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Detection rule not found' });
        }
        res.json({
            success: true,
            message: `Rule ${ruleId} updated successfully`,
            data: updated
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/incidents/:id - Get incident details by ID or incidentId
exports.getIncidentById = async (req, res, next) => {
    try {
        const { id } = req.params;
        let incident = null;

        if (id.startsWith('INC-')) {
            incident = await Incident.findOne({ incidentId: id });
        } else if (id.length === 24) {
            incident = await Incident.findById(id);
        }

        if (!incident) {
            // Fallback: try finding by incidentId anyway
            incident = await Incident.findOne({ incidentId: id });
        }

        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        res.json({
            success: true,
            data: incident
        });
    } catch (err) {
        next(err);
    }
};

// PATCH /api/incidents/:id/status - Update incident status (investigating, resolved, open)
exports.updateIncidentStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, notes = '' } = req.body;

        const validStatuses = ['open', 'investigating', 'resolved'];
        if (!status || !validStatuses.includes(status.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        let incident = null;
        if (id.startsWith('INC-')) {
            incident = await Incident.findOne({ incidentId: id });
        } else if (id.length === 24) {
            incident = await Incident.findById(id);
        } else {
            incident = await Incident.findOne({ incidentId: id });
        }

        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        const newStatus = status.toLowerCase();
        const oldStatus = incident.status;
        const actor = req.user ? (req.user.email || req.user.username || 'developer') : 'developer';
        const now = new Date();

        incident.status = newStatus;
        if (notes) {
            incident.resolutionNotes = notes;
        }

        if (newStatus === 'resolved') {
            incident.resolvedAt = now;
            incident.timeline.push({
                timestamp: now,
                type: 'manual_resolved',
                message: `Incident marked as Resolved by ${actor}.${notes ? ` Resolution notes: ${notes}` : ''}`,
                actor
            });
        } else if (newStatus === 'investigating') {
            incident.resolvedAt = null;
            incident.timeline.push({
                timestamp: now,
                type: 'status_change',
                message: `Investigation started by ${actor}.${notes ? ` Notes: ${notes}` : ''}`,
                actor
            });
        } else if (newStatus === 'open') {
            incident.resolvedAt = null;
            incident.timeline.push({
                timestamp: now,
                type: 'reopened',
                message: `Incident reopened by ${actor}.${notes ? ` Reason: ${notes}` : ''}`,
                actor
            });
        }

        await incident.save();

        res.json({
            success: true,
            message: `Incident ${incident.incidentId} status changed from ${oldStatus} to ${newStatus}`,
            data: incident
        });
    } catch (err) {
        next(err);
    }
};

// =========================================================================
// PHASE 13 — EVIDENCE CORRELATION & INCIDENT INVESTIGATION CONTROLLER
// =========================================================================

// GET /api/incidents/:id/investigation - Comprehensive correlated investigation payload
exports.getIncidentInvestigation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const incident = await findIncident(id);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        const forceRefresh = req.query.refresh === 'true';
        const result = await correlateIncidentEvidence(incident, { forceRefresh });

        res.json({
            success: true,
            incidentId: incident.incidentId,
            data: {
                incident: result.incident,
                investigation: result.investigation,
                evidenceCount: result.evidence ? result.evidence.length : 0
            }
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/incidents/:id/evidence - Detailed correlated evidence items
exports.getIncidentEvidence = async (req, res, next) => {
    try {
        const { id } = req.params;
        const incident = await findIncident(id);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        let evidenceItems = await IncidentEvidence.find({ incidentId: incident.incidentId })
            .sort({ confidence: -1, timestamp: -1 });

        // If no evidence items exist yet, correlate now
        if (!evidenceItems || evidenceItems.length === 0) {
            const correlated = await correlateIncidentEvidence(incident, { forceRefresh: true });
            evidenceItems = correlated.evidence || [];
        }

        res.json({
            success: true,
            incidentId: incident.incidentId,
            title: incident.title,
            primaryService: incident.primaryService,
            count: evidenceItems.length,
            data: evidenceItems,
            rawEvidence: incident.evidence,
            relatedTraceIds: incident.relatedTraceIds,
            relatedRequestIds: incident.relatedRequestIds,
            failureInjectionDetails: incident.failureInjectionDetails
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/incidents/:id/dependencies - Correlated service topology and health
exports.getIncidentDependencies = async (req, res, next) => {
    try {
        const { id } = req.params;
        const incident = await findIncident(id);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        if (!incident.investigationSummary || !incident.investigationSummary.dependencies) {
            const correlated = await correlateIncidentEvidence(incident);
            return res.json({
                success: true,
                incidentId: incident.incidentId,
                data: correlated.investigation.dependencies
            });
        }

        res.json({
            success: true,
            incidentId: incident.incidentId,
            data: incident.investigationSummary.dependencies
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/incidents/:id/correlate - Trigger on-demand re-correlation
exports.correlateIncidentNow = async (req, res, next) => {
    try {
        const { id } = req.params;
        const incident = await findIncident(id);
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        const correlated = await correlateIncidentEvidence(incident, { forceRefresh: true });

        res.json({
            success: true,
            message: `Correlated evidence refreshed for incident ${incident.incidentId}`,
            data: correlated.investigation
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/incidents/evaluate - Trigger immediate evaluation
exports.evaluateNow = async (req, res, next) => {
    try {
        await evaluateIncidentsNow();
        res.json({
            success: true,
            message: 'Incident detection engine evaluation triggered successfully'
        });
    } catch (err) {
        next(err);
    }
};

