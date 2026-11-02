import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    AlertOctagon, AlertTriangle, CheckCircle, Clock, Search, 
    RefreshCw, Filter, ArrowRight, X, ShieldAlert,
    Activity, Check, Eye, HelpCircle,
    ArrowLeft, Copy, Terminal, Network,
    Info, ChevronDown, CheckCheck, Server, Database
} from 'lucide-react';
import api from '../api';

const SERVICE_LABELS = {
    'intellishop-gateway': 'API Gateway',
    'product-service': 'Product Service',
    'cart-service': 'Cart Service',
    'order-service': 'Order Service',
    'payment-service': 'Payment Service',
    'mongodb': 'MongoDB'
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

    // Investigation State (Only 3 sections: 'overview', 'error', 'dependencies')
    const [activeIncidentId, setActiveIncidentId] = useState(paramIncidentId || null);
    const [investigationData, setInvestigationData] = useState(null);
    const [investigationLoading, setInvestigationLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'error' | 'dependencies'

    // Status update modal & copy controls
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

    // Synchronize active incident with URL param
    useEffect(() => {
        if (paramIncidentId) {
            setActiveIncidentId(paramIncidentId);
        } else {
            setActiveIncidentId(null);
        }
    }, [paramIncidentId]);

    // Fetch Stats for Overview Dashboard
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

    // Sync on filter or route changes
    useEffect(() => {
        if (!activeIncidentId) {
            fetchStats();
            fetchIncidents();
        } else {
            fetchInvestigation(activeIncidentId);
        }
    }, [activeIncidentId, statusFilter, severityFilter, serviceFilter, page]);

    // Search debounce on list
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
        setActiveTab('overview');
        navigate(`/incidents/${incidentId}`);
    };

    const handleBackToList = () => {
        setActiveIncidentId(null);
        setInvestigationData(null);
        navigate('/incidents');
    };

    // =========================================================================
    // VIEW 1: SIMPLIFIED INCIDENT INVESTIGATION WORKSPACE (3 SECTIONS ONLY)
    // =========================================================================
    if (activeIncidentId) {
        const inc = investigationData?.incident;
        const inv = investigationData?.investigation;
        const errDetails = inv?.actualError;
        const deps = inv?.dependencies;
        const relevantDeps = deps?.relevantDependencies || [];
        const confirmed = inv?.confirmedFindings || inv?.confirmedObservations || [];
        const suspected = inv?.suspectedCauses || inv?.suspectedExplanations || [];
        const missing = inv?.missingInformation || inv?.missingEvidence || [];

        const sev = SEVERITY_STYLES[inc?.severity] || SEVERITY_STYLES.warning;
        const stat = STATUS_STYLES[inc?.status] || STATUS_STYLES.open;

        return (
            <div className="p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
                {/* 1. Incident Header */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs space-y-4">
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
                            <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded border border-gray-200">
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

                        {/* Lifecycle Status Actions */}
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
                                title="Refresh investigation"
                            >
                                <RefreshCw className={`w-4 h-4 ${investigationLoading ? 'animate-spin text-blue-600' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Incident Title & Metadata */}
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                            {inc?.title || 'Loading incident investigation...'}
                        </h1>
                        <div className="mt-2 flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-gray-500">
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
                                    Telemetry Healthy (Manual Developer Resolution Required)
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Navigation Tabs — Exactly Three Sections */}
                <div className="flex border-b border-gray-200 space-x-2 bg-white px-4 rounded-xl shadow-xs">
                    {[
                        { id: 'overview', label: 'Overview & Evidence', icon: AlertOctagon },
                        { id: 'error', label: 'Actual Error', icon: Terminal },
                        { id: 'dependencies', label: 'Dependencies', icon: Network }
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center space-x-2 py-3.5 px-4 border-b-2 text-xs font-semibold transition-colors ${
                                    isActive
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* 3. Section Content */}
                {/* ------------------------------------------------------------- */}
                {/* SECTION A: OVERVIEW & EVIDENCE                                */}
                {/* ------------------------------------------------------------- */}
                {activeTab === 'overview' && (
                    <div className="space-y-5">
                        {/* Technical Evidence Summary */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
                            <div>
                                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center">
                                    <AlertOctagon className="w-4 h-4 mr-1.5 text-blue-600" />
                                    Technical Evidence Summary
                                </h2>
                            </div>

                            <div className="text-sm text-gray-800 bg-gray-50 p-4 rounded-lg border border-gray-200 leading-relaxed font-sans font-medium">
                                {inv?.summaryText || inc?.description || 'Collecting and evaluating incident telemetry...'}
                            </div>

                            {/* Confirmed Technical Findings */}
                            <div className="pt-2 space-y-2">
                                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center">
                                    <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                                    Confirmed Technical Findings
                                </h3>
                                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2">
                                    {confirmed.length > 0 ? (
                                        <ul className="space-y-1.5 text-xs text-emerald-950">
                                            {confirmed.map((obs, idx) => (
                                                <li key={idx} className="flex items-start">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 mr-2 shrink-0"></span>
                                                    <span>{obs}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-emerald-800 italic">No confirmed findings recorded.</p>
                                    )}
                                </div>
                            </div>

                            {/* Suspected Technical Cause (Only when applicable) */}
                            {suspected.length > 0 && (
                                <div className="pt-1 space-y-2">
                                    <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center">
                                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                                        Suspected Cause
                                    </h3>
                                    <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-1.5">
                                        <ul className="space-y-1.5 text-xs text-amber-950">
                                            {suspected.map((cause, idx) => (
                                                <li key={idx} className="flex items-start">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 mr-2 shrink-0"></span>
                                                    <span>{cause}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Relevant Missing Information (Only when applicable) */}
                            {missing.length > 0 && (
                                <div className="pt-1 space-y-2">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center">
                                        <Info className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                                        Missing Information
                                    </h3>
                                    <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50 space-y-1">
                                        <ul className="space-y-1 text-xs text-gray-600">
                                            {missing.map((item, idx) => (
                                                <li key={idx} className="flex items-start">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 mr-2 shrink-0"></span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* SECTION B: ACTUAL ERROR                                       */}
                {/* ------------------------------------------------------------- */}
                {activeTab === 'error' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                            <div>
                                <h2 className="text-base font-bold text-gray-900 flex items-center">
                                    <Terminal className="w-5 h-5 mr-2 text-rose-600" />
                                    Actual Technical Error
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Extracted from structured error telemetry and exception logs.
                                </p>
                            </div>

                            <button
                                onClick={() => copyToClipboard(errDetails?.errorMessage, 'err-msg')}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition shadow-xs"
                            >
                                {copiedKey === 'err-msg' ? <CheckCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                                {copiedKey === 'err-msg' ? 'Copied Error!' : 'Copy Error'}
                            </button>
                        </div>

                        {/* Error Banner */}
                        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-2">
                            <div className="flex items-center space-x-2">
                                <span className="px-2.5 py-0.5 rounded bg-rose-200 text-rose-900 font-mono text-xs font-bold uppercase">
                                    {errDetails?.errorType || 'Application Error'}
                                </span>
                                {errDetails?.statusCode && (
                                    <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-900 font-mono text-xs font-bold">
                                        HTTP {errDetails.statusCode}
                                    </span>
                                )}
                            </div>
                            <div className="font-mono text-sm font-semibold break-words">
                                {errDetails?.errorMessage || 'Exact technical error information is unavailable.'}
                            </div>
                        </div>

                        {/* Error Properties Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                            <div>
                                <span className="text-gray-400 block font-medium">Originating Service</span>
                                <span className="font-semibold text-rose-700">
                                    {SERVICE_LABELS[errDetails?.originatingService] || errDetails?.originatingService || SERVICE_LABELS[inc?.primaryService] || inc?.primaryService}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">Affected Service</span>
                                <span className="font-semibold text-gray-800">
                                    {SERVICE_LABELS[errDetails?.service] || errDetails?.service || SERVICE_LABELS[inc?.primaryService] || inc?.primaryService}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">Reporting Service</span>
                                <span className="font-medium text-gray-700">
                                    {SERVICE_LABELS[errDetails?.reportingService] || errDetails?.reportingService || '—'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">API Endpoint & Method</span>
                                <span className="font-mono font-semibold text-gray-800">
                                    {errDetails?.route ? `${errDetails?.method || 'GET'} ${errDetails.route}` : 'Endpoint information unavailable'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">Source File</span>
                                <span className="font-mono font-semibold text-gray-800 break-all" title={errDetails?.sourceFile}>
                                    {errDetails?.sourceFile && errDetails.sourceFile !== 'Source file information unavailable.'
                                        ? `${errDetails.sourceFile}${errDetails.lineNumber != null ? `:${errDetails.lineNumber}${errDetails.columnNumber != null ? `:${errDetails.columnNumber}` : ''}` : ''}`
                                        : 'Source file information unavailable.'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">Function Name</span>
                                <span className="font-mono font-semibold text-gray-800">
                                    {errDetails?.sourceFunction || 'Function information unavailable.'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">Line Number</span>
                                <span className="font-mono font-semibold text-gray-800">
                                    {errDetails?.lineNumber != null ? errDetails.lineNumber : 'Line information unavailable.'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">HTTP Status</span>
                                <span className="font-bold text-gray-800">
                                    {errDetails?.statusCode || '—'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">Database / Dependency</span>
                                <span className="font-semibold text-gray-800">
                                    {errDetails?.database || (deps?.databaseInvolved ? 'MongoDB' : 'Not involved')}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">Error Category</span>
                                <span className="font-semibold text-gray-800 uppercase tracking-wider text-[11px] bg-gray-200/80 px-2 py-0.5 rounded inline-block">
                                    {errDetails?.category || 'internal_error'}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">Timestamp</span>
                                <span className="text-gray-700">
                                    {formatTimestamp(errDetails?.timestamp || inc?.lastDetectedAt)}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block font-medium">Trace ID</span>
                                <span className="font-mono text-gray-600 truncate block" title={errDetails?.traceId || inc?.relatedTraceIds?.[0] || '—'}>
                                    {errDetails?.traceId || inc?.relatedTraceIds?.[0] || '—'}
                                </span>
                            </div>
                        </div>

                        {/* Stack Trace */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Stack Trace
                                </h3>
                                {errDetails?.stackTrace && (
                                    <button
                                        onClick={() => copyToClipboard(errDetails.stackTrace, 'stack-trace')}
                                        className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 font-semibold"
                                    >
                                        {copiedKey === 'stack-trace' ? <CheckCheck className="w-3 h-3 mr-1 text-emerald-600" /> : <Copy className="w-3 h-3 mr-1" />}
                                        {copiedKey === 'stack-trace' ? 'Copied Stack Trace' : 'Copy Stack Trace'}
                                    </button>
                                )}
                            </div>

                            {errDetails?.stackTrace ? (
                                <pre className="p-4 rounded-xl bg-gray-900 text-gray-100 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed border border-gray-800">
                                    {errDetails.stackTrace}
                                </pre>
                            ) : (
                                <div className="p-6 rounded-xl bg-gray-50 border border-gray-200 text-center text-xs text-gray-500 italic">
                                    Stack trace unavailable.
                                </div>
                            )}
                            <p className="text-[11px] text-gray-400">
                                ✓ Sanitized: Credentials, bearer tokens, and session secrets are automatically scrubbed.
                            </p>
                        </div>
                    </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* SECTION C: DEPENDENCIES                                       */}
                {/* ------------------------------------------------------------- */}
                {activeTab === 'dependencies' && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-6">
                        <div className="border-b border-gray-100 pb-4">
                            <h2 className="text-base font-bold text-gray-900 flex items-center">
                                <Network className="w-5 h-5 mr-2 text-indigo-600" />
                                Incident Dependencies
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Only services and infrastructure dependencies technically involved in this failure.
                            </p>
                        </div>

                        {/* Dependency Cards List */}
                        <div className="space-y-3">
                            {relevantDeps.length > 0 ? (
                                relevantDeps.map((dep, idx) => {
                                    const isPrimary = dep.relationship === 'Primary Failing Service';
                                    const isDownstream = dep.relationship === 'Affected Downstream Service';
                                    const isDatabase = dep.type === 'database';

                                    let badgeStyle = 'bg-gray-100 text-gray-700 border-gray-300';
                                    let cardBg = 'bg-gray-50 border-gray-200';

                                    if (isPrimary || dep.isFailing) {
                                        badgeStyle = 'bg-rose-100 text-rose-800 border-rose-300';
                                        cardBg = 'bg-rose-50/50 border-rose-200';
                                    } else if (isDownstream) {
                                        badgeStyle = 'bg-amber-100 text-amber-800 border-amber-300';
                                        cardBg = 'bg-amber-50/40 border-amber-200';
                                    } else if (isDatabase) {
                                        badgeStyle = dep.isFailing ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-blue-100 text-blue-800 border-blue-300';
                                        cardBg = dep.isFailing ? 'bg-rose-50/50 border-rose-200' : 'bg-gray-50 border-gray-200';
                                    }

                                    return (
                                        <div key={idx} className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${cardBg}`}>
                                            <div className="flex items-start space-x-3">
                                                <div className="p-2 rounded-lg bg-white border border-gray-200 text-gray-700 mt-0.5">
                                                    {isDatabase ? <Database className="w-4 h-4 text-emerald-600" /> : <Server className="w-4 h-4 text-blue-600" />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center space-x-2">
                                                        <span className="font-bold text-gray-900 text-sm">{dep.name}</span>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${badgeStyle}`}>
                                                            {dep.relationship}
                                                        </span>
                                                    </div>
                                                    {dep.errorDetails && (
                                                        <p className="text-xs text-rose-800 font-mono mt-1 font-medium">
                                                            {dep.errorDetails}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center space-x-3 text-xs self-end sm:self-auto">
                                                <span className="text-gray-400">Health:</span>
                                                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${
                                                    dep.healthStatus === 'healthy' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                    {dep.healthStatus || 'degraded'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="p-6 text-center text-xs text-gray-500 italic bg-gray-50 rounded-xl border border-gray-200">
                                    No external service dependencies implicated in this failure.
                                </div>
                            )}
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
                        Automatically detected application issues requiring investigation and developer resolution.
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
