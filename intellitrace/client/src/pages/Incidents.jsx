import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    AlertOctagon, AlertTriangle, CheckCircle, Clock, Search, 
    RefreshCw, Filter, ArrowRight, ExternalLink, X, ShieldAlert,
    Activity, ChevronRight, Check, Eye, HelpCircle, Layers, Flame,
    ArrowLeft, Copy, FileText, Terminal, Server, Database, Network,
    Info, ChevronDown, CheckCheck
} from 'lucide-react';
import api from '../api';

const SERVICE_LABELS = {
    'intellishop-gateway': 'IntelliShop Gateway',
    'product-service': 'Product Service',
    'cart-service': 'Cart Service',
    'order-service': 'Order Service',
    'payment-service': 'Payment Service'
};

const SEVERITY_STYLES = {
    critical: {
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        badge: 'bg-rose-100 text-rose-800 border border-rose-300',
        dot: 'bg-rose-500',
        border: 'border-l-rose-500'
    },
    high: {
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        badge: 'bg-amber-100 text-amber-800 border border-amber-300',
        dot: 'bg-amber-500',
        border: 'border-l-amber-500'
    },
    warning: {
        bg: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        badge: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
        dot: 'bg-yellow-500',
        border: 'border-l-yellow-500'
    }
};

const STATUS_STYLES = {
    open: {
        badge: 'bg-blue-100 text-blue-800 border-blue-300',
        dot: 'bg-blue-500'
    },
    investigating: {
        badge: 'bg-purple-100 text-purple-800 border-purple-300',
        dot: 'bg-purple-500'
    },
    resolved: {
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        dot: 'bg-emerald-500'
    }
};

function formatTimestamp(isoString) {
    if (!isoString) return '—';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (_) {
        return isoString;
    }
}

