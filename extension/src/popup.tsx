import { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import './popup.css';
import type { ApiResult, JobData, SavedJob, User } from './types';
import type { RuntimeMessage, SaveJobResult } from './messages';
import { EXTRACT_RESULT, LOGOUT } from './messages';
import { WEB_ORIGIN } from './config';
// CRXJS `?script` build of the on-demand extractor. Injected into the active tab
// only when the declarative content script isn't there, so job data can be pulled
// from ANY website (not just LinkedIn/Indeed) using the same parsers.
import extractorScript from './extractor?script';

function Popup() {
  const [jobData, setJobData] = useState<JobData>({});
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
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

  const loadUser = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_ME' }, (response: ApiResult<User> | undefined) => {
      if (response?.success && response.data) setUser(response.data);
    });
  }, []);

  // Pulls job data from the active tab. First asks an already-injected content
  // script (LinkedIn/Indeed/web app). If none is listening — i.e. any other site —
  // falls back to injecting the extractor on demand via the Scripting API (allowed
  // by the activeTab grant the user gave by clicking the toolbar icon).
  const extractFromTab = useCallback((tabId: number) => {
    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_JOB' } satisfies RuntimeMessage, (response) => {
      if (!chrome.runtime.lastError && response?.job) {
        setJobData(response.job as JobData);
        return;
      }
      // No content script on this page: inject the extractor and await its result.
      const onResult = (msg: RuntimeMessage | undefined) => {
        if (msg?.type === EXTRACT_RESULT && msg.job) {
          setJobData(msg.job as JobData);
          chrome.runtime.onMessage.removeListener(onResult);
        }
      };
      chrome.runtime.onMessage.addListener(onResult);
      chrome.scripting.executeScript(
        { target: { tabId }, files: [extractorScript] },
        () => {
          if (chrome.runtime.lastError) chrome.runtime.onMessage.removeListener(onResult);
        },
      );
      // Safety: drop the listener if the page never responds (e.g. injection blocked).
      setTimeout(() => chrome.runtime.onMessage.removeListener(onResult), 4000);
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
      extractFromTab(tab.id);
    });
  }, [extractFromTab]);

  useEffect(() => {
    if (token) {
      loadJobs();
      loadUser();
    }
  }, [token, loadJobs, loadUser]);

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
      // Clear the free-text note so the next save starts fresh; keep the
      // auto-detected fields (title/company/…) for reference.
      setJobData((prev) => ({ ...prev, notes: '' }));
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

  const handleLogout = () => {
    chrome.runtime.sendMessage({ type: LOGOUT } satisfies RuntimeMessage, () => {
      setToken(null);
      setUser(null);
      setJobs([]);
      setMessage(null);
      setApplyMsg(null);
    });
  };

  if (loading) {
    return <div className="popup">Loading...</div>;
  }

  return (
    <div className="popup">
      <div className="header">
        <div className="header-title">
          <h2>Job Tracker</h2>
          {token && user && <p className="user-name">Signed in as {user.name}</p>}
        </div>
        {token && (
          <button onClick={handleLogout} className="btn-logout" title="Sign out">
            Log out
          </button>
        )}
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

          <div className="form-group">
            <label>Note</label>
            <textarea
              value={jobData.notes || ''}
              onChange={(e) => setJobData({ ...jobData, notes: e.target.value })}
              placeholder="Add a note (referral, follow-up, etc.)"
              rows={3}
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
