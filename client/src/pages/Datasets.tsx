import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, DatasetSummary } from '../api/client';

export default function Datasets() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [creatingReportForId, setCreatingReportForId] = useState<number | null>(null);

  const fetchDatasets = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.datasets.list();
      setDatasets(res.datasets);
    } catch (err: any) {
      setError(err.message || 'Failed to load datasets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileSelected(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setUploadError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Only .csv files are supported.');
      return;
    }
    setSelectedFile(file);
    if (!datasetName) {
      setDatasetName(file.name.replace(/\.csv$/i, ''));
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a CSV file first.');
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);
      const res = await api.datasets.upload(selectedFile, datasetName);
      setSelectedFile(null);
      setDatasetName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      // Direct user to view the newly uploaded dataset profile
      navigate(`/datasets/${res.id}`);
    } catch (err: any) {
      setUploadError(err.message || 'CSV upload failed. Verify that your file is formatted correctly.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete dataset "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.datasets.delete(id);
      setDatasets(datasets.filter((d) => d.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete dataset.');
    }
  };

  const handleCreateReport = async (datasetId: number, name: string) => {
    try {
      setCreatingReportForId(datasetId);
      const res = await api.reports.create(datasetId, `${name} Report`);
      navigate(`/reports/${res.id}`);
    } catch (err: any) {
      alert(err.message || 'Failed to create report.');
    } finally {
      setCreatingReportForId(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>Datasets</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
          Upload CSV files, inspect data quality profiles, and verify parsed rows.
        </p>
      </div>

      {/* Upload Dropzone Section */}
      <div className="card" style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text)' }}>
          Upload New CSV Dataset
        </h2>

        {uploadError && (
          <div className="alert alert-danger" role="alert">
            <span>{uploadError}</span>
          </div>
        )}

        <form onSubmit={handleUploadSubmit}>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border)'}`,
              background: dragActive ? 'var(--primary-soft)' : 'var(--bg)',
              borderRadius: '8px',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: '1.25rem',
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            aria-label="CSV file upload dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              id="csv-file-input"
            />

            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>
              {selectedFile ? `Selected: ${selectedFile.name}` : 'Drag & drop your CSV file here'}
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(1)} KB — Ready to upload`
                : 'Or click the button below to browse from your device (up to 10 MB)'}
            </p>

            <button
              type="button"
              className="btn btn-outline"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Browse CSV File
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="dataset-name-input">
                Dataset Name (Optional)
              </label>
              <input
                id="dataset-name-input"
                type="text"
                className="form-input"
                placeholder="e.g. Sales Q3 Data"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                disabled={uploading}
              />
            </div>

            <button
              type="submit"
              disabled={!selectedFile || uploading}
              className="btn btn-primary"
              style={{ minWidth: '140px' }}
            >
              {uploading ? 'Processing...' : 'Upload & Profile'}
            </button>
          </div>
        </form>
      </div>

      {/* Datasets List Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text)' }}>
            Your Uploaded Datasets
          </h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
            {datasets.length} {datasets.length === 1 ? 'dataset' : 'datasets'}
          </span>
        </div>

        {loading && (
          <div className="card state-loading">
            <div className="state-title">Loading datasets...</div>
            <p>Fetching your verified datasets from the server.</p>
          </div>
        )}

        {error && (
          <div className="card state-error">
            <div className="state-title" style={{ color: 'var(--danger)' }}>Error Loading Datasets</div>
            <p style={{ marginBottom: '1rem' }}>{error}</p>
            <button type="button" onClick={fetchDatasets} className="btn btn-outline btn-sm">
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && datasets.length === 0 && (
          <div className="card state-empty">
            <div className="state-title">No datasets uploaded yet</div>
            <p style={{ marginBottom: '1rem' }}>
              Upload your first CSV spreadsheet above to inspect data types and build reports.
            </p>
          </div>
        )}

        {!loading && !error && datasets.length > 0 && (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dataset Name</th>
                  <th>Row Count</th>
                  <th>Uploaded Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link to={`/datasets/${d.id}`}>{d.name}</Link>
                    </td>
                    <td>{d.row_count.toLocaleString()} rows</td>
                    <td style={{ color: 'var(--muted)' }}>
                      {new Date(d.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <Link to={`/datasets/${d.id}`} className="btn btn-outline btn-sm">
                          View Profile
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleCreateReport(d.id, d.name)}
                          disabled={creatingReportForId === d.id}
                          className="btn btn-primary btn-sm"
                        >
                          {creatingReportForId === d.id ? 'Creating...' : '+ Report'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(d.id, d.name)}
                          className="btn btn-danger btn-sm"
                          aria-label={`Delete dataset ${d.name}`}
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
      </div>
    </div>
  );
}
