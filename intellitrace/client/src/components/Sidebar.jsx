import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Activity, Server, FileText, Settings, LogOut } from 'lucide-react';

export default function Sidebar() {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    const linkClass = ({ isActive }) =>
        `flex items-center px-4 py-3 mb-2 rounded transition-colors ${
            isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
        }`;

    return (
        <div className="w-64 bg-gray-900 text-white flex flex-col h-full">
            <div className="p-6">
                <h1 className="text-2xl font-bold text-white tracking-wide">IntelliTrace</h1>
                <p className="text-gray-400 text-sm mt-1">Developer Platform</p>
            </div>
            
            <nav className="flex-1 px-4 mt-6">
                <NavLink to="/dashboard" className={linkClass}>
                    <Activity className="w-5 h-5 mr-3" /> Dashboard
                </NavLink>
                <NavLink to="/applications" className={linkClass}>
                    <Server className="w-5 h-5 mr-3" /> Applications
                </NavLink>
                <NavLink to="/logs" className={linkClass}>
                    <FileText className="w-5 h-5 mr-3" /> Logs
                </NavLink>
            </nav>

            <div className="p-4 border-t border-gray-800">
                <button 
                    onClick={handleLogout}
                    className="flex items-center w-full px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                    <LogOut className="w-5 h-5 mr-3" /> Logout
                </button>
            </div>
        </div>
    );
}
