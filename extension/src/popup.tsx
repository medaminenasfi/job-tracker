import { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import './popup.css';
import type { ApiResult, JobData, SavedJob } from './types';
import type { SaveJobResult } from './messages';
import { WEB_ORIGIN } from './config';

function Popup() {
  const [jobData, setJobData] = useState<JobData>({});
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadJobs = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_JOBS' }, (response: ApiResult<SavedJob[]> | undefined) => {
      if (response?.success && response.data) setJobs(response.data);
    });
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (response) => {
      setToken(response?.token ?? null);
      setLoading(false);
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url) setCurrentUrl(tab.url);
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.job) setJobData(response.job);
      });
    });
  }, []);

  useEffect(() => {
    if (token) loadJobs();
  }, [token, loadJobs]);

  const matchedJob = jobs.find((job) => job.url && currentUrl && job.url === currentUrl);

  const handleSave = async () => {
    if (!token) {
      setMessage({ type: 'error', text: 'Please log in first' });
      return;
    }
    setSaving(true);
    const response: SaveJobResult | undefined = await chrome.runtime.sendMessage({
      type: 'SAVE_JOB',
      job: { ...jobData, source: jobData.source || 'manual' },
    });
    setSaving(false);

    if (response?.success) {
      setMessage({ type: 'success', text: 'Job saved successfully!' });
      loadJobs();
    } else {
      setMessage({ type: 'error', text: response?.error || 'Failed to save job' });
    }
  };

  const markApplied = async (jobId: string) => {
    if (!jobId) {
      setApplyMsg({ type: 'error', text: 'Select a job first' });
      return;
    }
    setApplying(true);
    const response: ApiResult<SavedJob> | undefined = await chrome.runtime.sendMessage({
      type: 'MARK_APPLIED',
      jobId,
    });
    setApplying(false);

    if (response?.success) {
      setApplyMsg({ type: 'success', text: 'Marked as applied' });
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: 'APPLIED' } : j)));
    } else {
      setApplyMsg({ type: 'error', text: response?.error || 'Failed to update status' });
    }
  };

  const handleLogin = () => {
    chrome.tabs.create({ url: `${WEB_ORIGIN}/extension-login` });
  };

  if (loading) {
    return <div className="popup">Loading...</div>;
  }

  return (
    <div className="popup">
      <div className="header">
        <h2>Job Tracker</h2>
      </div>

      {!token ? (
        <div className="login-section">
          <p>Please log in to save jobs</p>
          <button onClick={handleLogin} className="btn btn-primary">
            Log In
          </button>
        </div>
      ) : (
        <div className="content">
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={jobData.title || ''}
              onChange={(e) => setJobData({ ...jobData, title: e.target.value })}
              placeholder="Job title"
            />
          </div>

          <div className="form-group">
            <label>Company</label>
            <input
              type="text"
              value={jobData.company || ''}
              onChange={(e) => setJobData({ ...jobData, company: e.target.value })}
              placeholder="Company name"
            />
          </div>

          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              value={jobData.location || ''}
              onChange={(e) => setJobData({ ...jobData, location: e.target.value })}
              placeholder="Location"
            />
          </div>

          <div className="form-group">
            <label>Salary</label>
            <input
              type="text"
              value={jobData.salary || ''}
              onChange={(e) => setJobData({ ...jobData, salary: e.target.value })}
              placeholder="Salary"
            />
          </div>

          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Saving...' : 'Save Job'}
          </button>

          {message && <div className={`message ${message.type}`}>{message.text}</div>}

          <hr className="divider" />

          <div className="apply-section">
            <h3>Applications</h3>
            {matchedJob ? (
              <>
                <p className="hint">
                  Saved job for this page: <strong>{matchedJob.title}</strong> ({matchedJob.status})
                </p>
                <button
                  onClick={() => markApplied(matchedJob.id)}
                  disabled={applying || matchedJob.status === 'APPLIED'}
                  className="btn btn-secondary"
                >
                  {matchedJob.status === 'APPLIED' ? '✓ Applied' : applying ? 'Updating...' : '✓ Mark as Applied'}
                </button>
              </>
            ) : jobs.length > 0 ? (
              <>
                <div className="form-group">
                  <label>Mark a saved job as applied</label>
                  <select value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)}>
                    <option value="">Select a job…</option>
                    {jobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title} — {job.company} ({job.status})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => markApplied(selectedJobId)}
                  disabled={applying || !selectedJobId}
                  className="btn btn-secondary"
                >
                  {applying ? 'Updating...' : '✓ Mark as Applied'}
                </button>
              </>
            ) : (
              <p className="hint">Save a job to start tracking applications.</p>
            )}

            {applyMsg && <div className={`message ${applyMsg.type}`}>{applyMsg.text}</div>}
            <p className="fine-print">
              We&apos;ll try to detect applications automatically on LinkedIn and Indeed — you can
              always confirm manually here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Popup />);
