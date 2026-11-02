import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Server, Activity, AlertTriangle, Clock, RefreshCcw, LogOut, Play, Square, FlaskConical, Zap, Database } from 'lucide-react';
import api from '../api';

export default function ApplicationDetails() {
    const { id } = useParams();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [range, setRange] = useState('15m');
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [activeInjections, setActiveInjections] = useState([]);
    const [simulating, setSimulating] = useState(false);

    const fetchActiveInjections = async () => {
        try {
            const res = await api.get('/v1/failure-injections/active');
            if (res.data?.success) {
                setActiveInjections(res.data.data || []);
            }
        } catch (_) {}
    };

    const fetchSummary = async () => {
        try {
            const res = await api.get(`/applications/${id}/summary?range=${range}`);
            if (res.data.success) {
                setSummary(res.data.data);
                setError(false);
                setLastUpdated(new Date());
            } else {
                setError(true);
            }
        } catch (err) {
            console.error(err);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchSummary();
        fetchActiveInjections();
        const interval = setInterval(() => {
            fetchSummary();
            fetchActiveInjections();
        }, 15000);
        return () => clearInterval(interval);
    }, [id, range]);

    const handleActivateSimulation = async (fType, delayMs = 5000) => {
        if (!summary) return;
        setSimulating(true);
        try {
            const raw = (summary.application || '').toLowerCase();
            const targetService = raw.includes('product') ? 'product-service' :
                                  raw.includes('payment') ? 'payment-service' :
                                  raw.includes('order') ? 'order-service' :
                                  raw.includes('cart') ? 'cart-service' : 'intellishop-gateway';

            await api.post('/v1/failure-injections', {
                targetService,
                failureType: fType,
                delayMs: fType === 'latency' ? delayMs : 0,
                durationSeconds: 60,
                description: `Simulated ${fType.toUpperCase()} on ${targetService}`
            });

            await fetchSummary();
            await fetchActiveInjections();
        } catch (err) {
            console.error('Failed to activate simulation:', err);
        } finally {
            setSimulating(false);
        }
    };

    const handleStopSimulation = async (ruleId) => {
        setSimulating(true);
        try {
            await api.patch(`/v1/failure-injections/${ruleId}/stop`);
            await fetchSummary();
            await fetchActiveInjections();
        } catch (err) {
            console.error('Failed to stop simulation:', err);
        } finally {
            setSimulating(false);
        }
    };

    if (loading && !summary) {
        return (
            <div className="flex h-full items-center justify-center text-gray-500">
                <div className="flex flex-col items-center">
                    <RefreshCcw className="animate-spin w-8 h-8 mb-4 text-blue-500" />
                    Loading telemetry...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 max-w-7xl mx-auto">
                <div className="bg-red-50 text-red-600 p-6 rounded shadow border border-red-200 flex items-center">
                    <AlertTriangle className="w-6 h-6 mr-3" />
                    Unable to load telemetry. The IntelliTrace backend may be unavailable.
                </div>
            </div>
        );
    }

    if (!summary) return null;

    const formatFailureName = (type) => {
        switch (type) {
            case 'http_500': return 'HTTP 500 Internal Error';
            case 'latency': return 'High Latency Delay';
            case 'database_timeout': return 'Database Query Timeout';
            case 'service_communication_failure': return 'Downstream Service Communication Failure';
            case 'cascading_failure': return 'Cascading Failure';
            case 'traffic_spike': return 'Traffic Spike Overload';
            default: return type ? type.toUpperCase() : 'Unknown';
        }
    };

    // Status Logic
    let displayStatus = (summary.status || 'healthy').toUpperCase();
    if (summary.lastHeartbeat) {
        const msSinceHeartbeat = Date.now() - new Date(summary.lastHeartbeat).getTime();
        if (msSinceHeartbeat > 60000) displayStatus = 'DOWN';
    } else {
        displayStatus = 'UNKNOWN';
    }

    const { metrics, series, recentLogs, recentErrors, hasData, baseUrl, environment } = summary;

    const bareName = (summary.application || '').replace('intellishop-', '').toLowerCase();

    let serviceScenarios = [];
    if (bareName.includes('product')) {
        serviceScenarios = [
            {
                type: 'http_500',
                name: 'Simulate Product HTTP 500',
                description: 'Forces Product Service to return HTTP 500 internal server error on product endpoints.',
                icon: AlertTriangle
            },
            {
                type: 'latency',
                name: 'Simulate High Latency (5s)',
                description: 'Injects 5000ms delay into product requests while preserving catalog delivery.',
                icon: Clock,
                delayMs: 5000
            },
            {
                type: 'database_timeout',
                name: 'Simulate Database Query Timeout',
                description: 'Forces product catalog operations to simulate MongoTimeoutError without shutting down DB.',
                icon: Database
            },
            {
                type: 'traffic_spike',
                name: 'Simulate Traffic Spike (50 req)',
                description: 'Generates a burst of 50 concurrent requests against Product Service to test overload.',
                icon: Zap
            }
        ];
    } else if (bareName.includes('payment')) {
        serviceScenarios = [
            {
                type: 'http_500',
                name: 'Simulate Payment HTTP 500',
                description: 'Forces Payment Service to return HTTP 500 error during payment processing.',
                icon: AlertTriangle
            },
            {
                type: 'latency',
                name: 'Simulate Payment Latency (5s)',
                description: 'Adds 5000ms delay to payment processing transactions.',
                icon: Clock,
                delayMs: 5000
            },
            {
                type: 'cascading_failure',
                name: 'Simulate Cascading Failure',
                description: 'Originates in Payment Service and propagates downstream to Order Service.',
                icon: Zap
            }
        ];
    } else if (bareName.includes('order')) {
        serviceScenarios = [
            {
                type: 'service_communication_failure',
                name: 'Simulate Downstream Comm Failure',
                description: 'Order Service encounters downstream connection failure (ECONNREFUSED) when calling Payment.',
                icon: AlertTriangle
            },
            {
                type: 'database_timeout',
                name: 'Simulate Database Query Timeout',
                description: 'Simulates query timeout exception during order creation.',
                icon: Database
            },
            {
                type: 'traffic_spike',
                name: 'Simulate Traffic Spike (50 req)',
                description: 'Sends a burst of concurrent requests against Order Service.',
                icon: Zap
            }
        ];
    } else if (bareName.includes('cart')) {
        serviceScenarios = [
            {
                type: 'http_500',
                name: 'Simulate Cart HTTP 500',
                description: 'Returns HTTP 500 internal server error during cart operations.',
                icon: AlertTriangle
            },
            {
                type: 'latency',
                name: 'Simulate Cart Latency (5s)',
                description: 'Injects 5000ms artificial delay into cart addition and retrieval.',
                icon: Clock,
                delayMs: 5000
            }
        ];
    }

    const formatXAxis = (tickItem) => {
        return format(new Date(tickItem), 'HH:mm');
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            
            {/* Top Bar Selector */}
            <div className="bg-white p-4 rounded shadow border border-gray-200 flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center space-x-6">
                    <div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Application</span>
                        <span className="font-semibold text-gray-800">{summary.application}</span>
                    </div>
                    <div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Environment</span>
                        <span className="text-gray-600">{environment}</span>
                    </div>
                    <div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Time Range</span>
                        <select 
                            className="text-sm border-gray-300 rounded shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            value={range}
                            onChange={(e) => setRange(e.target.value)}
                        >
                            <option value="15m">Last 15 minutes</option>
                            <option value="1h">Last 1 hour</option>
                            <option value="6h">Last 6 hours</option>
                            <option value="24h">Last 24 hours</option>
                        </select>
                    </div>
                </div>
                <div className="text-xs text-gray-400 flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    Last updated: {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                </div>
            </div>

            {/* Application Overview */}
            <div className="bg-white rounded shadow border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div className="flex items-center">
                        <Server className="w-5 h-5 mr-2 text-gray-500" />
                        <h2 className="text-lg font-bold text-gray-800">Application Overview</h2>
                    </div>
                    <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                        displayStatus === 'HEALTHY' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        displayStatus === 'DEGRADED' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                        displayStatus === 'DOWN' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                        'bg-gray-100 text-gray-800 border border-gray-200'
                    }`}>
                        {displayStatus}
                    </span>
                </div>
                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Name</p>
                        <p className="font-medium text-gray-900">{summary.application}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Base URL</p>
                        <p className="font-medium text-gray-900 text-sm truncate">{baseUrl || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Last Heartbeat</p>
                        <p className="font-medium text-gray-900">
                            {summary.lastHeartbeat ? formatDistanceToNow(new Date(summary.lastHeartbeat), { addSuffix: true }) : 'Never'}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Telemetry Status</p>
                        <p className="font-medium text-gray-900 flex items-center">
                            <span className={`w-2 h-2 rounded-full mr-2 ${hasData ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            {hasData ? 'Connected' : 'No Data'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Active Failure Injection Scenario Banner */}
            {summary.activeFailure && (
                <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-5 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                            <h3 className="font-bold text-amber-950 text-sm sm:text-base">
                                Injected Failure Active: {formatFailureName(summary.activeFailure.failureType)}
                            </h3>
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                                summary.activeFailure.role === 'downstream' 
                                    ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                                {summary.activeFailure.role === 'downstream' ? 'Cascading Downstream Symptom' : 'Root Cause Origin'}
                            </span>
                        </div>
                        {summary.activeFailure.relatedTraceId && (
                            <Link 
                                to={`/traces?traceId=${summary.activeFailure.relatedTraceId}`}
                                className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition"
                            >
                                <Activity className="w-3.5 h-3.5" />
                                Inspect Correlated Trace
                            </Link>
                        )}
                    </div>
                    <p className="text-xs text-amber-900">
                        {summary.activeFailure.description || `Simulated failure targeting ${summary.activeFailure.targetRoute}. Service telemetry, response times and error rates actively reflect this controlled scenario.`}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-amber-200 text-xs">
                        <div>
                            <span className="text-amber-800/80 block text-[10px] font-bold uppercase">Target Route</span>
                            <span className="font-mono font-semibold text-amber-950">{summary.activeFailure.targetRoute}</span>
                        </div>
                        <div>
                            <span className="text-amber-800/80 block text-[10px] font-bold uppercase">Status</span>
                            <span className="font-bold text-amber-900">{summary.activeFailure.status}</span>
                        </div>
                        <div>
                            <span className="text-amber-800/80 block text-[10px] font-bold uppercase">Trigger Count</span>
                            <span className="font-mono font-bold text-amber-950">{summary.activeFailure.triggerCount} times</span>
                        </div>
                        <div>
                            <span className="text-amber-800/80 block text-[10px] font-bold uppercase">Injected Delay</span>
                            <span className="font-mono font-bold text-amber-950">{summary.activeFailure.delayMs ? `${summary.activeFailure.delayMs} ms` : 'N/A'}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Database Query Timeout Status */}
            {summary.dbStatus && summary.dbStatus.hasQueryTimeout && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-900">
                    <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <span>
                            <strong>Database Query Timeout Injected:</strong> Application query timeout observed ({summary.dbStatus.timeoutCount} event{summary.dbStatus.timeoutCount > 1 ? 's' : ''}). 
                            MongoDB container service remains <strong>HEALTHY (ONLINE)</strong>.
                        </span>
                    </div>
                    {summary.dbStatus.latestTraceId && (
                        <Link to={`/traces?traceId=${summary.dbStatus.latestTraceId}`} className="text-blue-700 font-bold hover:underline flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5" />
                            View DB Trace &rarr;
                        </Link>
                    )}
                </div>
            )}

            {/* Top Level Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded shadow border border-gray-200 flex flex-col items-center justify-center text-center">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Requests</p>
                    <p className="text-3xl font-black text-blue-600">{hasData ? metrics.requests : 'No data'}</p>
                </div>
                <div className="bg-white p-6 rounded shadow border border-gray-200 flex flex-col items-center justify-center text-center">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Errors</p>
                    <p className="text-3xl font-black text-red-500">{hasData ? metrics.errors : 'No data'}</p>
                </div>
                <div className="bg-white p-6 rounded shadow border border-gray-200 flex flex-col items-center justify-center text-center">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Error Rate</p>
                    <p className="text-3xl font-black text-gray-800">{hasData && metrics.requests > 0 ? `${metrics.errorRate}%` : (hasData ? '0%' : 'No data')}</p>
                </div>
                <div className="bg-white p-6 rounded shadow border border-gray-200 flex flex-col items-center justify-center text-center">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Avg Latency</p>
                    <p className="text-3xl font-black text-indigo-600">{hasData ? `${metrics.latencyMs} ms` : 'No data'}</p>
                </div>
            </div>

            {/* Charts Section */}
            {hasData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded shadow border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Request Volume</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={series.requests}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="timestamp" tickFormatter={formatXAxis} minTickGap={30} tick={{fontSize: 12}} />
                                    <YAxis allowDecimals={false} tick={{fontSize: 12}} />
                                    <Tooltip labelFormatter={(label) => format(new Date(label), 'PPpp')} />
                                    <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    
                    <div className="bg-white p-6 rounded shadow border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Average Latency (ms)</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={series.latency}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="timestamp" tickFormatter={formatXAxis} minTickGap={30} tick={{fontSize: 12}} />
                                    <YAxis tick={{fontSize: 12}} />
                                    <Tooltip labelFormatter={(label) => format(new Date(label), 'PPpp')} />
                                    <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} dot={false} isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* Business Activity & Incidents */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded shadow border border-gray-200">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Business Activity</h3>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-4">
                        <div className="border-b border-gray-100 pb-2">
                            <p className="text-xs text-gray-500 uppercase">Orders Created</p>
                            <p className="text-xl font-medium">{hasData ? metrics.business?.orders || 0 : '-'}</p>
                        </div>
                        <div className="border-b border-gray-100 pb-2">
                            <p className="text-xs text-gray-500 uppercase">Payments Started</p>
                            <p className="text-xl font-medium">{hasData ? metrics.business?.paymentsStarted || 0 : '-'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-green-600 uppercase">Payments Successful</p>
                            <p className="text-xl font-medium">{hasData ? metrics.business?.paymentsSuccess || 0 : '-'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-red-500 uppercase">Payments Failed</p>
                            <p className="text-xl font-medium">{hasData ? metrics.business?.paymentsFailed || 0 : '-'}</p>
                        </div>
                        <div className="col-span-2 border-t border-gray-100 pt-2 mt-2">
                            <p className="text-xs text-gray-500 uppercase">Cart Operations</p>
                            <p className="text-xl font-medium">{hasData ? metrics.business?.cartOps || 0 : '-'}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded shadow border border-gray-200">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Telemetry Diagnostics</h3>
                    </div>
                    <div className="p-6 space-y-4 text-xs text-gray-600">
                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                            <span className="font-semibold text-gray-700">Service Category</span>
                            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-800 uppercase">{bareName || 'Microservice'}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                            <span className="font-semibold text-gray-700">Health State</span>
                            <span className="font-semibold text-emerald-600">{displayStatus}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-gray-100">
                            <span className="font-semibold text-gray-700">Active Failures</span>
                            <span className="font-semibold text-gray-900">{activeInjections.length} rule(s)</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="font-semibold text-gray-700">Deep Diagnostics</span>
                            <Link to={`/traces?service=${bareName}`} className="text-blue-600 hover:underline font-semibold flex items-center gap-1">
                                Service Traces &rarr;
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Failure Simulation Scenarios Panel */}
            {serviceScenarios.length > 0 && (
                <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
                    <div className="bg-slate-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                                <FlaskConical className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold tracking-wide">Failure Simulation Scenarios ({summary.application})</h3>
                                <p className="text-xs text-slate-300">Inject controlled fault scenarios to test observability, traces, and incident detection.</p>
                            </div>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 self-start sm:self-auto">
                            {serviceScenarios.length} Scenarios Available
                        </span>
                    </div>

                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {serviceScenarios.map(s => {
                            const active = activeInjections.find(i => 
                                (i.status === 'ACTIVE' || i.status === 'TRIGGERED') && 
                                i.failureType.toLowerCase() === s.type.toLowerCase()
                            );
                            const IconComponent = s.icon;

                            return (
                                <div key={s.type} className="p-4 rounded-xl border border-gray-200 bg-gray-50/60 flex flex-col justify-between hover:border-gray-300 transition">
                                    <div>
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <div className="flex items-center gap-2 font-bold text-sm text-gray-900">
                                                <IconComponent className="w-4 h-4 text-blue-600" />
                                                {s.name}
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                active ? (active.status === 'TRIGGERED' ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse') : 'bg-gray-100 text-gray-600 border border-gray-200'
                                            }`}>
                                                {active ? active.status : 'INACTIVE'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 leading-relaxed mb-4">
                                            {s.description}
                                        </p>
                                    </div>

                                    <div className="pt-3 border-t border-gray-200/80 flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-mono text-gray-400">
                                            {active ? `Triggered: ${active.triggerCount || 0}x` : 'Duration: 60s'}
                                        </span>
                                        {active ? (
                                            <button
                                                onClick={() => handleStopSimulation(active._id)}
                                                disabled={simulating}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition flex items-center gap-1.5 shadow-sm"
                                            >
                                                <Square className="w-3 h-3 fill-current" /> Stop Simulation
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleActivateSimulation(s.type, s.delayMs)}
                                                disabled={simulating}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition flex items-center gap-1.5 shadow-sm"
                                            >
                                                <Play className="w-3 h-3 fill-current" /> Activate Simulation
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Logs & Errors */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded shadow border border-gray-200">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Recent Errors</h3>
                        <Link to={`/logs?application=${summary.application}&level=ERROR`} className="text-xs text-blue-600 hover:underline">View all</Link>
                    </div>
                    <div className="p-0 overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-white sticky top-0 border-b border-gray-100 shadow-sm text-xs text-gray-400 uppercase">
                                <tr>
                                    <th className="px-4 py-2">Time</th>
                                    <th className="px-4 py-2">Message</th>
                                    <th className="px-4 py-2">Trace / Request ID</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {recentErrors && recentErrors.length > 0 ? recentErrors.map(err => (
                                    <tr key={err._id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                                            {format(new Date(err.timestamp), 'HH:mm:ss')}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-red-600 truncate max-w-xs" title={err.message}>
                                            {err.message}
                                            {err.route && <span className="block text-gray-400 text-xs font-normal mt-0.5">{err.route}</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 text-xs font-mono">
                                            <div className="flex flex-col gap-1">
                                                {err.traceId ? (
                                                    <Link 
                                                        to={`/traces?traceId=${err.traceId}`} 
                                                        className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 hover:underline" 
                                                        title={`Trace ID: ${err.traceId}`}
                                                    >
                                                        <Activity className="w-3 h-3 text-blue-500" />
                                                        {err.traceId.slice(0, 12)}...
                                                    </Link>
                                                ) : null}
                                                {err.requestId ? (
                                                    <Link 
                                                        to={`/logs?requestId=${err.requestId}`} 
                                                        className="text-gray-500 hover:text-gray-800 text-[11px] hover:underline" 
                                                        title={`Request ID: ${err.requestId}`}
                                                    >
                                                        req: {err.requestId.slice(0, 8)}...
                                                    </Link>
                                                ) : null}
                                                {!err.traceId && !err.requestId && <span className="text-gray-400">-</span>}
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="3" className="px-4 py-8 text-center text-gray-500">No recent errors observed.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white rounded shadow border border-gray-200">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Recent Activity</h3>
                        <Link to={`/logs?application=${summary.application}`} className="text-xs text-blue-600 hover:underline">View all</Link>
                    </div>
                    <div className="p-0 overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-white sticky top-0 border-b border-gray-100 shadow-sm text-xs text-gray-400 uppercase">
                                <tr>
                                    <th className="px-4 py-2">Time</th>
                                    <th className="px-4 py-2">Level</th>
                                    <th className="px-4 py-2">Message</th>
                                    <th className="px-4 py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {recentLogs && recentLogs.length > 0 ? recentLogs.map(log => (
                                    <tr key={log._id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                                            {format(new Date(log.timestamp), 'HH:mm:ss')}
                                        </td>
                                        <td className={`px-4 py-3 font-semibold text-xs ${
                                            log.level === 'ERROR' ? 'text-red-500' :
                                            log.level === 'WARN' ? 'text-yellow-500' : 'text-blue-500'
                                        }`}>
                                            {log.level}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 truncate max-w-xs" title={log.message}>
                                            {log.message}
                                            {log.route && <span className="block text-gray-400 text-xs mt-0.5">{log.method} {log.route}</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {log.statusCode || '-'}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="4" className="px-4 py-8 text-center text-gray-500">No recent activity observed.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
    );
}
