import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import api from '../api';

export default function Applications() {
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
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchApps();
    }, []);

    if (loading) return <div className="p-8 text-gray-500">Loading applications...</div>;

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Applications</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {applications.map(app => (
                    <div key={app._id} className="bg-white p-6 rounded-lg shadow border border-gray-200 flex flex-col">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{app.name}</h3>
                        <p className="text-sm text-gray-500 mb-1">Environment: {app.environment}</p>
                        <p className="text-sm text-gray-500 mb-1">
                            Status: <span className={`font-medium ${app.status === 'healthy' ? 'text-green-600' : 'text-yellow-600'}`}>{app.status}</span>
                        </p>
                        <p className="text-sm text-gray-500 mb-4">
                            Last heartbeat: {app.lastHeartbeat ? formatDistanceToNow(new Date(app.lastHeartbeat), { addSuffix: true }) : 'Never'}
                        </p>
                        <div className="mt-auto pt-4 border-t border-gray-100">
                            <Link to={`/applications/${app._id}`} className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                                View Details &rarr;
                            </Link>
                        </div>
                    </div>
                ))}
                
                {applications.length === 0 && (
                    <div className="col-span-full text-center p-12 bg-white rounded shadow text-gray-500 border border-dashed border-gray-300">
                        No applications found.
                    </div>
                )}
            </div>
        </div>
    );
}
