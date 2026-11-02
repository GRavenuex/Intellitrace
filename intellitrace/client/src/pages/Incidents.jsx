import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    AlertOctagon, AlertTriangle, CheckCircle, Clock, Search, 
    RefreshCw, Filter, ArrowRight, ExternalLink, X, ShieldAlert,
    Activity, ChevronRight, Check, Eye, HelpCircle, Layers, Flame
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

    const [incidents, setIncidents] = useState([]);
    const [stats, setStats] = useState({ total: 0, open: 0, investigating: 0, resolved: 0, critical: 0, high: 0, warning: 0 });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [severityFilter, setSeverityFilter] = useState('ALL');
    const [serviceFilter, setServiceFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Detail Modal State
    const [selectedIncident, setSelectedIncident] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [resolveConfirmOpen, setResolveConfirmOpen] = useState(false);
    const [resolutionNotes, setResolutionNotes] = useState('');

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

    // Handle Route Param (direct link to incident)
    useEffect(() => {
        if (paramIncidentId) {
            handleOpenDetail(paramIncidentId);
        }
    }, [paramIncidentId]);

    // Initial Load & Filter Change
    useEffect(() => {
        fetchStats();
        fetchIncidents();
    }, [statusFilter, severityFilter, serviceFilter, page]);

    // Search debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            fetchIncidents();
        }, 350);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Auto Refresh Interval (every 12 seconds)
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            fetchStats();
            fetchIncidents();
            // Also refresh active incident details if open
            if (selectedIncident) {
                api.get(`/incidents/${selectedIncident.incidentId}`).then(res => {
                    if (res.data?.success) setSelectedIncident(res.data.data);
                }).catch(() => {});
            }
        }, 12000);
        return () => clearInterval(interval);
    }, [autoRefresh, statusFilter, severityFilter, serviceFilter, page, searchQuery, selectedIncident]);

    const handleManualRefresh = () => {
        setRefreshing(true);
        fetchStats();
        fetchIncidents();
    };

    const handleOpenDetail = async (incidentId) => {
        setDetailLoading(true);
        try {
            const res = await api.get(`/incidents/${incidentId}`);
            if (res.data?.success) {
                setSelectedIncident(res.data.data);
                setResolveConfirmOpen(false);
                setResolutionNotes('');
            }
        } catch (err) {
            console.error('Failed to load incident detail:', err);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleCloseDetail = () => {
        setSelectedIncident(null);
        setResolveConfirmOpen(false);
        if (paramIncidentId) {
            navigate('/incidents');
        }
    };

    const handleUpdateStatus = async (newStatus, notes = '') => {
        if (!selectedIncident) return;
        setStatusUpdating(true);
        try {
            const res = await api.patch(`/incidents/${selectedIncident.incidentId}/status`, {
                status: newStatus,
                notes
            });
            if (res.data?.success) {
                setSelectedIncident(res.data.data);
                setResolveConfirmOpen(false);
                setResolutionNotes('');
                fetchStats();
                fetchIncidents();
            }
        } catch (err) {
            console.error('Failed to update status:', err);
        } finally {
            setStatusUpdating(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* ============================================================= */}
            {/* SECTION A: PAGE HEADER                                        */}
            {/* ============================================================= */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
                <div>
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-lg border border-rose-200">
                            <AlertOctagon className="w-6 h-6" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Incidents</h1>
                    </div>
                    <p className="text-gray-500 text-sm mt-1">
                        Automatically detected application issues requiring attention.
                    </p>
                </div>

                <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <div className="flex items-center space-x-2">
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
                    </div>

                    <div className="text-xs text-gray-500 hidden sm:block">
                        Updated {timeAgo(lastUpdated)}
                    </div>

                    <button 
                        onClick={handleManualRefresh}
                        disabled={refreshing}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition shadow-sm"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* ============================================================= */}
            {/* SECTION B: 4 SUMMARY CARDS                                    */}
            {/* ============================================================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Open Incidents */}
                <div 
                    onClick={() => { setStatusFilter('open'); setPage(1); }}
                    className={`cursor-pointer bg-white p-5 rounded-xl border transition-all shadow-sm hover:shadow-md ${statusFilter === 'open' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'}`}
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

                {/* 2. Critical Incidents */}
                <div 
                    onClick={() => { setSeverityFilter('critical'); setPage(1); }}
                    className={`cursor-pointer bg-white p-5 rounded-xl border transition-all shadow-sm hover:shadow-md ${severityFilter === 'critical' ? 'border-rose-500 ring-2 ring-rose-100' : 'border-gray-200'}`}
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

                {/* 3. High Incidents */}
                <div 
                    onClick={() => { setSeverityFilter('high'); setPage(1); }}
                    className={`cursor-pointer bg-white p-5 rounded-xl border transition-all shadow-sm hover:shadow-md ${severityFilter === 'high' ? 'border-amber-500 ring-2 ring-amber-100' : 'border-gray-200'}`}
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

                {/* 4. Resolved Incidents */}
                <div 
                    onClick={() => { setStatusFilter('resolved'); setPage(1); }}
                    className={`cursor-pointer bg-white p-5 rounded-xl border transition-all shadow-sm hover:shadow-md ${statusFilter === 'resolved' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-gray-200'}`}
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

            {/* ============================================================= */}
            {/* SECTION C: FILTERS & SEARCH                                   */}
            {/* ============================================================= */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                {/* Status Tabs */}
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
                            className={`flex-1 md:flex-initial px-3 py-1.5 text-xs font-medium rounded-md transition ${statusFilter === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Dropdown Filters & Search */}
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {/* Severity Select */}
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

                    {/* Service Select */}
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

                    {/* Search Input */}
                    <div className="relative flex-1 sm:w-64">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search incidents or services..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ============================================================= */}
            {/* SECTION D: INCIDENT TABLE                                     */}
            {/* ============================================================= */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <tr>
                                <th scope="col" className="px-6 py-3.5">Severity</th>
                                <th scope="col" className="px-6 py-3.5">Incident</th>
                                <th scope="col" className="px-6 py-3.5">Service</th>
                                <th scope="col" className="px-6 py-3.5">Status</th>
                                <th scope="col" className="px-6 py-3.5">Occurrences</th>
                                <th scope="col" className="px-6 py-3.5">First Detected</th>
                                <th scope="col" className="px-6 py-3.5">Last Seen</th>
                                <th scope="col" className="px-6 py-3.5 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {loading && incidents.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center justify-center space-y-2">
                                            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                                            <span className="text-xs">Loading incidents...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : incidents.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center justify-center space-y-3">
                                            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-200 text-emerald-600">
                                                <CheckCircle className="w-6 h-6" />
                                            </div>
                                            <div className="text-base font-semibold text-gray-900">
                                                No incidents detected. Your application is operating normally.
                                            </div>
                                            <p className="text-xs text-gray-500 max-w-sm">
                                                The Automatic Incident Detection Engine continuously monitors telemetry and will alert when abnormal conditions occur.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                incidents.map((inc) => {
                                    const sev = SEVERITY_STYLES[inc.severity] || SEVERITY_STYLES.warning;
                                    const stat = STATUS_STYLES[inc.status] || STATUS_STYLES.open;

                                    return (
                                        <tr 
                                            key={inc.incidentId}
                                            onClick={() => handleOpenDetail(inc.incidentId)}
                                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                                        >
                                            {/* Severity */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${sev.badge}`}>
                                                    <span className={`w-1.5 h-1.5 mr-1.5 rounded-full ${sev.dot}`}></span>
                                                    {inc.severity}
                                                </span>
                                            </td>

                                            {/* Incident Title & ID */}
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

                                            {/* Primary Service */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                                    {SERVICE_LABELS[inc.primaryService] || inc.primaryService}
                                                </span>
                                            </td>

                                            {/* Status */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${stat.badge}`}>
                                                    {inc.status}
                                                </span>
                                            </td>

                                            {/* Occurrences */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                                                    {inc.occurrenceCount || 1}x
                                                </span>
                                            </td>

                                            {/* First Detected */}
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                                                {formatTimestamp(inc.firstDetectedAt)}
                                            </td>

                                            {/* Last Seen */}
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                                                <div className="font-medium text-gray-700">{timeAgo(inc.lastDetectedAt)}</div>
                                                <div className="text-[10px] text-gray-400">{formatTimestamp(inc.lastDetectedAt)}</div>
                                            </td>

                                            {/* Action */}
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenDetail(inc.incidentId);
                                                    }}
                                                    className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-100 shadow-sm transition"
                                                >
                                                    <Eye className="w-3.5 h-3.5 mr-1" />
                                                    View Details
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
                        <div>
                            Showing page <span className="font-semibold text-gray-900">{page}</span> of <span className="font-semibold text-gray-900">{totalPages}</span> ({total} total incidents)
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

            {/* ============================================================= */}
            {/* SECTION E: INCIDENT DETAIL MODAL / DRAWER                     */}
            {/* ============================================================= */}
            {selectedIncident && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex justify-center items-start p-4 sm:p-6 md:p-10">
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl overflow-hidden my-auto animate-in fade-in duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between bg-gray-50/50">
                            <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${SEVERITY_STYLES[selectedIncident.severity]?.badge}`}>
                                        <span className={`w-1.5 h-1.5 mr-1.5 rounded-full ${SEVERITY_STYLES[selectedIncident.severity]?.dot}`}></span>
                                        {selectedIncident.severity}
                                    </span>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${STATUS_STYLES[selectedIncident.status]?.badge}`}>
                                        {selectedIncident.status}
                                    </span>
                                    <span className="text-xs font-mono text-gray-500 font-semibold bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                                        {selectedIncident.incidentId}
                                    </span>
                                </div>
                                <h2 className="text-xl font-bold text-gray-900 mt-1">
                                    {selectedIncident.title}
                                </h2>
                            </div>

                            <button 
                                onClick={handleCloseDetail}
                                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                            {/* Summary description & metrics */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</h3>
                                <p className="text-sm text-gray-800 leading-relaxed">
                                    {selectedIncident.description}
                                </p>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200 text-xs">
                                    <div>
                                        <span className="text-gray-500 block">First Detected</span>
                                        <span className="font-medium text-gray-900">{formatTimestamp(selectedIncident.firstDetectedAt)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block">Last Seen</span>
                                        <span className="font-medium text-gray-900">{formatTimestamp(selectedIncident.lastDetectedAt)}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block">Occurrences</span>
                                        <span className="font-semibold text-gray-900">{selectedIncident.occurrenceCount || 1} times</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block">Detection Rule</span>
                                        <span className="font-mono text-gray-900">{selectedIncident.ruleId}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Affected Services */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Affected Services</h3>
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                                        <span className="w-2 h-2 mr-2 rounded-full bg-rose-500"></span>
                                        Primary: {SERVICE_LABELS[selectedIncident.primaryService] || selectedIncident.primaryService}
                                    </div>

                                    {(selectedIncident.affectedServices || [])
                                        .filter(s => s !== selectedIncident.primaryService)
                                        .map(svc => (
                                            <div key={svc} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                                                <ArrowRight className="w-3 h-3 mr-1.5 text-gray-400" />
                                                Impacted: {SERVICE_LABELS[svc] || svc}
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>

                            {/* Chronological Timeline */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Lifecycle Timeline</h3>
                                <div className="border-l-2 border-gray-200 ml-3 space-y-4">
                                    {(selectedIncident.timeline || []).map((event, idx) => (
                                        <div key={idx} className="relative pl-6">
                                            {/* Node icon */}
                                            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                                            </div>
                                            <div className="text-xs font-semibold text-gray-900">
                                                {event.message}
                                            </div>
                                            <div className="text-[11px] text-gray-400 mt-0.5 flex items-center space-x-2">
                                                <span>{formatTimestamp(event.timestamp)}</span>
                                                <span>•</span>
                                                <span className="capitalize">Actor: {event.actor || 'system'}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Supporting Evidence */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Supporting Evidence</h3>
                                <div className="space-y-3">
                                    {/* Metric summary */}
                                    {selectedIncident.evidence && Object.keys(selectedIncident.evidence).length > 0 && (
                                        <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 text-xs">
                                            <div className="font-semibold text-gray-700 mb-1">Detected Conditions & Metrics:</div>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-600">
                                                {selectedIncident.evidence.errorCount !== undefined && (
                                                    <div>Errors: <span className="font-semibold text-gray-900">{selectedIncident.evidence.errorCount}</span></div>
                                                )}
                                                {selectedIncident.evidence.errorRatePercent !== undefined && (
                                                    <div>Error Rate: <span className="font-semibold text-gray-900">{selectedIncident.evidence.errorRatePercent}%</span></div>
                                                )}
                                                {selectedIncident.evidence.avgLatencyMs !== undefined && (
                                                    <div>Avg Latency: <span className="font-semibold text-gray-900">{selectedIncident.evidence.avgLatencyMs}ms</span></div>
                                                )}
                                                {selectedIncident.evidence.observedRequestsInWindow !== undefined && (
                                                    <div>Requests in Window: <span className="font-semibold text-gray-900">{selectedIncident.evidence.observedRequestsInWindow}</span></div>
                                                )}
                                                {selectedIncident.evidence.databaseType && (
                                                    <div>Database: <span className="font-semibold text-gray-900">{selectedIncident.evidence.databaseType}</span></div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Related Distributed Traces */}
                                    {(selectedIncident.relatedTraceIds || []).length > 0 && (
                                        <div className="p-3.5 bg-blue-50/60 rounded-lg border border-blue-200 text-xs">
                                            <div className="font-semibold text-blue-900 mb-1.5 flex items-center justify-between">
                                                <span>Related Distributed Traces ({selectedIncident.relatedTraceIds.length})</span>
                                                <span className="text-[10px] text-blue-600">Click to view in Traces</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {selectedIncident.relatedTraceIds.map(traceId => (
                                                    <button
                                                        key={traceId}
                                                        onClick={() => {
                                                            navigate(`/traces?search=${encodeURIComponent(traceId)}`);
                                                        }}
                                                        className="inline-flex items-center px-2 py-1 rounded bg-white text-blue-700 border border-blue-300 hover:bg-blue-100 transition font-mono text-[11px]"
                                                    >
                                                        {traceId.substring(0, 16)}...
                                                        <ExternalLink className="w-3 h-3 ml-1 text-blue-500" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Error logs snippet */}
                                    {selectedIncident.evidence?.recentLogs && selectedIncident.evidence.recentLogs.length > 0 && (
                                        <div className="p-3.5 bg-gray-900 text-gray-100 rounded-lg text-xs font-mono space-y-1.5">
                                            <div className="text-gray-400 font-semibold text-[11px] pb-1 border-b border-gray-800 flex items-center justify-between">
                                                <span>Recent Correlated Error Logs</span>
                                                <button
                                                    onClick={() => navigate(`/logs?application=${encodeURIComponent(selectedIncident.primaryService)}`)}
                                                    className="text-blue-400 hover:text-blue-300 font-sans flex items-center"
                                                >
                                                    Open Logs Dashboard <ExternalLink className="w-3 h-3 ml-1" />
                                                </button>
                                            </div>
                                            {selectedIncident.evidence.recentLogs.slice(0, 3).map((l, idx) => (
                                                <div key={idx} className="truncate">
                                                    <span className="text-rose-400">[{l.level || 'ERROR'}]</span>{' '}
                                                    <span className="text-gray-400">{formatTimestamp(l.timestamp)}</span>{' '}
                                                    <span className="text-gray-200">{l.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Failure Injection details if applicable */}
                                    {selectedIncident.failureInjectionId && (
                                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 flex items-start space-x-2">
                                            <Flame className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                            <div>
                                                <span className="font-semibold">Corroborated Simulation:</span> Rule{' '}
                                                <span className="font-mono font-medium">{selectedIncident.failureInjectionId}</span> (Type:{' '}
                                                <span className="font-semibold uppercase">{selectedIncident.failureInjectionDetails?.type || 'Simulation'}</span>).
                                                <div className="text-[11px] text-amber-700 mt-0.5">
                                                    Incident was confirmed through actual observed system telemetry.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Resolution Notes (if resolved) */}
                            {selectedIncident.resolutionNotes && (
                                <div className="p-3.5 bg-emerald-50 rounded-lg border border-emerald-200 text-xs">
                                    <span className="font-semibold text-emerald-800 block">Resolution Notes:</span>
                                    <p className="text-emerald-900 mt-1">{selectedIncident.resolutionNotes}</p>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer / Actions */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                {resolveConfirmOpen ? (
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="text"
                                            placeholder="Optional resolution notes..."
                                            value={resolutionNotes}
                                            onChange={(e) => setResolutionNotes(e.target.value)}
                                            className="px-3 py-1.5 border border-gray-300 rounded text-xs w-64 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                        />
                                        <button
                                            onClick={() => handleUpdateStatus('resolved', resolutionNotes)}
                                            disabled={statusUpdating}
                                            className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 transition"
                                        >
                                            Confirm Resolution
                                        </button>
                                        <button
                                            onClick={() => setResolveConfirmOpen(false)}
                                            className="px-2 py-1.5 text-gray-500 hover:text-gray-700 text-xs font-medium"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center space-x-2">
                                        {selectedIncident.status === 'open' && (
                                            <button
                                                onClick={() => handleUpdateStatus('investigating')}
                                                disabled={statusUpdating}
                                                className="px-3.5 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 transition shadow-sm"
                                            >
                                                Mark as Investigating
                                            </button>
                                        )}
                                        {selectedIncident.status !== 'resolved' && (
                                            <button
                                                onClick={() => setResolveConfirmOpen(true)}
                                                disabled={statusUpdating}
                                                className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition shadow-sm"
                                            >
                                                Resolve Incident
                                            </button>
                                        )}
                                        {selectedIncident.status === 'resolved' && (
                                            <button
                                                onClick={() => handleUpdateStatus('open', 'Reopened by developer')}
                                                disabled={statusUpdating}
                                                className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition shadow-sm"
                                            >
                                                Reopen Incident
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleCloseDetail}
                                className="px-4 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 bg-white hover:bg-gray-100 transition"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

