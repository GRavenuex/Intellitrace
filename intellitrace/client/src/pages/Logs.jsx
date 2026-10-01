import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import api from '../api';

export default function Logs() {
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Parse query params to state
    const initialApp = searchParams.get('application') || '';
    const initialLevel = searchParams.get('level') || 'ALL';
    const initialReqId = searchParams.get('requestId') || '';
    const initialSearch = searchParams.get('search') || '';
    
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filter State
    const [application, setApplication] = useState(initialApp);
    const [level, setLevel] = useState(initialLevel);
    const [range, setRange] = useState('24h');
    const [search, setSearch] = useState(initialReqId || initialSearch);
    
    // Pagination State
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasNext, setHasNext] = useState(false);
    const limit = 50;

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams({
                page,
                limit,
                range
            });
            if (application) query.append('application', application);
            if (level !== 'ALL') query.append('level', level);
            if (search) query.append('search', search);

            const res = await api.get(`/v1/logs?${query.toString()}`);
            if (res.data.success) {
                setLogs(res.data.data.items);
                setTotal(res.data.data.total);
                setHasNext(res.data.data.hasNext);
                
                // Update URL params
                setSearchParams(query, { replace: true });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Refetch when filters or page change
    useEffect(() => {
        fetchLogs();
    }, [page, application, level, range]);

    // Handle manual search submit
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setPage(1); // Reset page on new search
        fetchLogs();
    };

    const getLevelColor = (lvl) => {
        switch(lvl?.toUpperCase()) {
            case 'ERROR': return 'text-red-600 bg-red-50 border-red-200';
            case 'WARN': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
            case 'INFO': return 'text-blue-600 bg-blue-50 border-blue-200';
            default: return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Log Explorer</h2>
            
            {/* Filters */}
            <div className="bg-white p-4 rounded-t-lg shadow border border-gray-200 border-b-0 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Application</label>
                    <select 
                        value={application} onChange={(e) => { setApplication(e.target.value); setPage(1); }}
                        className="text-sm border-gray-300 rounded shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1.5"
                    >
                        <option value="">All Applications</option>
                        <option value="intellishop">intellishop</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Level</label>
                    <select 
                        value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}
                        className="text-sm border-gray-300 rounded shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1.5"
                    >
                        <option value="ALL">ALL</option>
                        <option value="INFO">INFO</option>
                        <option value="WARN">WARN</option>
                        <option value="ERROR">ERROR</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Time Range</label>
                    <select 
                        value={range} onChange={(e) => { setRange(e.target.value); setPage(1); }}
                        className="text-sm border-gray-300 rounded shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1.5"
                    >
                        <option value="15m">Last 15 minutes</option>
                        <option value="1h">Last 1 hour</option>
                        <option value="6h">Last 6 hours</option>
                        <option value="24h">Last 24 hours</option>
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Search</label>
                    <form onSubmit={handleSearchSubmit} className="flex relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input 
                            type="text"
                            placeholder="Message, route, or Request ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="block w-full pl-10 text-sm border-gray-300 rounded shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1.5"
                        />
                        <button type="submit" className="ml-2 bg-blue-600 text-white px-3 py-1.5 rounded shadow text-sm hover:bg-blue-700">Search</button>
                    </form>
                </div>
            </div>
            
            {/* Log Table */}
            <div className="flex-1 bg-white border border-gray-200 rounded-b-lg shadow overflow-hidden flex flex-col">
                <div className="overflow-auto flex-1 relative min-h-[400px]">
                    {loading && (
                        <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center backdrop-blur-sm text-gray-500 font-medium">
                            Searching logs...
                        </div>
                    )}
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-0">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Application</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">Message</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latency</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Request ID</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100 text-sm">
                            {logs.map((log, idx) => (
                                <tr key={log._id || idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">
                                        {format(new Date(log.timestamp), 'MMM dd HH:mm:ss.SSS')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 border inline-flex text-xs leading-5 font-bold rounded ${getLevelColor(log.level)}`}>
                                            {log.level}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium text-xs">{log.service}</td>
                                    <td className="px-6 py-4 text-gray-800 break-words font-medium">{log.message}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">{log.method} {log.route || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">{log.statusCode || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">{log.responseTime ? `${log.responseTime}ms` : '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono">
                                        {log.requestId ? (
                                            <button 
                                                onClick={() => { setSearch(log.requestId); setPage(1); }}
                                                className="text-blue-600 hover:underline hover:text-blue-800"
                                                title="Filter by this Request ID"
                                            >
                                                {log.requestId.split('-')[0]}...
                                            </button>
                                        ) : '-'}
                                    </td>
                                </tr>
                            ))}
                            {!loading && logs.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="px-6 py-16 text-center text-gray-500 border-t border-gray-100">
                                        No logs found matching your criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination Controls */}
                <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                        Showing <span className="font-medium">{(page - 1) * limit + 1}</span> to <span className="font-medium">{Math.min(page * limit, total)}</span> of <span className="font-medium">{total}</span> results
                    </div>
                    <div className="flex space-x-2">
                        <button 
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="p-1.5 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button 
                            disabled={!hasNext}
                            onClick={() => setPage(p => p + 1)}
                            className="p-1.5 rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