function timeAgo(isoString) {
    if (!isoString) return '';
    try {
        const sec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
        if (sec < 5) return 'just now';
        if (sec < 60) return `${sec}s ago`;
        const min = Math.floor(sec / 60);
        if (min < 60) return `${min}m ago`;
        const hrs = Math.floor(min / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    } catch (_) {
        return '';
    }
}

export default function Incidents() {
    const { id: paramIncidentId } = useParams();
    const navigate = useNavigate();

    // List State
    const [incidents, setIncidents] = useState([]);
    const [stats, setStats] = useState({ total: 0, open: 0, investigating: 0, resolved: 0, critical: 0, high: 0, warning: 0 });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [autoRefresh, setAutoRefresh] = useState(true);

    // List Filters
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [severityFilter, setSeverityFilter] = useState('ALL');
    const [serviceFilter, setServiceFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Investigation Detail State (for active incident)
    const [activeIncidentId, setActiveIncidentId] = useState(paramIncidentId || null);
    const [investigationData, setInvestigationData] = useState(null);
    const [investigationLoading, setInvestigationLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'error' | 'trace' | 'logs' | 'metrics' | 'dependencies' | 'simulation'
    
    // Sub-data for tabs
    const [incidentLogs, setIncidentLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsFilter, setLogsFilter] = useState('ALL');
    const [logsSearch, setLogsSearch] = useState('');
    const [logsPage, setLogsPage] = useState(1);
    const [logsTotalPages, setLogsTotalPages] = useState(1);
    const [expandedLogId, setExpandedLogId] = useState(null);

    const [incidentTraces, setIncidentTraces] = useState([]);
    const [tracesLoading, setTracesLoading] = useState(false);
    const [selectedSpan, setSelectedSpan] = useState(null);

    // Status update modal / controls
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [resolveModalOpen, setResolveModalOpen] = useState(false);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [copiedKey, setCopiedKey] = useState(null);

    const copyToClipboard = (text, key) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    // Keep activeIncidentId in sync with route params
    useEffect(() => {
        if (paramIncidentId) {
            setActiveIncidentId(paramIncidentId);
        } else {
            setActiveIncidentId(null);
        }
    }, [paramIncidentId]);

    // Fetch Stats
    const fetchStats = async () => {
        try {
            const res = await api.get('/incidents/stats');
            if (res.data?.success) {
                setStats(res.data.data);
            }
        } catch (err) {
            console.error('Failed to load incident stats:', err);
        }
    };

    // Fetch Incidents List
    const fetchIncidents = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams({
                page: String(page),
                limit: '15'
            });

            if (statusFilter !== 'ALL') query.append('status', statusFilter);
            if (severityFilter !== 'ALL') query.append('severity', severityFilter);
            if (serviceFilter !== 'ALL') query.append('service', serviceFilter);
            if (searchQuery.trim()) query.append('search', searchQuery.trim());

            const res = await api.get(`/incidents?${query.toString()}`);
            if (res.data?.success) {
                setIncidents(res.data.data || []);
                setTotal(res.data.total || 0);
                setTotalPages(res.data.totalPages || 1);
            }
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Failed to load incidents:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Fetch Investigation Details for Active Incident
    const fetchInvestigation = async (id, force = false) => {
        if (!id) return;
        setInvestigationLoading(true);
        try {
            const res = await api.get(`/incidents/${id}/investigation${force ? '?refresh=true' : ''}`);
            if (res.data?.success) {
                setInvestigationData(res.data.data);
            }
        } catch (err) {
            console.error('Failed to load investigation details:', err);
        } finally {
            setInvestigationLoading(false);
        }
    };

    // Fetch Logs for Active Incident
    const fetchIncidentLogs = async (id, level = logsFilter, search = logsSearch, p = logsPage) => {
        if (!id) return;
        setLogsLoading(true);
        try {
            const query = new URLSearchParams({ page: String(p), limit: '30' });
            if (level !== 'ALL') query.append('level', level);
            if (search.trim()) query.append('search', search.trim());

            const res = await api.get(`/incidents/${id}/logs?${query.toString()}`);
            if (res.data?.success) {
                setIncidentLogs(res.data.data?.items || []);
                setLogsTotalPages(res.data.data?.totalPages || 1);
            }
        } catch (err) {
            console.error('Failed to load incident logs:', err);
        } finally {
            setLogsLoading(false);
        }
    };

    // Fetch Traces for Active Incident
    const fetchIncidentTraces = async (id) => {
        if (!id) return;
        setTracesLoading(true);
        try {
            const res = await api.get(`/incidents/${id}/traces`);
            if (res.data?.success) {
                const traces = res.data.data || [];
                setIncidentTraces(traces);
                if (traces.length > 0 && traces[0].spans?.length > 0) {
                    setSelectedSpan(traces[0].spans[0]);
                }
            }
        } catch (err) {
            console.error('Failed to load incident traces:', err);
        } finally {
            setTracesLoading(false);
        }
    };

    // Effects
    useEffect(() => {
        if (!activeIncidentId) {
            fetchStats();
            fetchIncidents();
        } else {
            fetchInvestigation(activeIncidentId);
            fetchIncidentLogs(activeIncidentId, logsFilter, logsSearch, logsPage);
            fetchIncidentTraces(activeIncidentId);
        }
    }, [activeIncidentId, statusFilter, severityFilter, serviceFilter, page]);

    // Search Debounce on Incidents List
    useEffect(() => {
        if (activeIncidentId) return;
        const timer = setTimeout(() => {
            setPage(1);
            fetchIncidents();
        }, 350);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Auto-refresh interval (every 15s)
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            if (activeIncidentId) {
                fetchInvestigation(activeIncidentId);
            } else {
                fetchStats();
                fetchIncidents();
            }
        }, 15000);
        return () => clearInterval(interval);
    }, [autoRefresh, activeIncidentId, statusFilter, severityFilter, serviceFilter, page, searchQuery]);

    // Handle Manual Status Change
    const handleUpdateStatus = async (newStatus, notes = '') => {
        if (!activeIncidentId) return;
        setStatusUpdating(true);
        try {
            const res = await api.patch(`/incidents/${activeIncidentId}/status`, {
                status: newStatus,
                notes
            });
            if (res.data?.success) {
                setResolveModalOpen(false);
                setResolutionNotes('');
                fetchInvestigation(activeIncidentId, true);
                fetchStats();
            }
        } catch (err) {
            console.error('Failed to update incident status:', err);
        } finally {
            setStatusUpdating(false);
        }
    };

    const handleSelectIncident = (incidentId) => {
        setActiveIncidentId(incidentId);
        navigate(`/incidents/${incidentId}`);
    };

    const handleBackToList = () => {
        setActiveIncidentId(null);
        setInvestigationData(null);
        navigate('/incidents');
    };

    // =========================================================================
    // VIEW 1: INVESTIGATION WORKSPACE (When an incident is active)
    // =========================================================================
    if (activeIncidentId) {
        const inc = investigationData?.incident;
        const inv = investigationData?.investigation;
        const errDetails = inv?.actualError;
        const tracesSummary = inv?.tracesSummary;
        const metricsSummary = inv?.metricsSummary;
        const dependencies = inv?.dependencies;
        const failureInj = inv?.failureInjection;

        const sev = SEVERITY_STYLES[inc?.severity] || SEVERITY_STYLES.warning;
        const stat = STATUS_STYLES[inc?.status] || STATUS_STYLES.open;

        return (
            <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
                {/* 1. Header & Navigation */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={handleBackToList}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 transition shadow-xs"
                            >
                                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                                Back to Incidents
                            </button>
                            <span className="text-gray-300">|</span>
                            <span className="font-mono text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded border border-gray-200">
                                {inc?.incidentId || activeIncidentId}
                            </span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${sev.badge}`}>
                                <span className={`w-1.5 h-1.5 mr-1.5 rounded-full ${sev.dot}`}></span>
                                {inc?.severity || 'warning'}
                            </span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${stat.badge}`}>
                                {inc?.status || 'open'}
                            </span>
                        </div>

                        {/* Status Actions */}
                        <div className="flex items-center space-x-2">
                            {inc?.status === 'open' && (
                                <button
                                    onClick={() => handleUpdateStatus('investigating')}
                                    disabled={statusUpdating}
                                    className="px-3.5 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 transition shadow-xs flex items-center"
                                >
                                    <Activity className="w-3.5 h-3.5 mr-1.5" />
                                    Investigate
                                </button>
                            )}

                            {inc?.status !== 'resolved' && (
                                <button
                                    onClick={() => setResolveModalOpen(true)}
                                    disabled={statusUpdating}
                                    className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition shadow-xs flex items-center"
                                >
                                    <Check className="w-3.5 h-3.5 mr-1.5" />
                                    Resolve Incident
                                </button>
                            )}

                            {inc?.status === 'resolved' && (
                                <button
                                    onClick={() => handleUpdateStatus('open', 'Reopened by developer')}
                                    disabled={statusUpdating}
                                    className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition shadow-xs"
                                >
                                    Reopen Incident
                                </button>
                            )}

                            <button
                                onClick={() => fetchInvestigation(activeIncidentId, true)}
                                disabled={investigationLoading}
                                className="p-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition shadow-xs"
                                title="Re-correlate telemetry"
                            >
                                <RefreshCw className={`w-4 h-4 ${investigationLoading ? 'animate-spin text-blue-600' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Incident Title & Primary Details */}
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                            {inc?.title || 'Loading incident investigation...'}
                        </h1>
                        <div className="mt-2 flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-gray-500">
                            <div>
                                <span className="text-gray-400">Primary Service: </span>
                                <span className="font-semibold text-gray-800">
                                    {SERVICE_LABELS[inc?.primaryService] || inc?.primaryService || '—'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400">First Detected: </span>
                                <span className="font-medium text-gray-700">{formatTimestamp(inc?.firstDetectedAt)}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Last Seen: </span>
                                <span className="font-medium text-gray-700">{timeAgo(inc?.lastDetectedAt)} ({formatTimestamp(inc?.lastDetectedAt)})</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Occurrences: </span>
                                <span className="font-bold text-gray-800">{inc?.occurrenceCount || 1}x</span>
                            </div>
                            {inc?.serviceRecovered && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Telemetry Healthy (Manual Resolution Required)
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Navigation Tabs */}
                <div className="flex border-b border-gray-200 space-x-1 bg-white px-4 rounded-xl shadow-xs overflow-x-auto">
                    {[
                        { id: 'overview', label: 'A. Overview & Evidence', icon: AlertOctagon },
                        { id: 'error', label: 'B. Actual Error', icon: Terminal, badge: errDetails?.errorType },
                        { id: 'trace', label: 'C. Request & Trace', icon: Layers, badge: tracesSummary?.totalCorrelated },
                        { id: 'logs', label: 'D. Correlated Logs', icon: FileText },
                        { id: 'metrics', label: 'E. Metrics', icon: Activity },
                        { id: 'dependencies', label: 'F. Dependencies', icon: Network },
                        ...(failureInj?.associated ? [{ id: 'simulation', label: 'G. Failure Injection', icon: Flame, badge: 'Active' }] : [])
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center space-x-2 py-3.5 px-3 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                                    isActive
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{tab.label}</span>
                                {tab.badge && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-600 font-mono">
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* 3. Tab Contents */}
                {/* ------------------------------------------------------------- */}
                {/* TAB A: OVERVIEW & EVIDENCE SUMMARY                            */}
                {/* ------------------------------------------------------------- */}
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Evidence Summary Card */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center">
                                    <AlertOctagon className="w-4 h-4 mr-2 text-blue-600" />
                                    Correlated Evidence Summary
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Synthesized automatically from actual observed telemetry across logs, traces, metrics, and health states.
                                </p>
                            </div>

                            <p className="text-sm text-gray-800 bg-gray-50 p-4 rounded-lg border border-gray-200 leading-relaxed font-sans">
                                {inv?.summaryText || inc?.description || 'Collecting and correlating telemetry evidence...'}
                            </p>

                            {/* Tri-Fold Evidence Distinction (Confirmed, Suspected, Missing) */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                                {/* Confirmed Observations */}
                                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2">
                                    <div className="flex items-center space-x-2 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                                        <span>Confirmed Observations</span>
                                    </div>
                                    <ul className="space-y-1.5 text-xs text-emerald-950">
                                        {inv?.confirmedObservations?.length > 0 ? (
                                            inv.confirmedObservations.map((obs, i) => (
                                                <li key={i} className="flex items-start">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 mr-2 shrink-0"></span>
                                                    <span>{obs}</span>
                                                </li>
                                            ))
                                        ) : (
                                            <li className="text-emerald-700 italic">No confirmed observations recorded yet.</li>
                                        )}
                                    </ul>
                                </div>

                                {/* Suspected Explanations */}
                                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-2">
                                    <div className="flex items-center space-x-2 text-xs font-bold text-amber-800 uppercase tracking-wider">
                                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                                        <span>Suspected Explanations</span>
                                    </div>
                                    <ul className="space-y-1.5 text-xs text-amber-950">
                                        {inv?.suspectedExplanations?.length > 0 ? (
                                            inv.suspectedExplanations.map((exp, i) => (
                                                <li key={i} className="flex items-start">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 mr-2 shrink-0"></span>
                                                    <span>{exp}</span>
                                                </li>
                                            ))
                                        ) : (
                                            <li className="text-amber-700 italic">No secondary explanations inferred.</li>
                                        )}
                                    </ul>
                                </div>

                                {/* Missing Evidence */}
                                <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 space-y-2">
                                    <div className="flex items-center space-x-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        <Info className="w-4 h-4 text-gray-500" />
                                        <span>Missing / Uninstrumented</span>
                                    </div>
                                    <ul className="space-y-1.5 text-xs text-gray-700">
                                        {inv?.missingEvidence?.length > 0 ? (
                                            inv.missingEvidence.map((mis, i) => (
                                                <li key={i} className="flex items-start">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 mr-2 shrink-0"></span>
                                                    <span>{mis}</span>
                                                </li>
                                            ))
                                        ) : (
                                            <li className="text-gray-500 italic">All key telemetry points were instrumented.</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Affected Services & Timeline */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Affected Services Card */}
                            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Service Scope</h3>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs">
                                        <span className="font-semibold text-rose-900">
                                            Primary Failing Service: {SERVICE_LABELS[inc?.primaryService] || inc?.primaryService}
                                        </span>
                                        <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-800 font-bold uppercase text-[10px]">
                                            Root Service
                                        </span>
                                    </div>

                                    {(inc?.affectedServices || [])
                                        .filter(s => s !== inc?.primaryService)
                                        .map(svc => (
                                            <div key={svc} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs">
                                                <span className="text-gray-700 font-medium">
                                                    Downstream Impacted: {SERVICE_LABELS[svc] || svc}
                                                </span>
                                                <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 text-[10px]">
                                                    Degraded
                                                </span>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>

                            {/* Lifecycle Timeline */}
                            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Lifecycle History</h3>
                                <div className="border-l-2 border-gray-200 ml-2 space-y-4 max-h-60 overflow-y-auto pr-2">
                                    {(inc?.timeline || []).map((t, idx) => (
                                        <div key={idx} className="relative pl-5 text-xs">
                                            <div className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-white border-2 border-blue-500"></div>
                                            <div className="font-semibold text-gray-900">{t.message}</div>
                                            <div className="text-[11px] text-gray-400 mt-0.5">
                                                {formatTimestamp(t.timestamp)} • Actor: {t.actor || 'system'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* TAB B: ACTUAL ERROR EXTRACTION                                */}
                {/* ------------------------------------------------------------- */}
                {activeTab === 'error' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="text-base font-bold text-gray-900 flex items-center">
                                    <Terminal className="w-5 h-5 mr-2 text-rose-600" />
                                    Actual Technical Exception
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Extracted directly from structured application logs and failed trace spans.
                                </p>
                            </div>

                            <button
                                onClick={() => copyToClipboard(errDetails?.errorMessage, 'err-msg')}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition shadow-xs"
                            >
                                {copiedKey === 'err-msg' ? <CheckCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                                {copiedKey === 'err-msg' ? 'Copied Error!' : 'Copy Error Message'}
                            </button>
                        </div>

                        {/* Error Banner */}
                        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
                            <div className="flex items-center space-x-2">
                                <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-800 font-mono text-xs font-bold uppercase">
                                    {errDetails?.errorType || 'Application Error'}
                                </span>
                                {errDetails?.statusCode && (
                                    <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-800 font-mono text-xs font-bold">
                                        HTTP {errDetails.statusCode}
                                    </span>
                                )}
                            </div>
                            <div className="font-mono text-sm font-semibold break-words">
                                {errDetails?.errorMessage || 'Exact error message not available. Review related logs and traces.'}
                            </div>
                        </div>

                        {/* Technical Metadata Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                            <div>
                                <span className="text-gray-400 block">Service Name</span>
                                <span className="font-semibold text-gray-800">{errDetails?.service || inc?.primaryService}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">HTTP Method & Route</span>
                                <span className="font-mono font-semibold text-gray-800">
                                    {errDetails?.method || 'GET'} {errDetails?.route || '—'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Source File</span>
                                <span className="font-mono font-semibold text-gray-800">
                                    {errDetails?.sourceFile || 'Source file information unavailable.'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Source Function</span>
                                <span className="font-mono font-semibold text-gray-800">
                                    {errDetails?.sourceFunction || 'Function information unavailable.'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Request ID</span>
                                <span className="font-mono text-gray-800">
                                    {errDetails?.requestId || Array.from(inc?.relatedRequestIds || [])[0] || '—'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Trace ID</span>
                                <span className="font-mono text-blue-600">
                                    {errDetails?.traceId || Array.from(inc?.relatedTraceIds || [])[0] || '—'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Database Involved</span>
                                <span className="font-medium text-gray-800 capitalize">
                                    {errDetails?.database || (inv?.dependencies?.databaseInvolved ? 'MongoDB' : 'None')}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Error Category</span>
                                <span className="font-semibold text-gray-800 uppercase">
                                    {errDetails?.category || inc?.category || 'General'}
                                </span>
                            </div>
                        </div>

                        {/* Stack Trace Section */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Exception Stack Trace
                                </h3>
                                {errDetails?.stackTrace && (
                                    <button
                                        onClick={() => copyToClipboard(errDetails.stackTrace, 'stack-trace')}
                                        className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        {copiedKey === 'stack-trace' ? <CheckCheck className="w-3 h-3 mr-1 text-emerald-600" /> : <Copy className="w-3 h-3 mr-1" />}
                                        {copiedKey === 'stack-trace' ? 'Copied Stack Trace' : 'Copy Stack Trace'}
                                    </button>
                                )}
                            </div>

                            {errDetails?.stackTrace ? (
                                <pre className="p-4 rounded-xl bg-gray-900 text-gray-200 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed border border-gray-800">
                                    {errDetails.stackTrace}
                                </pre>
                            ) : (
                                <div className="p-6 rounded-xl bg-gray-50 border border-gray-200 text-center text-xs text-gray-500 italic">
                                    Source file information unavailable. Stack trace was not captured in this exception log.
                                </div>
                            )}
                            <p className="text-[11px] text-gray-400">
                                ✓ Sanitized: Sensitive credentials, bearer tokens, and session secrets are automatically scrubbed.
                            </p>
                        </div>
                    </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* TAB C: REQUEST & DISTRIBUTED TRACE                            */}
                {/* ------------------------------------------------------------- */}
                {activeTab === 'trace' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="text-base font-bold text-gray-900 flex items-center">
                                    <Layers className="w-5 h-5 mr-2 text-blue-600" />
                                    Correlated Distributed Trace & Waterfall
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Full request journey through microservices instrumented with OpenTelemetry.
                                </p>
                            </div>

                            {tracesSummary?.rootTraceId && (
                                <button
                                    onClick={() => navigate(`/traces?traceId=${tracesSummary.rootTraceId}`)}
                                    className="inline-flex items-center px-3 py-1.5 border border-blue-300 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition shadow-xs"
                                >
                                    Open in Traces Dashboard
                                    <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                                </button>
                            )}
                        </div>

                        {/* First Observed Failure Callout */}
                        {tracesSummary?.firstFailedSpan && (
                            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-950 space-y-1">
                                <div className="font-bold flex items-center text-rose-800">
                                    <AlertTriangle className="w-4 h-4 mr-1.5 text-rose-600" />
                                    First Observed Failure in Distributed Trace
                                </div>
                                <div className="font-mono text-gray-900">
                                    Span: <span className="font-semibold">{tracesSummary.firstFailedSpan.operationName}</span> on service <span className="font-semibold">{tracesSummary.firstFailedSpan.serviceName}</span> (Duration: {tracesSummary.firstFailedSpan.durationMs}ms)
                                </div>
                                <p className="text-[11px] text-rose-800 italic pt-1">
                                    Note: Inspect the full request path below to confirm whether this failure is the technical root cause or an upstream symptom.
                                </p>
                            </div>
                        )}

                        {/* Trace Waterfall Viewer */}
                        {tracesLoading ? (
                            <div className="py-12 text-center text-gray-500 text-xs">
                                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                                Loading correlated traces from OpenTelemetry storage...
                            </div>
                        ) : incidentTraces.length === 0 ? (
                            <div className="py-12 text-center text-gray-500 text-xs bg-gray-50 rounded-xl border border-gray-200">
                                No matching distributed traces found in OpenTelemetry storage for this incident window.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {incidentTraces.map((trace) => (
                                    <div key={trace.traceId} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between text-xs font-mono text-gray-600 pb-2 border-b border-gray-200">
                                            <div className="flex items-center space-x-2">
                                                <span className="font-bold text-gray-900">Trace:</span>
                                                <span className="text-blue-700 font-semibold">{trace.traceId}</span>
                                                <button
                                                    onClick={() => copyToClipboard(trace.traceId, `trace-${trace.traceId}`)}
                                                    className="text-gray-400 hover:text-gray-700"
                                                    title="Copy Trace ID"
                                                >
                                                    {copiedKey === `trace-${trace.traceId}` ? <CheckCheck className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                                </button>
                                            </div>
                                            <div className="flex items-center space-x-3 text-[11px]">
                                                <span>Duration: <strong className="text-gray-900">{trace.durationMs}ms</strong></span>
                                                <span>Spans: <strong className="text-gray-900">{trace.spans?.length || 0}</strong></span>
                                                <span className={`px-2 py-0.5 rounded font-bold uppercase ${trace.hasError ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                                    {trace.hasError ? 'Failed' : 'Success'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Spans Waterfall List */}
                                        <div className="space-y-1.5 pt-1">
                                            {(trace.spans || []).map((span) => {
                                                const isSelected = selectedSpan?.spanId === span.spanId;
                                                return (
                                                    <div
                                                        key={span.spanId}
                                                        onClick={() => setSelectedSpan(isSelected ? null : span)}
                                                        className={`p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                                                            isSelected ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-200 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between text-xs">
                                                            <div className="flex items-center space-x-2 min-w-0">
                                                                <span className="w-2 h-2 rounded-full shrink-0 bg-blue-500"></span>
                                                                <span className="font-semibold text-gray-800 truncate">{span.serviceName}</span>
                                                                <span className="text-gray-400 font-mono text-[11px] truncate">{span.operationName}</span>
                                                                {span.hasError && (
                                                                    <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-bold text-[10px] uppercase">
                                                                        Error
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="font-mono text-gray-500 text-[11px] shrink-0 ml-2">
                                                                {span.durationMs}ms
                                                            </span>
                                                        </div>

                                                        {/* Duration bar */}
                                                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2 overflow-hidden flex">
                                                            <div
                                                                style={{ width: `${Math.max(1, span.percentOffset || 0)}%` }}
                                                                className="h-full bg-transparent shrink-0"
                                                            ></div>
                                                            <div
                                                                style={{ width: `${Math.max(2, span.percentWidth || 5)}%` }}
                                                                className={`h-full rounded-full shrink-0 ${span.hasError ? 'bg-rose-500' : 'bg-blue-600'}`}
                                                            ></div>
                                                        </div>

                                                        {/* Expanded Span Details */}
                                                        {isSelected && (
                                                            <div className="mt-3 pt-3 border-t border-gray-200 text-xs font-mono space-y-1 text-gray-700 bg-gray-50 p-3 rounded">
                                                                <div>Span ID: <strong>{span.spanId}</strong></div>
                                                                {span.parentSpanId && <div>Parent Span ID: {span.parentSpanId}</div>}
                                                                <div>Start Time: {formatTimestamp(span.startTime)}</div>
                                                                <div className="mt-2 text-gray-900 font-bold">Span Tags:</div>
                                                                <pre className="text-[11px] bg-white p-2 rounded border border-gray-200 overflow-x-auto">
                                                                    {JSON.stringify(span.tags || {}, null, 2)}
                                                                </pre>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* TAB D: CORRELATED LOGS                                        */}
                {/* ------------------------------------------------------------- */}
                {activeTab === 'logs' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="text-base font-bold text-gray-900 flex items-center">
                                    <FileText className="w-5 h-5 mr-2 text-purple-600" />
                                    Correlated Application Logs
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Chronologically sorted logs matching trace IDs, request IDs, and service evaluation windows.
                                </p>
                            </div>

                            {/* Level Filters & Search */}
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg text-xs font-medium">
                                    {['ALL', 'ERROR', 'WARN', 'INFO'].map(lvl => (
                                        <button
                                            key={lvl}
                                            onClick={() => {
                                                setLogsFilter(lvl);
                                                fetchIncidentLogs(activeIncidentId, lvl, logsSearch, 1);
                                            }}
                                            className={`px-2.5 py-1 rounded-md transition ${logsFilter === lvl ? 'bg-white shadow-xs font-bold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                                        >
                                            {lvl}
                                        </button>
                                    ))}
                                </div>

                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Search logs..."
                                        value={logsSearch}
                                        onChange={(e) => {
                                            setLogsSearch(e.target.value);
                                            fetchIncidentLogs(activeIncidentId, logsFilter, e.target.value, 1);
                                        }}
                                        className="pl-8 pr-3 py-1 text-xs border border-gray-300 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Logs Table / List */}
                        {logsLoading ? (
                            <div className="py-12 text-center text-gray-500 text-xs">
                                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                                Querying correlated logs...
                            </div>
                        ) : incidentLogs.length === 0 ? (
                            <div className="py-12 text-center text-gray-500 text-xs bg-gray-50 rounded-xl border border-gray-200">
                                No logs matching the current filter.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {incidentLogs.map((l) => {
                                    const isErr = l.level === 'ERROR' || (l.statusCode && l.statusCode >= 500);
                                    const isWarn = l.level === 'WARN';
                                    const isExpanded = expandedLogId === l._id;

                                    return (
                                        <div
                                            key={l._id}
                                            onClick={() => setExpandedLogId(isExpanded ? null : l._id)}
                                            className={`p-3 rounded-lg border text-xs cursor-pointer transition font-mono ${
                                                isErr ? 'bg-rose-50/60 border-rose-200' : isWarn ? 'bg-amber-50/60 border-amber-200' : 'bg-gray-50 border-gray-200 hover:bg-gray-100/70'
                                            }`}
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex items-center space-x-2">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                        isErr ? 'bg-rose-200 text-rose-800' : isWarn ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-800'
                                                    }`}>
                                                        {l.level || 'INFO'}
                                                    </span>
                                                    <span className="text-gray-400 text-[11px]">{formatTimestamp(l.timestamp)}</span>
                                                    <span className="font-semibold text-gray-800 font-sans">{l.service}</span>
                                                    {l.route && <span className="text-blue-600">[{l.route}]</span>}
                                                </div>

                                                <div className="flex items-center space-x-2 text-[11px] text-gray-400">
                                                    {l.requestId && <span>req: {l.requestId.substring(0, 8)}...</span>}
                                                    {l.traceId && <span>trace: {l.traceId.substring(0, 8)}...</span>}
                                                </div>
                                            </div>

                                            <div className="mt-1 text-gray-900 font-medium break-words">
                                                {l.message}
                                            </div>

                                            {/* Expandable JSON Details */}
                                            {isExpanded && (
                                                <div className="mt-3 pt-2 border-t border-gray-200 bg-white p-3 rounded text-[11px] overflow-x-auto text-gray-800">
                                                    <div className="text-gray-400 font-sans mb-1 font-semibold">Structured Log Metadata:</div>
                                                    <pre>{JSON.stringify(l, null, 2)}</pre>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* TAB E: RELEVANT METRICS                                       */}
                {/* ------------------------------------------------------------- */}
                {activeTab === 'metrics' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
                        <div className="border-b border-gray-100 pb-4">
                            <h2 className="text-base font-bold text-gray-900 flex items-center">
                                <Activity className="w-5 h-5 mr-2 text-emerald-600" />
                                Correlated Metrics (Before, During, and After Incident)
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Comparison of application performance metrics scraped from Prometheus.
                            </p>
                        </div>

                        {/* Metric Comparison Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* HTTP Error Rate */}
                            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
                                <span className="text-xs font-semibold text-gray-500 uppercase">HTTP 5xx Error Rate</span>
                                <div className="text-2xl font-extrabold text-rose-600">
                                    {metricsSummary?.httpErrorRate?.during || '0.0%'}
                                </div>
                                <div className="text-xs text-gray-500 flex justify-between pt-1 border-t border-gray-200">
                                    <span>Before: <strong>{metricsSummary?.httpErrorRate?.before || '0.0%'}</strong></span>
                                    <span>After: <strong>{metricsSummary?.httpErrorRate?.after || '0.0%'}</strong></span>
                                </div>
                            </div>

                            {/* Response Latency */}
                            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
                                <span className="text-xs font-semibold text-gray-500 uppercase">Average Latency</span>
                                <div className="text-2xl font-extrabold text-amber-600">
                                    {metricsSummary?.avgLatencyMs?.during || '45ms'}
                                </div>
                                <div className="text-xs text-gray-500 flex justify-between pt-1 border-t border-gray-200">
                                    <span>Before: <strong>{metricsSummary?.avgLatencyMs?.before || '45ms'}</strong></span>
                                    <span>After: <strong>{metricsSummary?.avgLatencyMs?.after || '45ms'}</strong></span>
                                </div>
                            </div>

                            {/* Request Rate */}
                            <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
                                <span className="text-xs font-semibold text-gray-500 uppercase">Throughput Rate</span>
                                <div className="text-2xl font-extrabold text-blue-600">
                                    {metricsSummary?.requestRatePerSec?.during || '0.5 req/s'}
                                </div>
                                <div className="text-xs text-gray-500 flex justify-between pt-1 border-t border-gray-200">
                                    <span>Before: <strong>{metricsSummary?.requestRatePerSec?.before || '0.5 req/s'}</strong></span>
                                    <span>After: <strong>{metricsSummary?.requestRatePerSec?.after || '0.5 req/s'}</strong></span>
                                </div>
                            </div>
                        </div>

                        {/* Uninstrumented Metrics Section */}
                        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                            <div className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center">
                                <Info className="w-3.5 h-3.5 mr-1.5 text-gray-500" />
                                Uninstrumented Database & Runtime Metrics
                            </div>
                            <p className="text-xs text-gray-500">
                                The following metrics are not instrumented or unavailable from the underlying application runtime:
                            </p>
                            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                                {(metricsSummary?.uninstrumentedMetrics || []).map((m, idx) => (
                                    <li key={idx}>
                                        <span className="font-medium text-gray-800">{m}</span>: <span className="text-gray-400 italic">Metric not instrumented or unavailable.</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* TAB F: SERVICE DEPENDENCIES                                   */}
                {/* ------------------------------------------------------------- */}
                {activeTab === 'dependencies' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
                        <div className="border-b border-gray-100 pb-4">
                            <h2 className="text-base font-bold text-gray-900 flex items-center">
                                <Network className="w-5 h-5 mr-2 text-indigo-600" />
                                Service & Infrastructure Dependencies
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Topology of microservices and database calls implicated in this incident.
                            </p>
                        </div>

                        {/* Topology Call Relationships */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Communication Graph</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                {(dependencies?.serviceTopology || []).map((edge, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-3.5 rounded-xl border flex items-center justify-between ${
                                            edge.status === 'failing' || edge.status === 'timeout' || edge.status === 'refused'
                                                ? 'bg-rose-50 border-rose-200'
                                                : 'bg-gray-50 border-gray-200'
                                        }`}
                                    >
                                        <div className="flex items-center space-x-2">
                                            <span className="font-semibold text-gray-800">{edge.from}</span>
                                            <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                                            <span className="font-semibold text-gray-800">{edge.to}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                            edge.status === 'failing' ? 'bg-rose-200 text-rose-800' :
                                            edge.status === 'timeout' ? 'bg-amber-200 text-amber-800' :
                                            edge.status === 'refused' ? 'bg-rose-200 text-rose-800' :
                                            'bg-emerald-100 text-emerald-800'
                                        }`}>
                                            {edge.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Service Health at Incident Time */}
                        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Service Health Status</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                {Object.entries(dependencies?.serviceHealth || {}).map(([svc, info]) => (
                                    <div key={svc} className="p-3 bg-white rounded-lg border border-gray-200 flex items-center justify-between">
                                        <div>
                                            <div className="font-semibold text-gray-800">{SERVICE_LABELS[svc] || svc}</div>
                                            <div className="text-[11px] text-gray-400">Last Heartbeat: {timeAgo(info.lastHeartbeat)}</div>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                            info.status === 'healthy' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                        }`}>
                                            {info.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* TAB G: FAILURE INJECTION CORRELATION                          */}
                {/* ------------------------------------------------------------- */}
                {activeTab === 'simulation' && failureInj?.associated && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
                        <div className="border-b border-gray-100 pb-4">
                            <h2 className="text-base font-bold text-gray-900 flex items-center">
                                <Flame className="w-5 h-5 mr-2 text-amber-600" />
                                Associated Failure Injection Experiment
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Corroborated with active failure simulation testing from Phase 11.
                            </p>
                        </div>

                        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2">
                            <div className="flex items-center space-x-2">
                                <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-mono text-xs font-bold uppercase">
                                    {failureInj.scenarioName}
                                </span>
                                <span className="text-xs text-amber-800">Rule ID: {failureInj.failureId}</span>
                            </div>
                            <p className="text-xs text-amber-900">
                                This incident's technical anomalies correlate with an active failure simulation configured for{' '}
                                <strong>{failureInj.targetService}</strong> targeting <code>{failureInj.targetRoute}</code>.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                            <div>
                                <span className="text-gray-400 block">Failure Type</span>
                                <span className="font-semibold text-gray-800 uppercase">{failureInj.failureType}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Target Service</span>
                                <span className="font-semibold text-gray-800">{failureInj.targetService}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Activated At</span>
                                <span className="text-gray-800">{formatTimestamp(failureInj.activatedAt)}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">First Triggered</span>
                                <span className="text-gray-800">{formatTimestamp(failureInj.firstTriggeredAt)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Resolve Modal Dialog */}
                {resolveModalOpen && (
                    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex justify-center items-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6 space-y-4">
                            <h3 className="text-base font-bold text-gray-900">Confirm Incident Resolution</h3>
                            <p className="text-xs text-gray-500">
                                Are you sure you want to mark this incident as <strong>Resolved</strong>? Only developers can manually resolve incidents.
                            </p>
                            <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">
                                    Resolution Notes (Optional)
                                </label>
                                <textarea
                                    rows="3"
                                    placeholder="Explain root cause or remediation steps taken..."
                                    value={resolutionNotes}
                                    onChange={(e) => setResolutionNotes(e.target.value)}
                                    className="w-full p-2.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>
                            <div className="flex justify-end space-x-2 pt-2">
                                <button
                                    onClick={() => setResolveModalOpen(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleUpdateStatus('resolved', resolutionNotes)}
                                    disabled={statusUpdating}
                                    className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-xs"
                                >
                                    Confirm Resolution
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // =========================================================================
    // VIEW 2: INCIDENTS LIST DASHBOARD
    // =========================================================================
    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
                <div>
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-lg border border-rose-200">
                            <AlertOctagon className="w-6 h-6" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Incidents</h1>
                    </div>
                    <p className="text-gray-500 text-sm mt-1">
                        Automatically detected application issues with full evidence correlation and investigation tools.
                    </p>
                </div>

                <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <label className="flex items-center cursor-pointer select-none">
                        <input 
                            type="checkbox" 
                            checked={autoRefresh} 
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 relative"></div>
                        <span className="ml-2 text-xs font-medium text-gray-700">Auto-Refresh</span>
                    </label>

                    <button 
                        onClick={() => { setRefreshing(true); fetchStats(); fetchIncidents(); }}
                        disabled={refreshing}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition shadow-xs"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* 4 Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div 
                    onClick={() => { setStatusFilter('open'); setPage(1); }}
                    className={`cursor-pointer bg-white p-5 rounded-xl border transition-all shadow-xs hover:shadow-md ${statusFilter === 'open' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'}`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500">Open Incidents</span>
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-3xl font-extrabold text-gray-900">{stats.open}</span>
                        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            Active
                        </span>
                    </div>
                </div>

                <div 
                    onClick={() => { setSeverityFilter('critical'); setPage(1); }}
                    className={`cursor-pointer bg-white p-5 rounded-xl border transition-all shadow-xs hover:shadow-md ${severityFilter === 'critical' ? 'border-rose-500 ring-2 ring-rose-100' : 'border-gray-200'}`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500">Critical Incidents</span>
                        <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-3xl font-extrabold text-rose-600">{stats.critical}</span>
                        <span className="text-xs font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Immediate Action
                        </span>
                    </div>
                </div>

                <div 
                    onClick={() => { setSeverityFilter('high'); setPage(1); }}
                    className={`cursor-pointer bg-white p-5 rounded-xl border transition-all shadow-xs hover:shadow-md ${severityFilter === 'high' ? 'border-amber-500 ring-2 ring-amber-100' : 'border-gray-200'}`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500">High Incidents</span>
                        <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-3xl font-extrabold text-amber-600">{stats.high}</span>
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Degraded
                        </span>
                    </div>
                </div>

                <div 
                    onClick={() => { setStatusFilter('resolved'); setPage(1); }}
                    className={`cursor-pointer bg-white p-5 rounded-xl border transition-all shadow-xs hover:shadow-md ${statusFilter === 'resolved' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-gray-200'}`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500">Resolved Incidents</span>
                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-3xl font-extrabold text-emerald-600">{stats.resolved}</span>
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Resolved
                        </span>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg w-full md:w-auto">
                    {[
                        { id: 'ALL', label: 'All Incidents' },
                        { id: 'open', label: 'Open' },
                        { id: 'investigating', label: 'Investigating' },
                        { id: 'resolved', label: 'Resolved' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => { setStatusFilter(tab.id); setPage(1); }}
                            className={`flex-1 md:flex-initial px-3 py-1.5 text-xs font-medium rounded-md transition ${statusFilter === tab.id ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <select
                        value={severityFilter}
                        onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value="ALL">All Severities</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="warning">Warning</option>
                    </select>

                    <select
                        value={serviceFilter}
                        onChange={(e) => { setServiceFilter(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value="ALL">All Services</option>
                        <option value="payment-service">Payment Service</option>
                        <option value="order-service">Order Service</option>
                        <option value="product-service">Product Service</option>
                        <option value="cart-service">Cart Service</option>
                        <option value="intellishop-gateway">Gateway</option>
                    </select>

                    <div className="relative flex-1 sm:w-64">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search incidents..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Incidents Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-3.5">Severity</th>
                                <th className="px-6 py-3.5">Incident Title</th>
                                <th className="px-6 py-3.5">Primary Service</th>
                                <th className="px-6 py-3.5">Status</th>
                                <th className="px-6 py-3.5">Occurrences</th>
                                <th className="px-6 py-3.5">First Detected</th>
                                <th className="px-6 py-3.5">Last Seen</th>
                                <th className="px-6 py-3.5 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {loading && incidents.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                                        <span className="text-xs">Loading incidents...</span>
                                    </td>
                                </tr>
                            ) : incidents.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-16 text-center">
                                        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-200 text-emerald-600 mx-auto mb-3">
                                            <CheckCircle className="w-6 h-6" />
                                        </div>
                                        <div className="text-base font-semibold text-gray-900">
                                            No incidents detected. Application operating normally.
                                        </div>
                                        <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
                                            Automatic Incident Detection is actively monitoring real telemetry.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                incidents.map((inc) => {
                                    const sev = SEVERITY_STYLES[inc.severity] || SEVERITY_STYLES.warning;
                                    const stat = STATUS_STYLES[inc.status] || STATUS_STYLES.open;

                                    return (
                                        <tr 
                                            key={inc.incidentId}
                                            onClick={() => handleSelectIncident(inc.incidentId)}
                                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${sev.badge}`}>
                                                    <span className={`w-1.5 h-1.5 mr-1.5 rounded-full ${sev.dot}`}></span>
                                                    {inc.severity}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-semibold text-gray-900">{inc.title}</div>
                                                <div className="text-xs text-gray-500 font-mono mt-0.5 flex items-center space-x-2">
                                                    <span>{inc.incidentId}</span>
                                                    <span>•</span>
                                                    <span className="uppercase text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                                        {inc.category}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                                    {SERVICE_LABELS[inc.primaryService] || inc.primaryService}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${stat.badge}`}>
                                                    {inc.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-700">
                                                {inc.occurrenceCount || 1}x
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                                                {formatTimestamp(inc.firstDetectedAt)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                                                <div className="font-medium text-gray-700">{timeAgo(inc.lastDetectedAt)}</div>
                                                <div className="text-[10px] text-gray-400">{formatTimestamp(inc.lastDetectedAt)}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSelectIncident(inc.incidentId);
                                                    }}
                                                    className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-semibold text-blue-600 bg-white hover:bg-blue-50 shadow-xs transition"
                                                >
                                                    <Eye className="w-3.5 h-3.5 mr-1" />
                                                    Investigate
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
                        <div>
                            Showing page <strong className="text-gray-900">{page}</strong> of <strong className="text-gray-900">{totalPages}</strong> ({total} total incidents)
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-100 disabled:opacity-50 font-medium"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-100 disabled:opacity-50 font-medium"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
