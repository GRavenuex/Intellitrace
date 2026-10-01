import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Server, Activity, ArrowRight } from 'lucide-react';
import api from '../api';

const AppCard = ({ app }) => {
    return (
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200 flex flex-col hover:shadow-md transition-shadow">
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                <div className="flex items-center">
                    <Server className="w-5 h-5 mr-2 text-blue-500" />
                    <h3 className="text-xl font-semibold text-gray-800">{app.name}</h3>
                </div>
                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                    app.status === 'healthy' ? 'bg-green-100 text-green-800' :
                    app.status === 'down' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                }`}>
                    {app.status.toUpperCase()}
                </span>
            </div>
            
            <p className="text-sm text-gray-500 mb-6 flex-1">
                Last heartbeat: {app.lastHeartbeat ? formatDistanceToNow(new Date(app.lastHeartbeat), { addSuffix: true }) : 'Never'}
            </p>

            <Link to={`/applications/${app._id}`} className="mt-auto flex items-center justify-center w-full py-2 bg-gray-50 hover:bg-blue-50 text-blue-600 font-medium text-sm rounded border border-gray-200 transition-colors">
                Open Monitoring Dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
        </div>
    );
};

export default function Dashboard() {
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchApps = async () => {
            try {
                const res = await api.get('/applications');
                if (res.data.success) {
                    setApplications(res.data.data);
                }
            } catch (err) {
                console.error('Failed to load dashboard data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchApps();
    }, []);

    if (loading) return (
        <div className="flex h-full items-center justify-center text-gray-500">
            <div className="flex flex-col items-center">
                <Activity className="animate-spin w-8 h-8 mb-4 text-blue-500" />
                Loading workspace...
            </div>
        </div>
    );

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Workspace Overview</h2>
            <p className="text-gray-500 mb-8">Select an application to view its real-time observability dashboard.</p>
            
            {applications.length === 0 ? (
                <div className="bg-white p-8 rounded shadow text-center text-gray-500 border border-gray-200">
                    No applications registered.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {applications.map(app => <AppCard key={app._id} app={app} />)}
                </div>
            )}
        </div>
    );
}
