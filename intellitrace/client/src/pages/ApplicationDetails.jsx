import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Server, Activity, AlertTriangle, Clock, RefreshCcw, LogOut } from 'lucide-react';
import api from '../api';

export default function ApplicationDetails() {
    const { id } = useParams();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [range, setRange] = useState('15m');
    const [lastUpdated, setLastUpdated] = useState(new Date());

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
        const interval = setInterval(fetchSummary, 15000);
        return () => clearInterval(interval);
    }, [id, range]);

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

    const isHealthy = summary.status === 'healthy';
    
    // Status Logic (Down if heartbeat > 60s ago, unknown if never)
    let displayStatus = summary.status.toUpperCase();
    if (summary.lastHeartbeat) {
        const msSinceHeartbeat = Date.now() - new Date(summary.lastHeartbeat).getTime();
        if (msSinceHeartbeat > 60000) displayStatus = 'DOWN';
    } else {
        displayStatus = 'UNKNOWN';
    }

    const { metrics, series, recentLogs, recentErrors, hasData, baseUrl, environment } = summary;

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
                        displayStatus === 'HEALTHY' ? 'bg-green-100 text-green-800' :
                        displayStatus === 'DOWN' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
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
                        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Active Incidents</h3>
                    </div>
                    <div className="p-6 flex flex-col items-center justify-center h-48 text-gray-500">
                        <Activity className="w-12 h-12 mb-3 text-gray-300" />
                        <p className="font-medium text-gray-700">No active incidents</p>
                        <p className="text-xs mt-1">Incident detection is not currently active.</p>
                    </div>
                </div>
            </div>

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
                                    <th className="px-4 py-2">Request ID</th>
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
                                        <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                                            {err.requestId ? (
                                                <Link to={`/logs?requestId=${err.requestId}`} className="text-blue-500 hover:underline" title="View Trace">
                                                    {err.requestId.split('-')[0]}...
                                                </Link>
                                            ) : '-'}
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
