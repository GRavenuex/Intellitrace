import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Login() {
    const [email, setEmail] = useState('admin@intellitrace.com');
    const [password, setPassword] = useState('password123');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.post('/auth/login', { 
                email: email.trim(), 
                password: password.trim() 
            });
            if (res.data.success) {
                localStorage.setItem('token', res.data.token);
                navigate('/dashboard');
            }
        } catch (err) {
            const msg = err.response?.data?.message || (err.message === 'Network Error' ? 'Cannot connect to backend server at http://localhost:4000. Is it running?' : err.message) || 'Login failed. Please check your credentials.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleQuickLogin = (demoEmail, demoPass) => {
        setEmail(demoEmail);
        setPassword(demoPass);
        setError('');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">IntelliTrace</h1>
                    <p className="text-gray-500 mt-1 text-sm font-medium">Developer Observability Platform</p>
                </div>
                
                {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-4 text-xs font-semibold border border-red-200">{error}</div>}
                
                <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl mb-6 text-xs text-blue-900">
                    <p className="font-bold mb-1.5 flex items-center justify-between">
                        <span>Quick Test Credentials:</span>
                        <span className="text-[10px] text-blue-600 uppercase tracking-wider font-semibold">Click to Fill</span>
                    </p>
                    <div className="space-y-1.5 mt-2">
                        <button
                            type="button"
                            onClick={() => handleQuickLogin('admin@intellitrace.com', 'password123')}
                            className="w-full text-left bg-white border border-blue-200 hover:border-blue-400 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-800 transition flex justify-between items-center"
                        >
                            <span>admin@intellitrace.com</span>
                            <span className="text-blue-600 font-mono text-[11px]">password123</span>
                        </button>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Email Address</label>
                        <input
                            type="email"
                            required
                            className="mt-1 block w-full px-3.5 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Password</label>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full px-3.5 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition disabled:opacity-50"
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}
