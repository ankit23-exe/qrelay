import React, { useState, useEffect, useRef } from 'react';
import API from '../api';
import { useSearchParams } from 'react-router-dom';
import styles from './DownloadPage.module.css';

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* ── Session countdown badge ── */
function CountdownBadge({ expiresAt }) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const calc = () => Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    setTimeLeft(calc());
    const id = setInterval(() => {
      const t = calc();
      setTimeLeft(t);
      if (t <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  const pct = (timeLeft / 600) * 100;
  const color = timeLeft > 120 ? '#22c55e' : timeLeft > 60 ? '#f97316' : '#ef4444';

  if (timeLeft === 0) {
    return (
      <div className={styles.expiredBadge}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Session has expired
      </div>
    );
  }

  return (
    <div className={styles.timerSection}>
      <div className={styles.timerTop}>
        <span className={styles.timerIcon}>⏱</span>
        <span className={styles.timerText}>Session expires in</span>
        <span className={styles.timerDigits} style={{ color }}>{mins}:{secs}</span>
      </div>
      <div className={styles.timerBar}>
        <div className={styles.timerBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ── Single file download row ── */
function FileDownloadRow({ code, file }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      const response = await API.get(
        `/download/${code}/${encodeURIComponent(file.originalName)}`,
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data]);
      const contentDisposition = response.headers['content-disposition'];
      let filename = file.originalName;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^;"'\n]+)["']?/i);
        if (match) filename = decodeURIComponent(match[1]);
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setDone(true);
    } catch (err) {
      if (err?.response?.status === 410) {
        setError('Session expired.');
      } else {
        setError('Download failed.');
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={styles.fileItem}>
      <div className={styles.fileItemLeft}>
        <span className={styles.fileEmoji}>📄</span>
        <div className={styles.fileItemMeta}>
          <span className={styles.fileItemName}>{file.originalName}</span>
          <span className={styles.fileItemSize}>{formatBytes(file.size)}</span>
        </div>
      </div>
      <div className={styles.fileItemRight}>
        {error && <span className={styles.fileItemError}>{error}</span>}
        <button
          className={`${styles.dlBtn} ${done ? styles.dlBtnDone : ''}`}
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <span className={styles.spinner} />
          ) : done ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Done
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function DownloadPage() {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get('code')?.toUpperCase() || '');
  const [sessionInfo, setSessionInfo] = useState(null); // { files, expiresAt }
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const urlCode = searchParams.get('code');
    if (urlCode) fetchInfo(urlCode.toUpperCase());
  }, []);

  const fetchInfo = async (c) => {
    const target = (c || code).toUpperCase().trim();
    if (!target || target.length !== 6) {
      setError('Please enter a valid 6-character code.');
      return;
    }
    setLoading(true);
    setError('');
    setSessionInfo(null);
    try {
      const { data } = await API.get(`/file-info/${target}`);
      setSessionInfo({ ...data, code: target });
      setChecked(true);
    } catch (err) {
      const msg = err?.response?.data?.error;
      if (err?.response?.status === 410) {
        setError('This session has expired and all files have been deleted.');
      } else {
        setError(msg || 'Invalid code. Session not found.');
      }
      setChecked(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeInput = (e) => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(v);
    setError('');
    if (checked) { setChecked(false); setSessionInfo(null); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.cardHeader}>
          <div className={styles.headerIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div>
            <h2 className={styles.cardTitle}>Receive Files</h2>
            <p className={styles.cardSub}>Enter the 6-character share code</p>
          </div>
        </div>

        {/* Code input */}
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            className={styles.codeInput}
            value={code}
            onChange={handleCodeInput}
            onKeyDown={(e) => e.key === 'Enter' && !checked && fetchInfo()}
            placeholder="A1B2C3"
            maxLength={6}
            spellCheck={false}
            autoComplete="off"
          />
          {!checked ? (
            <button
              className={styles.checkBtn}
              onClick={() => fetchInfo()}
              disabled={loading || code.length !== 6}
            >
              {loading ? <span className={styles.spinner} /> : 'Find Files'}
            </button>
          ) : (
            <button
              className={styles.checkBtn}
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'default' }}
              disabled
            >
              Found ✓
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className={styles.errorBox}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* Session files */}
        {sessionInfo && (
          <div className={styles.sessionCard}>
            {/* Session info bar */}
            <div className={styles.sessionMeta}>
              <span className={styles.sessionCount}>
                {sessionInfo.files.length} file{sessionInfo.files.length !== 1 ? 's' : ''}
              </span>
              <CountdownBadge expiresAt={sessionInfo.expiresAt} />
            </div>

            {/* File list */}
            <div className={styles.fileListDl}>
              {sessionInfo.files.map((f, i) => (
                <FileDownloadRow key={i} code={sessionInfo.code} file={f} />
              ))}
            </div>
          </div>
        )}
      </div>

      
    </div>
  );
}
