import React, { useState, useEffect } from 'react';
import { useAgentState } from '@zupa/react';
import { Activity, LayoutDashboard, MessageSquare, Shield, Terminal, Clock, Settings, Zap } from 'lucide-react';

const App: React.FC = () => {
    const agentState = useAgentState();
    const [logs, setLogs] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState('dashboard');

    // Simulate receiving logs via SSE (In a real implementation, this would use EventSource)
    useEffect(() => {
        const sse = new EventSource('/agent/events');
        sse.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                setLogs(prev => [data, ...prev].slice(0, 100));
            } catch (e) {
                console.error('Failed to parse log event', e);
            }
        };
        return () => sse.close();
    }, []);

    return (
        <div className="dashboard-container">
            <header className="header">
                <div className="logo">Zupa Dash</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                        <span className="status-indicator status-online"></span>
                        Agent Online
                    </div>
                    <button className="premium-btn">Action Center</button>
                </div>
            </header>

            <aside className="sidebar">
                <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                    <LayoutDashboard size={20} /> Dashboard
                </div>
                <div className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
                    <Terminal size={20} /> Live Logs
                </div>
                <div className={`nav-item ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>
                    <Clock size={20} /> Sessions
                </div>
                <div className={`nav-item ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
                    <Shield size={20} /> Security
                </div>
                <div style={{ marginTop: 'auto' }} className="nav-item">
                    <Settings size={20} /> Configuration
                </div>
            </aside>

            <main className="main-content">
                <section className="card">
                    <div className="card-header">
                        <span>Real-time Agent State</span>
                        <Activity size={18} color="var(--accent-color)" />
                    </div>
                    <div className="card-body">
                        <div className="state-grid">
                            {Object.entries(agentState).length === 0 ? (
                                <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>
                                    No active state changes detected.
                                </div>
                            ) : (
                                Object.entries(agentState).map(([key, value]) => (
                                    <React.Fragment key={key}>
                                        <span className="state-key">{key}</span>
                                        <span className="state-val">{JSON.stringify(value)}</span>
                                    </React.Fragment>
                                ))
                            )}
                        </div>
                    </div>
                </section>

                <section className="card">
                    <div className="card-header">
                        <span>System Telemetry</span>
                        <Zap size={18} color="#ffd33d" />
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-dim)' }}>Avg Latency</span>
                                <span style={{ fontWeight: '600' }}>142ms</span>
                            </div>
                            <div style={{ width: '100%', height: '4px', background: 'var(--border-color)', borderRadius: '2px' }}>
                                <div style={{ width: '65%', height: '100%', background: 'var(--accent-color)', borderRadius: '2px' }}></div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-dim)' }}>Error Rate</span>
                                <span style={{ fontWeight: '600', color: 'var(--success-color)' }}>0.02%</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="card" style={{ gridColumn: '1 / -1' }}>
                    <div className="card-header">
                        <span>Terminal Output</span>
                        <MessageSquare size={18} color="#888" />
                    </div>
                    <div className="card-body">
                        <div className="log-viewer">
                            {logs.length === 0 ? (
                                <div style={{ color: '#444' }}>Waiting for system events...</div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className="log-entry">
                                        <span style={{ color: '#666', marginRight: '8px' }}>[{new Date(log.ts).toLocaleTimeString()}]</span>
                                        <span className={`log-level-${log.payload?.level?.toLowerCase() || 'info'}`}>
                                            {log.payload?.level || 'INFO'}:
                                        </span>
                                        <span style={{ marginLeft: '8px' }}>{JSON.stringify(log.payload?.message || log.payload)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default App;
