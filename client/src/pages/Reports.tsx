import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ReportSummary, DatasetSummary } from '../api/client';

export default function Reports() {
  const navigate = useNavigate();

  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New report modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | ''>('');
  const [reportTitle, setReportTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [reportsRes, datasetsRes] = await Promise.all([
        api.reports.list(),
        api.datasets.list(),
      ]);
      setReports(reportsRes.reports);
      setDatasets(datasetsRes.datasets);
      if (datasetsRes.datasets.length > 0 && selectedDatasetId === '') {
        setSelectedDatasetId(datasetsRes.datasets[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDatasetId) return;

    try {
      setCreating(true);
      const res = await api.reports.create(Number(selectedDatasetId), reportTitle || undefined);
      setShowModal(false);
      navigate(`/reports/${res.id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to create report.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteReport = async (id: number, title: string) => {
    if (!window.confirm(`Delete report "${title}"?`)) return;
    try {
      await api.reports.delete(id);
      setReports(reports.filter((r) => r.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete report.');
    }
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>Reports</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
            Build and share verified reports with transparent metric calculations.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="btn btn-primary"
          disabled={datasets.length === 0}
        >
          + New Report
        </button>
      </div>

      {loading && (
        <div className="card state-loading">
          <div className="state-title">Loading reports...</div>
          <p>Fetching your saved report configurations.</p>
        </div>
      )}

      {error && (
        <div className="card state-error">
          <div className="state-title" style={{ color: 'var(--danger)' }}>Error Loading Reports</div>
          <p style={{ marginBottom: '1rem' }}>{error}</p>
          <button type="button" onClick={fetchData} className="btn btn-outline btn-sm">
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="card state-empty">
          <div className="state-title">No reports created yet</div>
          <p style={{ marginBottom: '1.25rem' }}>
            {datasets.length === 0
              ? 'Upload a CSV dataset first to begin building reports.'
              : 'Create your first report using one of your uploaded datasets.'}
          </p>
          {datasets.length === 0 ? (
            <Link to="/datasets" className="btn btn-primary">
              Go to Datasets
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="btn btn-primary"
            >
              + Create First Report
            </button>
          )}
        </div>
      )}

      {!loading && !error && reports.length > 0 && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Report Title</th>
                <th>Underlying Dataset</th>
                <th>Last Updated</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link to={`/reports/${r.id}`}>{r.title}</Link>
                  </td>
                  <td>
                    <Link to={`/datasets/${r.dataset_id}`} style={{ color: 'var(--muted)' }}>
                      {r.dataset_name}
                    </Link>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    {new Date(r.updated_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <Link to={`/reports/${r.id}`} className="btn btn-primary btn-sm">
                        Open Editor
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteReport(r.id, r.title)}
                        className="btn btn-danger btn-sm"
                        aria-label={`Delete report ${r.title}`}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Report Modal Dialog */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(38, 70, 83, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 100,
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem' }}>
              Create New Report
            </h2>

            <form onSubmit={handleCreateReport}>
              <div className="form-group">
                <label className="form-label" htmlFor="new-report-dataset">
                  Select Dataset
                </label>
                <select
                  id="new-report-dataset"
                  className="form-input"
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(Number(e.target.value))}
                  required
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.row_count} rows)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="new-report-title">
                  Report Title
                </label>
                <input
                  id="new-report-title"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Monthly Performance Breakdown"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !selectedDatasetId}
                  className="btn btn-primary"
                >
                  {creating ? 'Creating...' : 'Create & Open'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
