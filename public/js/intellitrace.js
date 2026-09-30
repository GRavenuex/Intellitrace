// IntelliTrace Dashboard Client Logic

const REFRESH_INTERVAL = 5000;

const formatTime = (ms) => {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
};

const formatUptime = (seconds) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    let parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
};

const getComponentStatus = (errorRate, avgResponseTime) => {
    if (errorRate >= 10 || avgResponseTime >= 2000) {
        return { label: 'Critical', class: 'critical', icon: '🔴' };
    } else if (errorRate >= 2 || avgResponseTime >= 500) {
        return { label: 'Warning', class: 'warning', icon: '🟡' };
    } else {
        return { label: 'Healthy', class: 'healthy', icon: '🟢' };
    }
};

const getGlobalStatus = (metrics) => {
    const totalRequests = metrics.requests.total;
    const error5xxRate = totalRequests > 0 ? (metrics.requests.status5xx / totalRequests) * 100 : 0;
    const avgResp = metrics.responseTime.average;

    if (error5xxRate >= 5 || avgResp >= 2000) {
        return { text: 'System Critical', class: 'critical' };
    } else if (error5xxRate >= 1 || avgResp >= 500) {
        return { text: 'System Degraded', class: 'degraded' };
    } else {
        return { text: 'System Healthy', class: 'healthy' };
    }
};

const detectIncidents = (metrics) => {
    const incidents = [];
    const totalReq = metrics.requests.total;
    
    // RULE 1: overall 5xx rate >= 5%
    const rate5xx = totalReq > 0 ? (metrics.requests.status5xx / totalReq) * 100 : 0;
    if (rate5xx >= 5) {
        incidents.push({
            id: 'INC-' + Date.now() + '-1',
            title: 'High Server Error Rate',
            severity: 'CRITICAL',
            endpoint: 'Global',
            value: `${rate5xx.toFixed(1)}%`,
            description: `Overall 5xx error rate is at ${rate5xx.toFixed(1)}%, exceeding the 5% threshold.`,
            timestamp: Date.now()
        });
    }

    // Endpoint rules
    Object.keys(metrics.endpoints).forEach(endpoint => {
        const ep = metrics.endpoints[endpoint];
        const epErrorRate = ep.requests > 0 ? (ep.errors / ep.requests) * 100 : 0;

        // RULE 2: endpoint error rate >= 10%
        if (epErrorRate >= 10) {
            incidents.push({
                id: 'INC-' + Date.now() + '-2-' + endpoint.replace(/\W/g, ''),
                title: 'Endpoint Degradation Detected',
                severity: 'CRITICAL',
                endpoint: endpoint,
                value: `${epErrorRate.toFixed(1)}% errors`,
                description: `Endpoint ${endpoint} is experiencing a high error rate.`,
                timestamp: Date.now()
            });
        }

        // RULE 3: endpoint avg response >= 2000ms
        if (ep.averageResponseTime >= 2000) {
            incidents.push({
                id: 'INC-' + Date.now() + '-3-' + endpoint.replace(/\W/g, ''),
                title: 'Slow Endpoint Detected',
                severity: 'WARNING',
                endpoint: endpoint,
                value: `${ep.averageResponseTime} ms`,
                description: `Endpoint ${endpoint} response time is extremely high.`,
                timestamp: Date.now()
            });
        }
    });

    // Database rules
    const db = metrics.database;
    // RULE 4: DB failed operations > 0
    if (db.failedOperations > 0) {
        incidents.push({
            id: 'INC-' + Date.now() + '-4',
            title: 'Database Failures Detected',
            severity: 'CRITICAL',
            component: 'MongoDB',
            value: `${db.failedOperations} failures`,
            description: `Database operations are failing. Immediate investigation required.`,
            timestamp: Date.now()
        });
    }

    // RULE 5: DB avg duration >= 1000ms
    if (db.averageDuration >= 1000) {
        incidents.push({
            id: 'INC-' + Date.now() + '-5',
            title: 'Database Performance Degradation',
            severity: 'WARNING',
            component: 'MongoDB',
            value: `${db.averageDuration} ms`,
            description: `Average database query duration is exceeding 1000ms.`,
            timestamp: Date.now()
        });
    }

    return incidents;
};

