import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
    Search, RefreshCw, AlertTriangle, CheckCircle, Clock, 
    Layers, ArrowRight, X, Copy, ExternalLink, ChevronDown, ChevronRight, Activity
} from 'lucide-react';
import api from '../api';

const SERVICE_COLORS = {
    'intellishop-gateway': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', bar: 'bg-blue-500' },
    'product-service': { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', bar: 'bg-emerald-500' },
    'cart-service': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', bar: 'bg-purple-500' },
    'order-service': { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', bar: 'bg-amber-500' },
    'payment-service': { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300', bar: 'bg-rose-500' },
    'unknown-service': { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300', bar: 'bg-gray-500' }
};

export default function Traces() {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTraceId = searchParams.get('traceId') || '';

    const [traces, setTraces] = useState([]);
    const [services, setServices] = useState([]);
    const [selectedService, setSelectedService] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [lookback, setLookback] = useState('1h');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [limit] = useState(20);
    const [searchTraceId, setSearchTraceId] = useState(initialTraceId);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Selected Trace Detail Modal State
    const [activeTrace, setActiveTrace] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedSpan, setSelectedSpan] = useState(null);
    const [copied, setCopied] = useState(false);

    // Load available services
    useEffect(() => {
        api.get('/traces/services')
            .then(res => {
                if (res.data?.success) setServices(res.data.data);
            })
            .catch(console.error);
    }, []);

    // Fetch traces list
    const fetchTraces = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams({ 
                limit: String(limit),
                page: String(page),
                lookback
            });
            if (selectedService) query.append('service', selectedService);
            if (statusFilter && statusFilter !== 'ALL') query.append('status', statusFilter);
            if (searchTraceId.trim()) query.append('search', searchTraceId.trim());

            const res = await api.get(`/traces?${query.toString()}`);
            if (res.data?.success) {
                setTraces(res.data.data || []);
                setTotal(res.data.total ?? (res.data.data ? res.data.data.length : 0));
                setTotalPages(res.data.totalPages || 1);
            }
        } catch (err) {
            console.error('Failed to load traces:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchTraces();
    }, [selectedService, statusFilter, lookback, page]);

    // Handle trace selection to open waterfall
    const handleSelectTrace = async (traceId) => {
        setDetailLoading(true);
        setActiveTrace(null);
        setSelectedSpan(null);
        try {
            const res = await api.get(`/traces/${traceId}`);
            if (res.data?.success) {
                setActiveTrace(res.data.data);
                if (res.data.data.spans?.length > 0) {
                    setSelectedSpan(res.data.data.spans[0]);
                }
            }
        } catch (err) {
            console.error('Failed to load trace detail:', err);
        } finally {
            setDetailLoading(false);
        }
    };

    useEffect(() => {
        if (initialTraceId) {
            handleSelectTrace(initialTraceId);
        }
    }, [initialTraceId]);

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Activity className="w-6 h-6 text-blue-600" />
                        Distributed Traces
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        End-to-end distributed execution paths and latency waterfalls across IntelliShop microservices.
                    </p>
                </div>
                <button
                    onClick={() => { setRefreshing(true); fetchTraces(); }}
                    disabled={refreshing}
                    className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-3 items-center flex-1">
                    {/* Search by Trace ID or Root Operation */}
                    <div className="relative min-w-[260px]">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Filter by Trace ID or operation..."
                            value={searchTraceId}
                            onChange={(e) => setSearchTraceId(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setPage(1);
                                    fetchTraces();
                                }
                            }}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                    </div>

                    {/* Service Filter */}
                    <select
                        value={selectedService}
                        onChange={(e) => {
                            setSelectedService(e.target.value);
                            setPage(1);
                        }}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-700"
                    >
                        <option value="">All Services</option>
                        {services.map(svc => (
                            <option key={svc} value={svc}>{svc}</option>
                        ))}
                    </select>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-700"
                    >
                        <option value="ALL">All Business Traces</option>
                        <option value="SUCCESS">Successful Only</option>
                        <option value="ERROR">Errors Only</option>
                        <option value="SLOW">Slow Traces (&gt; 1s)</option>
                    </select>

                    {/* Lookback Time Range Filter */}
                    <select
                        value={lookback}
                        onChange={(e) => {
                            setLookback(e.target.value);
                            setPage(1);
                        }}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-700"
                    >
                        <option value="15m">Last 15 Minutes</option>
                        <option value="1h">Last 1 Hour</option>
                        <option value="6h">Last 6 Hours</option>
                        <option value="24h">Last 24 Hours</option>
                    </select>
                </div>

                <div className="text-xs text-gray-500 font-medium">
                    Showing <span className="font-bold text-gray-900">{traces.length}</span> of <span className="font-bold text-gray-900">{total}</span> business traces
                </div>
            </div>

            {/* Traces List Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
                        <p className="font-medium text-sm">Loading distributed traces from Jaeger backend...</p>
                    </div>
                ) : traces.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <Layers className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p className="font-semibold text-gray-700">No distributed traces found</p>
                        <p className="text-xs text-gray-400 mt-1">
                            Browse IntelliShop or complete a checkout at <span className="font-mono text-blue-600">localhost:3000</span> to generate traces.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">Trace ID</th>
                                    <th className="py-3 px-4">Root Operation</th>
                                    <th className="py-3 px-4">Traversed Services</th>
                                    <th className="py-3 px-4">Spans</th>
                                    <th className="py-3 px-4">Total Duration</th>
                                    <th className="py-3 px-4">Timestamp</th>
                                    <th className="py-3 px-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {traces.map((trace) => (
                                    <tr 
                                        key={trace.traceId} 
                                        className="hover:bg-blue-50/50 transition cursor-pointer"
                                        onClick={() => handleSelectTrace(trace.traceId)}
                                    >
                                        <td className="py-3 px-4">
                                            {trace.hasError ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                                    <AlertTriangle className="w-3.5 h-3.5" /> Error
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                                    <CheckCircle className="w-3.5 h-3.5" /> OK
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 font-mono font-medium text-blue-600">
                                            {trace.traceId.slice(0, 16)}...
                                        </td>
                                        <td className="py-3 px-4 font-medium text-gray-900">
                                            <div className="font-semibold">{trace.rootOperationName}</div>
                                            <div className="text-xs text-gray-500 font-mono">{trace.rootServiceName}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {(trace.services || []).map(svc => {
                                                    const color = SERVICE_COLORS[svc] || SERVICE_COLORS['unknown-service'];
                                                    return (
                                                        <span key={svc} className={`text-[11px] font-semibold px-2 py-0.5 rounded ${color.bg} ${color.text}`}>
                                                            {svc}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 font-semibold text-gray-700">
                                            {trace.spanCount}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`font-mono font-bold ${trace.durationMs > 1000 ? 'text-amber-600' : 'text-gray-900'}`}>
                                                {trace.durationMs} ms
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-xs text-gray-500">
                                            {trace.startTime ? new Date(trace.startTime).toLocaleTimeString() : 'N/A'}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleSelectTrace(trace.traceId); }}
                                                className="text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg transition"
                                            >
                                                Inspect
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Controls */}
                {total > 0 && (
                    <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
                        <div>
                            Showing <span className="font-semibold text-gray-900">{(page - 1) * limit + 1}</span> to <span className="font-semibold text-gray-900">{Math.min(page * limit, total)}</span> of <span className="font-semibold text-gray-900">{total}</span> business traces
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1 || loading}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                                Previous
                            </button>
                            <span className="px-2 font-medium text-gray-700">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages || loading}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Trace Waterfall Modal / Viewer */}
            {(activeTrace || detailLoading) && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-200 flex justify-between items-start bg-gray-50">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-bold text-gray-900">Distributed Trace Waterfall</h2>
                                    {activeTrace && (
                                        activeTrace.hasError ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                                                <AlertTriangle className="w-3.5 h-3.5" /> ERROR DETECTED
                                            </span>
                                        ) : (
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                                <CheckCircle className="w-3.5 h-3.5" /> SUCCESS
                                            </span>
                                        )
                                    )}
                                </div>
                                {activeTrace && (
                                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 font-mono">
                                        <span>Trace ID: <strong className="text-gray-800">{activeTrace.traceId}</strong></span>
                                        <button 
                                            onClick={() => copyToClipboard(activeTrace.traceId)}
                                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-sans font-medium"
                                        >
                                            <Copy className="w-3 h-3" /> {copied ? 'Copied!' : 'Copy ID'}
                                        </button>
                                        <span>• Duration: <strong className="text-gray-900 font-sans">{activeTrace.durationMs} ms</strong></span>
                                        <span>• Total Spans: <strong className="text-gray-900 font-sans">{activeTrace.spanCount}</strong></span>
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => setActiveTrace(null)}
                                className="text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-200 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {detailLoading ? (
                            <div className="p-16 text-center text-gray-500">
                                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
                                <p className="font-medium text-sm">Rendering span timeline and latency breakdown...</p>
                            </div>
                        ) : activeTrace ? (
                            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                                {/* Waterfall Timeline Section */}
                                <div className="flex-1 overflow-y-auto p-6 border-r border-gray-200 space-y-4">
                                    <div className="flex justify-between items-center text-xs font-bold text-gray-500 uppercase tracking-wider pb-2 border-b border-gray-100">
                                        <span>Span Execution Hierarchy</span>
                                        <span>Timeline (0 - {activeTrace.durationMs} ms)</span>
                                    </div>

                                    {/* Span Waterfall Rows */}
                                    <div className="space-y-2">
                                        {activeTrace.spans.map((span, idx) => {
                                            const color = SERVICE_COLORS[span.serviceName] || SERVICE_COLORS['unknown-service'];
                                            const isSelected = selectedSpan?.spanId === span.spanId;
                                            const indentLevel = span.parentSpanId ? 20 : 0;

                                            return (
                                                <div 
                                                    key={span.spanId}
                                                    onClick={() => setSelectedSpan(span)}
                                                    className={`p-2.5 rounded-xl border transition cursor-pointer ${
                                                        isSelected 
                                                            ? 'border-blue-500 bg-blue-50/40 shadow-sm' 
                                                            : 'border-gray-200 hover:border-gray-300 bg-white'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between text-xs mb-1.5">
                                                        <div className="flex items-center gap-2 overflow-hidden" style={{ paddingLeft: `${indentLevel}px` }}>
                                                            {span.parentSpanId && <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${color.bg} ${color.text} flex-shrink-0`}>
                                                                {span.serviceName}
                                                            </span>
                                                            <span className="font-semibold text-gray-900 truncate">
                                                                {span.operationName}
                                                            </span>
                                                            {span.hasError && (
                                                                <span className="text-red-600 font-bold flex-shrink-0 text-[10px] bg-red-50 px-1 py-0.5 rounded">
                                                                    ERROR
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="font-mono text-gray-700 font-semibold flex-shrink-0 ml-2">
                                                            {span.durationMs} ms
                                                        </span>
                                                    </div>

                                                    {/* Latency Bar Visualizer */}
                                                    <div className="w-full bg-gray-100 h-2.5 rounded-full relative overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full ${span.hasError ? 'bg-red-500' : color.bar}`}
                                                            style={{
                                                                marginLeft: `${span.percentOffset}%`,
                                                                width: `${span.percentWidth}%`
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Span Details Inspector Panel */}
                                <div className="w-full md:w-96 overflow-y-auto p-6 bg-gray-50/50 space-y-4">
                                    {selectedSpan ? (
                                        <div className="space-y-4 text-xs">
                                            <div>
                                                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                                    Span Details
                                                </div>
                                                <h3 className="text-sm font-bold text-gray-900 break-words">
                                                    {selectedSpan.operationName}
                                                </h3>
                                                <p className="text-gray-500 mt-0.5">Service: <strong className="text-gray-800">{selectedSpan.serviceName}</strong></p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-gray-200">
                                                <div>
                                                    <span className="text-gray-400 block text-[10px] font-medium">Duration</span>
                                                    <span className="font-mono font-bold text-gray-900">{selectedSpan.durationMs} ms</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 block text-[10px] font-medium">Offset</span>
                                                    <span className="font-mono font-bold text-gray-900">+{selectedSpan.offsetMs} ms</span>
                                                </div>
                                                <div className="col-span-2 pt-2 border-t border-gray-100">
                                                    <span className="text-gray-400 block text-[10px] font-medium">Span ID</span>
                                                    <span className="font-mono text-gray-700 select-all">{selectedSpan.spanId}</span>
                                                </div>
                                                {selectedSpan.parentSpanId && (
                                                    <div className="col-span-2">
                                                        <span className="text-gray-400 block text-[10px] font-medium">Parent Span ID</span>
                                                        <span className="font-mono text-gray-700 select-all">{selectedSpan.parentSpanId}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Attributes / Tags */}
                                            <div>
                                                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                                    Attributes & Tags
                                                </div>
                                                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-64 overflow-y-auto">
                                                    {Object.entries(selectedSpan.tags || {}).map(([k, v]) => (
                                                        <div key={k} className="p-2 font-mono flex flex-col">
                                                            <span className="text-blue-600 font-semibold text-[11px] break-all">{k}</span>
                                                            <span className="text-gray-700 text-[11px] break-all mt-0.5">{String(v)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Logs / Events if any */}
                                            {selectedSpan.events && selectedSpan.events.length > 0 && (
                                                <div>
                                                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                                        Span Events ({selectedSpan.events.length})
                                                    </div>
                                                    <div className="bg-white p-2.5 rounded-xl border border-gray-200 space-y-2">
                                                        {selectedSpan.events.map((ev, i) => (
                                                            <div key={i} className="text-[11px] font-mono border-b pb-1 last:border-0">
                                                                <span className="text-gray-400 text-[10px]">{ev.timestamp}</span>
                                                                <pre className="text-gray-800 whitespace-pre-wrap mt-0.5">{JSON.stringify(ev.fields, null, 2)}</pre>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center text-gray-400">
                                            Select a span from the waterfall timeline to inspect details and tags.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
