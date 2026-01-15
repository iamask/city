document.addEventListener('DOMContentLoaded', () => {
  let charts = {};
  let currentPage = 1;
  const pageSize = 10;

  const windowFilter = document.getElementById('windowFilter');
  const domainFilter = document.getElementById('domainFilter');
  const statusFilter = document.getElementById('statusFilter');
  const visibilityFilter = document.getElementById('visibilityFilter');
  const refreshBtn = document.getElementById('refreshBtn');
  const modal = document.getElementById('reportModal');
  const modalClose = document.getElementById('modalClose');
  const modalBody = document.getElementById('modalBody');

  // Initialize
  loadDashboard();

  // Event listeners
  refreshBtn.addEventListener('click', loadDashboard);
  windowFilter.addEventListener('change', loadDashboard);
  domainFilter.addEventListener('change', loadDashboard);
  statusFilter.addEventListener('change', () => { currentPage = 1; loadReports(); });
  visibilityFilter.addEventListener('change', () => { currentPage = 1; loadReports(); });
  modalClose.addEventListener('click', () => modal.style.display = 'none');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  async function loadDashboard() {
    const window = windowFilter.value;
    const domain = domainFilter.value;

    await Promise.all([
      loadStats(),
      loadDomainChart(),
      loadTimeseriesChart(window, domain),
      loadDomainStackChart(window),
      loadSeverityChart(window),
      loadVisibilityChart(),
      loadHotspots(window, domain),
      loadHotspotAreasChart(window, domain),
      loadRecommendations(window),
      loadReports(),
    ]);
  }

  async function loadStats() {
    try {
      const response = await fetch('/api/analytics/stats');
      const data = await response.json();

      document.getElementById('totalReports').textContent = data.total || 0;
      document.getElementById('todayReports').textContent = data.today || 0;
      document.getElementById('flaggedReports').textContent = data.flagged || 0;
      document.getElementById('topDomain').textContent = data.topDomain || '-';
    } catch (error) {
      console.error('Stats error:', error);
    }
  }

  async function loadDomainChart() {
    try {
      const response = await fetch('/api/analytics/domains');
      const data = await response.json();

      const labels = data.domains.map(d => d.domain);
      const values = data.domains.map(d => d.count);

      if (charts.domain) charts.domain.destroy();

      const ctx = document.getElementById('chartDomain').getContext('2d');
      charts.domain = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Reports',
            data: values,
            backgroundColor: [
              '#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ef4444', '#8b5cf6'
            ],
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      });
    } catch (error) {
      console.error('Domain chart error:', error);
    }
  }

  async function loadTimeseriesChart(window, domain) {
    try {
      let url = `/api/analytics/timeseries?window=${window}`;
      if (domain) url += `&domain=${domain}`;

      const response = await fetch(url);
      const data = await response.json();

      const labels = data.series.map(s => s.t);
      const values = data.series.map(s => s.count);

      if (charts.timeseries) charts.timeseries.destroy();

      const ctx = document.getElementById('chartReportsOverTime').getContext('2d');
      charts.timeseries = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Reports',
            data: values,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.3,
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      });
    } catch (error) {
      console.error('Timeseries chart error:', error);
    }
  }

  async function loadDomainStackChart(window) {
    try {
      const response = await fetch(`/api/analytics/domain-timeseries?window=${window}`);
      const data = await response.json();

      const labels = data.series.map(s => s.t);
      const domains = ['waste', 'water', 'power', 'roads', 'traffic', 'other'];
      const colors = {
        waste: '#10b981',
        water: '#3b82f6',
        power: '#f59e0b',
        roads: '#6366f1',
        traffic: '#ef4444',
        other: '#8b5cf6'
      };

      const datasets = domains.map(domain => ({
        label: domain.charAt(0).toUpperCase() + domain.slice(1),
        data: data.series.map(s => s[domain] || 0),
        backgroundColor: colors[domain],
      }));

      if (charts.domainStack) charts.domainStack.destroy();

      const ctx = document.getElementById('chartDomainStack').getContext('2d');
      charts.domainStack = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
          responsive: true,
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true }
          }
        }
      });
    } catch (error) {
      console.error('Domain stack chart error:', error);
    }
  }

  async function loadSeverityChart(window) {
    try {
      const response = await fetch(`/api/analytics/severity-timeseries?window=${window}`);
      const data = await response.json();

      const labels = data.series.map(s => s.t);
      const severities = ['safe', 'mild', 'moderate'];
      const colors = {
        safe: '#10b981',
        mild: '#f59e0b',
        moderate: '#ef4444'
      };

      const datasets = severities.map(severity => ({
        label: severity.charAt(0).toUpperCase() + severity.slice(1),
        data: data.series.map(s => s[severity] || 0),
        borderColor: colors[severity],
        backgroundColor: 'transparent',
        tension: 0.3,
      }));

      if (charts.severity) charts.severity.destroy();

      const ctx = document.getElementById('chartSeverity').getContext('2d');
      charts.severity = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true } }
        }
      });
    } catch (error) {
      console.error('Severity chart error:', error);
    }
  }

  async function loadVisibilityChart() {
    try {
      const response = await fetch('/api/analytics/stats');
      const data = await response.json();

      const labels = Object.keys(data.byVisibility || {});
      const values = Object.values(data.byVisibility || {});

      if (charts.visibility) charts.visibility.destroy();

      const ctx = document.getElementById('chartVisibility').getContext('2d');
      charts.visibility = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: ['#10b981', '#ef4444'],
          }]
        },
        options: {
          responsive: true,
        }
      });
    } catch (error) {
      console.error('Visibility chart error:', error);
    }
  }

  async function loadHotspotAreasChart(window, domain) {
    try {
      let url = `/api/analytics/hotspots?window=${window}`;
      if (domain) url += `&domain=${domain}`;

      const response = await fetch(url);
      const data = await response.json();

      const areaMap = new Map();
      for (const h of data.hotspots) {
        const area = h.area_key || 'unknown';
        areaMap.set(area, (areaMap.get(area) || 0) + h.count);
      }

      const sorted = Array.from(areaMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const labels = sorted.map(s => s[0]);
      const values = sorted.map(s => s[1]);

      if (charts.hotspotAreas) charts.hotspotAreas.destroy();

      const ctx = document.getElementById('chartHotspotAreas').getContext('2d');
      charts.hotspotAreas = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Reports',
            data: values,
            backgroundColor: '#6366f1',
          }]
        },
        options: {
          responsive: true,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true } }
        }
      });
    } catch (error) {
      console.error('Hotspot areas chart error:', error);
    }
  }

  async function loadHotspots(window, domain) {
    try {
      let url = `/api/analytics/hotspots?window=${window}`;
      if (domain) url += `&domain=${domain}`;

      const response = await fetch(url);
      const data = await response.json();

      const tbody = document.getElementById('hotspotsBody');

      if (!data.hotspots || data.hotspots.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No hotspots found</td></tr>';
        return;
      }

      tbody.innerHTML = data.hotspots.map(h => `
        <tr>
          <td><span class="badge badge-${h.domain}">${h.domain}</span></td>
          <td>${h.issue_type}</td>
          <td>${h.area_key || '-'}</td>
          <td>${h.count}</td>
          <td>${(h.avg_severity * 100).toFixed(0)}%</td>
          <td>
            <button class="btn btn-small" onclick="viewHotspotReports('${h.sample_ids.join(',')}')">View Reports</button>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('Hotspots error:', error);
      document.getElementById('hotspotsBody').innerHTML = '<tr><td colspan="6">Error loading hotspots</td></tr>';
    }
  }

  async function loadRecommendations(window) {
    try {
      const response = await fetch(`/api/analytics/recommendations?window=${window}`);
      const data = await response.json();

      const container = document.getElementById('recommendationsList');

      if (!data.recommendations || data.recommendations.length === 0) {
        container.innerHTML = '<p>No recommendations at this time.</p>';
        return;
      }

      container.innerHTML = data.recommendations.map(r => `
        <div class="recommendation-card priority-${r.priority}">
          <div class="rec-header">
            <span class="badge badge-${r.domain}">${r.domain}</span>
            <span class="priority-badge priority-${r.priority}">${r.priority}</span>
          </div>
          <h4>${r.title}</h4>
          <p>${r.rationale}</p>
          <p class="rec-area">Area: ${r.area_key}</p>
        </div>
      `).join('');
    } catch (error) {
      console.error('Recommendations error:', error);
      document.getElementById('recommendationsList').innerHTML = '<p>Error loading recommendations</p>';
    }
  }

  async function loadReports() {
    try {
      const params = new URLSearchParams({
        page: currentPage,
        pageSize: pageSize,
      });

      const status = statusFilter.value;
      const visibility = visibilityFilter.value;
      const domain = domainFilter.value;

      if (status) params.append('status', status);
      if (visibility) params.append('visibility', visibility);
      if (domain) params.append('domain', domain);

      const response = await fetch(`/api/admin/uploads?${params}`);
      const data = await response.json();

      const tbody = document.getElementById('reportsBody');

      if (!data.uploads || data.uploads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No reports found</td></tr>';
        document.getElementById('pagination').innerHTML = '';
        return;
      }

      tbody.innerHTML = data.uploads.map(r => `
        <tr>
          <td><a href="#" onclick="viewReport('${r.id}'); return false;">${r.id.slice(0, 8)}...</a></td>
          <td class="truncate">${r.text.slice(0, 50)}${r.text.length > 50 ? '...' : ''}</td>
          <td>${r.place_text}</td>
          <td><span class="badge badge-${r.ai_signals?.domain || 'other'}">${r.ai_signals?.domain || '-'}</span></td>
          <td><span class="badge badge-severity-${r.ai_severity}">${r.ai_severity || '-'}</span></td>
          <td><span class="status-badge status-${r.status}">${r.status}</span></td>
          <td>${new Date(r.created_at).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-small" onclick="viewReport('${r.id}')">View</button>
            ${r.visibility === 'public' 
              ? `<button class="btn btn-small btn-danger" onclick="blockReport('${r.id}')">Block</button>`
              : `<button class="btn btn-small btn-success" onclick="unblockReport('${r.id}')">Unblock</button>`
            }
          </td>
        </tr>
      `).join('');

      renderPagination(data.pagination);
    } catch (error) {
      console.error('Reports error:', error);
      document.getElementById('reportsBody').innerHTML = '<tr><td colspan="8">Error loading reports</td></tr>';
    }
  }

  function renderPagination(pagination) {
    const container = document.getElementById('pagination');
    const { page, totalPages } = pagination;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    if (page > 1) {
      html += `<button onclick="goToPage(${page - 1})">Previous</button>`;
    }
    html += `<span>Page ${page} of ${totalPages}</span>`;
    if (page < totalPages) {
      html += `<button onclick="goToPage(${page + 1})">Next</button>`;
    }

    container.innerHTML = html;
  }

  window.goToPage = function(page) {
    currentPage = page;
    loadReports();
  };

  window.viewReport = async function(id) {
    try {
      const response = await fetch(`/api/admin/uploads/${id}`);
      const report = await response.json();

      modalBody.innerHTML = `
        <div class="report-detail">
          ${report.hasImage ? `<img src="${report.imageUrl}" alt="Report image" class="report-image">` : ''}
          
          <div class="report-meta">
            <span class="badge badge-${report.ai_signals?.domain || 'other'}">${report.ai_signals?.domain || 'Report'}</span>
            <span class="badge badge-severity-${report.ai_severity}">${report.ai_severity}</span>
            <span class="status-badge status-${report.status}">${report.status}</span>
          </div>

          <h3>${report.place_text}</h3>
          <p><strong>Description:</strong> ${report.text}</p>
          
          ${report.place_area ? `<p><strong>Area:</strong> ${report.place_area}</p>` : ''}
          ${report.lat && report.lng ? `<p><strong>GPS:</strong> ${report.lat}, ${report.lng}</p>` : ''}
          <p><strong>Observed:</strong> ${report.observed_at ? new Date(report.observed_at).toLocaleString() : '-'}</p>
          <p><strong>Submitted:</strong> ${new Date(report.created_at).toLocaleString()}</p>
          
          ${report.ai_caption ? `
            <div class="ai-section">
              <h4>AI Analysis</h4>
              <p>${report.ai_caption}</p>
              ${report.ai_signals?.issue_types ? `<p><strong>Issues:</strong> ${report.ai_signals.issue_types.join(', ')}</p>` : ''}
              <p><strong>Confidence:</strong> ${(report.ai_confidence * 100).toFixed(0)}%</p>
            </div>
          ` : ''}

          ${report.ai_recommendations?.recommended_actions?.length ? `
            <div class="recommendations-section">
              <h4>Recommended Actions</h4>
              <ul>
                ${report.ai_recommendations.recommended_actions.map(r => `
                  <li><span class="priority-badge priority-${r.priority}">${r.priority}</span> ${r.title}</li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          <div class="modal-actions">
            <select id="statusSelect" onchange="updateStatus('${report.id}', this.value)">
              <option value="new" ${report.status === 'new' ? 'selected' : ''}>New</option>
              <option value="in_review" ${report.status === 'in_review' ? 'selected' : ''}>In Review</option>
              <option value="actioned" ${report.status === 'actioned' ? 'selected' : ''}>Actioned</option>
            </select>
            ${report.visibility === 'public'
              ? `<button class="btn btn-danger" onclick="blockReport('${report.id}')">Block</button>`
              : `<button class="btn btn-success" onclick="unblockReport('${report.id}')">Unblock</button>`
            }
            <button class="btn btn-danger" onclick="deleteReport('${report.id}')">Delete</button>
          </div>
        </div>
      `;

      modal.style.display = 'flex';
    } catch (error) {
      console.error('View report error:', error);
      alert('Error loading report');
    }
  };

  window.viewHotspotReports = function(ids) {
    const idList = ids.split(',');
    if (idList.length > 0) {
      viewReport(idList[0]);
    }
  };

  window.updateStatus = async function(id, status) {
    try {
      await fetch(`/api/admin/uploads/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      loadReports();
    } catch (error) {
      console.error('Update status error:', error);
      alert('Error updating status');
    }
  };

  window.blockReport = async function(id) {
    if (!confirm('Block this report?')) return;
    try {
      await fetch(`/api/admin/uploads/${id}/block`, { method: 'POST' });
      modal.style.display = 'none';
      loadReports();
      loadStats();
    } catch (error) {
      console.error('Block error:', error);
      alert('Error blocking report');
    }
  };

  window.unblockReport = async function(id) {
    try {
      await fetch(`/api/admin/uploads/${id}/unblock`, { method: 'POST' });
      modal.style.display = 'none';
      loadReports();
      loadStats();
    } catch (error) {
      console.error('Unblock error:', error);
      alert('Error unblocking report');
    }
  };

  window.deleteReport = async function(id) {
    if (!confirm('Delete this report permanently?')) return;
    try {
      await fetch(`/api/admin/uploads/${id}`, { method: 'DELETE' });
      modal.style.display = 'none';
      loadReports();
      loadStats();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Error deleting report');
    }
  };
});