const updateDashboard = (metrics) => {
    // 1. Update Global Status
    const globalStatus = getGlobalStatus(metrics);
    const indicator = document.getElementById('global-status-indicator');
    indicator.className = `status-indicator ${globalStatus.class}`;
    document.getElementById('global-status-text').textContent = globalStatus.text;
    document.getElementById('last-updated-time').textContent = new Date().toLocaleTimeString();

    // 2. Update Overview Cards
    const totalRequests = metrics.requests.total;
    const errorRate = totalRequests > 0 ? ((metrics.requests.clientErrors + metrics.requests.serverErrors) / totalRequests * 100).toFixed(2) : 0;
    
    document.getElementById('stat-total-requests').textContent = totalRequests.toLocaleString();
    document.getElementById('stat-avg-response').textContent = formatTime(metrics.responseTime.average);
    document.getElementById('stat-error-rate').textContent = `${errorRate}%`;
    document.getElementById('stat-uptime').textContent = formatUptime(metrics.uptime);

    // 3. Components Mapping
    // Deduce components from routes (e.g. /api/products -> Product, /api/cart -> Cart)
    const componentsMap = {};
    Object.keys(metrics.endpoints).forEach(route => {
        let compName = 'Other';
        if (route.includes('/products')) compName = 'Product';
        else if (route.includes('/cart')) compName = 'Cart';
        else if (route.includes('/orders')) compName = 'Order';
        else if (route.includes('/payments')) compName = 'Payment';
        else if (route.includes('/users') || route.includes('/auth')) compName = 'Authentication';
        else if (route.includes('/admin') || route.includes('/host') || route.includes('/intellitrace')) compName = 'Admin';
        else if (route.includes('/notifications')) compName = 'Notification';
        
        if (!componentsMap[compName]) {
            componentsMap[compName] = { requests: 0, errors: 0, totalResp: 0 };
        }
        
        const ep = metrics.endpoints[route];
        componentsMap[compName].requests += ep.requests;
        componentsMap[compName].errors += ep.errors;
        componentsMap[compName].totalResp += (ep.averageResponseTime * ep.requests);
    });

    const componentsTbody = document.querySelector('#components-table tbody');
    componentsTbody.innerHTML = '';
    
    Object.keys(componentsMap).sort().forEach(comp => {
        const c = componentsMap[comp];
        if (c.requests === 0) return;
        
        const avgResp = Math.round(c.totalResp / c.requests);
        const eRate = (c.errors / c.requests) * 100;
        const status = getComponentStatus(eRate, avgResp);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${comp}</strong></td>
            <td><span class="status-badge ${status.class}">${status.icon} ${status.label}</span></td>
            <td>${formatTime(avgResp)}</td>
            <td>${eRate.toFixed(1)}% errors</td>
            <td>${c.requests.toLocaleString()}</td>
        `;
        componentsTbody.appendChild(tr);
    });
    if (Object.keys(componentsMap).length === 0) {
        componentsTbody.innerHTML = '<tr><td colspan="5">No component data available</td></tr>';
    }

    // 4. Database Performance
    const db = metrics.database;
    if (db.totalOperations === 0) {
        document.querySelector('.db-stats-grid').innerHTML = '<div style="grid-column: span 3; text-align: center; color: var(--text-secondary); padding: 1rem;">No database operations recorded</div>';
    } else {
        // Restore HTML if it was overwritten
        if (!document.getElementById('db-total-ops')) {
            document.querySelector('.db-stats-grid').innerHTML = `
                <div class="db-stat"><span class="db-label">Operations</span><span class="db-value" id="db-total-ops">0</span></div>
                <div class="db-stat text-success"><span class="db-label">Success</span><span class="db-value" id="db-success-ops">0</span></div>
                <div class="db-stat text-danger"><span class="db-label">Failed</span><span class="db-value" id="db-failed-ops">0</span></div>
                <div class="db-stat"><span class="db-label">Avg Duration</span><span class="db-value" id="db-avg-duration">0 ms</span></div>
                <div class="db-stat"><span class="db-label">Min</span><span class="db-value" id="db-min-duration">0 ms</span></div>
                <div class="db-stat"><span class="db-label">Max</span><span class="db-value" id="db-max-duration">0 ms</span></div>
            `;
        }
        document.getElementById('db-total-ops').textContent = db.totalOperations.toLocaleString();
        document.getElementById('db-success-ops').textContent = db.successfulOperations.toLocaleString();
        document.getElementById('db-failed-ops').textContent = db.failedOperations.toLocaleString();
        document.getElementById('db-avg-duration').textContent = formatTime(db.averageDuration);
        document.getElementById('db-min-duration').textContent = formatTime(db.minimumDuration || 0);
        document.getElementById('db-max-duration').textContent = formatTime(db.maximumDuration);
    }

    // 5. Endpoint Performance
    const endpointsTbody = document.querySelector('#endpoints-table tbody');
    endpointsTbody.innerHTML = '';
    
    // Sort endpoints by avg response time DESC
    const sortedEndpoints = Object.keys(metrics.endpoints).sort((a, b) => {
        return metrics.endpoints[b].averageResponseTime - metrics.endpoints[a].averageResponseTime;
    });

    sortedEndpoints.forEach(route => {
        const ep = metrics.endpoints[route];
        const eRate = ep.requests > 0 ? (ep.errors / ep.requests) * 100 : 0;
        const status = getComponentStatus(eRate, ep.averageResponseTime);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${route}</td>
            <td>${ep.requests}</td>
            <td>${ep.errors}</td>
            <td>${formatTime(ep.averageResponseTime)}</td>
            <td>${formatTime(ep.minimumResponseTime || 0)}</td>
            <td>${formatTime(ep.maximumResponseTime)}</td>
            <td>${status.icon}</td>
        `;
        endpointsTbody.appendChild(tr);
    });
    if (sortedEndpoints.length === 0) {
        endpointsTbody.innerHTML = '<tr><td colspan="7">No request data available</td></tr>';
    }

    // 6. Response Time Visual
    document.getElementById('rm-avg').textContent = formatTime(metrics.responseTime.average);
    document.getElementById('rm-min').textContent = totalRequests > 0 ? formatTime(metrics.responseTime.minimum || 0) : '0 ms';
    document.getElementById('rm-max').textContent = formatTime(metrics.responseTime.maximum);
    
    const barsWrapper = document.getElementById('response-bars');
    barsWrapper.innerHTML = '';
    if (totalRequests > 0) {
        // Draw 3 simple bars representing min, avg, max
        const maxVal = Math.max(metrics.responseTime.maximum, 1);
        const minPct = Math.max((metrics.responseTime.minimum / maxVal) * 100, 5); // min 5% height
        const avgPct = Math.max((metrics.responseTime.average / maxVal) * 100, 5);
        const maxPct = 100;
        
        barsWrapper.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; width: 30%">
                <div class="bar" style="height: ${minPct}%; background-color: var(--color-success)"></div>
                <span style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px">Min</span>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; width: 30%">
                <div class="bar" style="height: ${avgPct}%; background-color: var(--color-info)"></div>
                <span style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px">Avg</span>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; width: 30%">
                <div class="bar" style="height: ${maxPct}%; background-color: var(--color-warning)"></div>
                <span style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px">Max</span>
            </div>
        `;
    }

    // 7. HTTP Status Distribution
    const statusDistContainer = document.querySelector('.status-dist');
    if (totalRequests === 0) {
        statusDistContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 1rem;">No request data available</div>';
    } else {
        if (!document.getElementById('count-2xx')) {
            statusDistContainer.innerHTML = `
                <div class="status-item status-2xx"><div class="status-name">2xx Success</div><div class="status-bar-bg"><div class="status-bar-fill" id="bar-2xx" style="width:0%"></div></div><div class="status-stats"><span id="count-2xx">0</span> (<span id="pct-2xx">0%</span>)</div></div>
                <div class="status-item status-3xx"><div class="status-name">3xx Redirection</div><div class="status-bar-bg"><div class="status-bar-fill" id="bar-3xx" style="width:0%"></div></div><div class="status-stats"><span id="count-3xx">0</span> (<span id="pct-3xx">0%</span>)</div></div>
                <div class="status-item status-4xx"><div class="status-name">4xx Client Error</div><div class="status-bar-bg"><div class="status-bar-fill" id="bar-4xx" style="width:0%"></div></div><div class="status-stats"><span id="count-4xx">0</span> (<span id="pct-4xx">0%</span>)</div></div>
                <div class="status-item status-5xx"><div class="status-name">5xx Server Error</div><div class="status-bar-bg"><div class="status-bar-fill" id="bar-5xx" style="width:0%"></div></div><div class="status-stats"><span id="count-5xx">0</span> (<span id="pct-5xx">0%</span>)</div></div>
            `;
        }
        const statuses = ['2xx', '3xx', '4xx', '5xx'];
        statuses.forEach(status => {
            const count = metrics.requests[`status${status}`];
            const pct = totalRequests > 0 ? (count / totalRequests) * 100 : 0;
            
            document.getElementById(`count-${status}`).textContent = count.toLocaleString();
            document.getElementById(`pct-${status}`).textContent = `${pct.toFixed(1)}%`;
            document.getElementById(`bar-${status}`).style.width = `${pct}%`;
        });
    }

    // 8. Incidents
    const incidents = detectIncidents(metrics);
    // Save to localStorage for detail view
    localStorage.setItem('intellitrace_incidents', JSON.stringify(incidents));
    
    const incidentsContainer = document.getElementById('incidents-container');
    if (incidents.length === 0) {
        incidentsContainer.innerHTML = '<div class="no-incidents">✓ No active incidents</div>';
    } else {
        incidentsContainer.innerHTML = '';
        incidents.forEach(inc => {
            const classSeverity = inc.severity === 'CRITICAL' ? 'critical' : 'warning';
            const icon = inc.severity === 'CRITICAL' ? '🔴' : '🟡';
            
            const div = document.createElement('div');
            div.className = `incident-item ${classSeverity}`;
            div.innerHTML = `
                <div class="incident-title">${icon} ${inc.title}</div>
                <div class="incident-details">
                    <div><strong>Target:</strong> ${inc.endpoint || inc.component}</div>
                    <div><strong>Value:</strong> ${inc.value}</div>
                </div>
                <div class="incident-actions">
                    <a href="/intellitrace/incidents/${inc.id}" class="btn btn-primary">Investigate</a>
                </div>
            `;
            incidentsContainer.appendChild(div);
        });
    }
};

const loadMetrics = async () => {
    try {
        const res = await fetch('/intellitrace/api/metrics');
        if (!res.ok) throw new Error('API Error');
        const metrics = await res.json();
        updateDashboard(metrics);
        document.getElementById('global-status-text').textContent = getGlobalStatus(metrics).text;
    } catch (err) {
        console.error('Failed to fetch metrics:', err);
        const indicator = document.getElementById('global-status-indicator');
        indicator.className = 'status-indicator critical';
        document.getElementById('global-status-text').textContent = 'Unable to load monitoring data';
    }
};

// Initial load & Polling
document.addEventListener('DOMContentLoaded', () => {
    loadMetrics();
    setInterval(loadMetrics, REFRESH_INTERVAL);
});
