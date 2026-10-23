import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, DatasetDetail as DatasetDetailType } from '../api/client';

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [dataset, setDataset] = useState<DatasetDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingReport, setCreatingReport] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchDataset = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.datasets.get(id);
        setDataset(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load dataset details.');
      } finally {
        setLoading(false);
      }
    };

    fetchDataset();
  }, [id]);

  const handleCreateReport = async () => {
    if (!dataset) return;
    try {
      setCreatingReport(true);
      const res = await api.reports.create(dataset.id, `${dataset.name} Report`);
      navigate(`/reports/${res.id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to create report.');
    } finally {
      setCreatingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="card state-loading">
        <div className="state-title">Loading dataset profile...</div>
        <p>Analyzing schema, column types, and data-quality statistics.</p>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className="card state-error">
        <div className="state-title" style={{ color: 'var(--danger)' }}>Dataset Not Found</div>
        <p style={{ marginBottom: '1.25rem' }}>{error || 'This dataset could not be located.'}</p>
        <Link to="/datasets" className="btn btn-primary">
          Back to Datasets
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header and Actions */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <Link to="/datasets" style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
              ← Datasets
            </Link>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>
            {dataset.name}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
            Uploaded on {new Date(dataset.created_at).toLocaleString()}
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreateReport}
          disabled={creatingReport}
          className="btn btn-primary"
        >
          {creatingReport ? 'Creating Report...' : '+ Create Report from Dataset'}
        </button>
      </div>

      {/* Overview Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <div className="card">
          <div style={{ color: 'var(--muted)', fontSize: '0.8125rem', fontWeight: 600 }}>Total Valid Rows</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.25rem' }}>
            {dataset.row_count.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '0.25rem' }}>
            Ready for queries and aggregations
          </div>
        </div>

        <div className="card">
          <div style={{ color: 'var(--muted)', fontSize: '0.8125rem', fontWeight: 600 }}>Columns Profiled</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.25rem' }}>
            {dataset.columns.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
            Inferred server-side
          </div>
        </div>

        <div className="card">
          <div style={{ color: 'var(--muted)', fontSize: '0.8125rem', fontWeight: 600 }}>Unreadable Rows</div>
          <div style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: dataset.badRows.length > 0 ? 'var(--warn)' : 'var(--primary)',
            marginTop: '0.25rem',
          }}>
            {dataset.badRows.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
            {dataset.badRows.length === 0 ? 'Zero malformed rows' : 'Rejected during parsing'}
          </div>
        </div>
      </div>

      {/* Columns Schema Table */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>
          Column Schema & Inferred Types
        </h2>

        {dataset.columns.length === 0 ? (
          <div className="state-empty">No column metadata found.</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>#</th>
                  <th>Original Header</th>
                  <th>Safe Identifier</th>
                  <th>Detected Type</th>
                  <th>Missing Values</th>
                  <th>Type Inference Rule</th>
                </tr>
              </thead>
              <tbody>
                {dataset.columns.map((col) => (
                  <tr key={col.col_index}>
                    <td style={{ color: 'var(--muted)' }}>{col.col_index + 1}</td>
                    <td style={{ fontWeight: 600 }}>{col.original_name}</td>
                    <td>
                      <code style={{ background: 'var(--bg)', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>
                        {col.safe_name}
                      </code>
                    </td>
                    <td>
                      <span className={`badge badge-${col.detected_type}`}>
                        {col.detected_type}
                      </span>
                    </td>
                    <td>
                      {col.missing_count > 0 ? (
                        <span style={{ color: 'var(--warn)', fontWeight: 600 }}>
                          {col.missing_count.toLocaleString()} nulls
                        </span>
                      ) : (
                        <span style={{ color: 'var(--primary)' }}>0 (Complete)</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>
                      {col.type_rule || 'Deterministic parser rule'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bad Rows Section */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text)' }}>
              Rows That Could Not Be Read
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.8125rem', marginTop: '0.15rem' }}>
              Malformed CSV rows that were rejected during ingestion with transparent line numbers and reasons.
            </p>
          </div>
          <span className="badge" style={{
            background: dataset.badRows.length > 0 ? '#FEF8ED' : 'var(--primary-soft)',
            color: dataset.badRows.length > 0 ? 'var(--warn)' : 'var(--primary)',
          }}>
            {dataset.badRows.length} {dataset.badRows.length === 1 ? 'Row' : 'Rows'}
          </span>
        </div>

        {dataset.badRows.length === 0 ? (
          <div style={{
            padding: '1.5rem',
            textAlign: 'center',
            background: 'var(--primary-soft)',
            borderRadius: '6px',
            color: 'var(--primary)',
            fontWeight: 500,
            fontSize: '0.875rem',
          }}>
            ✓ All rows in this CSV were parsed and profiled successfully.
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Line Number</th>
                  <th>Rejection Reason</th>
                </tr>
              </thead>
              <tbody>
                {dataset.badRows.map((bad, index) => (
                  <tr key={index}>
                    <td style={{ fontWeight: 600, color: 'var(--danger)' }}>
                      Row {bad.row_number}
                    </td>
                    <td>{bad.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invalid Cells Section (if present) */}
      {dataset.invalidCells && dataset.invalidCells.length > 0 && (
        <div className="card">
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text)' }}>
              Invalid Value Cells
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.8125rem', marginTop: '0.15rem' }}>
              Cells containing values that do not match the column's detected data type.
            </p>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Column Index</th>
                  <th>Raw Cell Value</th>
                  <th>Explanation</th>
                </tr>
              </thead>
              <tbody>
                {dataset.invalidCells.map((cell, idx) => (
                  <tr key={idx}>
                    <td>Row {cell.row_number}</td>
                    <td>Column {cell.col_index + 1}</td>
                    <td>
                      <code>{cell.raw_value}</code>
                    </td>
                    <td style={{ color: 'var(--warn)' }}>{cell.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
