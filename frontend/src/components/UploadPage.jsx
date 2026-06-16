import React, { useState, useRef, useCallback, useEffect } from 'react';
import API from '../api';
import styles from './UploadPage.module.css';

const MAX_TOTAL_SIZE = 10 * 1024 * 1024;
const SESSION_KEY = 'qrelay_active_sessions';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* ── Countdown Timer ── */
function CountdownTimer({ expiresAt, onExpire }) {
  const calc = () => Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const [timeLeft, setTimeLeft] = useState(calc);

  useEffect(() => {
    const id = setInterval(() => {
      const t = calc();
      setTimeLeft(t);
      if (t <= 0) { clearInterval(id); onExpire && onExpire(); }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  const pct = (timeLeft / 600) * 100;
  const color = timeLeft > 120 ? '#22c55e' : timeLeft > 60 ? '#f97316' : '#ef4444';

  if (timeLeft === 0) return null;

  return (
    <div className={styles.timerInline}>
      <span className={styles.timerDigitsInline} style={{ color }}>{mins}:{secs}</span>
      <div className={styles.timerBarInline}>
        <div className={styles.timerBarFillInline} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ── Session Card ── */
function SessionCard({ session, expanded, onToggle, onTerminate, onExpire }) {
  const [copied, setCopied] = useState(false);
  const [terminating, setTerminating] = useState(false);

  const copyCode = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(session.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTerminate = async (e) => {
    e.stopPropagation();
    setTerminating(true);
    try { await API.delete(`/terminate/${session.code}`); } catch { /* expired */ }
    finally { setTerminating(false); onTerminate(session.code); }
  };

  const isExpired = session.expiresAt <= Date.now();

  return (
    <div className={`${styles.sessionCard} ${isExpired ? styles.sessionExpired : ''}`}>
      {/* Always-visible header row */}
      <div className={styles.sessionHeader} onClick={onToggle}>
        <div className={styles.sessionHeaderLeft}>
          <span className={styles.sessionCodeBadge}>{session.code}</span>
          <span className={styles.sessionFilesLabel}>
            {session.files.length} file{session.files.length !== 1 ? 's' : ''}
            &nbsp;·&nbsp;
            {formatBytes(session.files.reduce((s, f) => s + f.size, 0))}
          </span>
        </div>
        <div className={styles.sessionHeaderRight}>
          {!isExpired && (
            <CountdownTimer expiresAt={session.expiresAt} onExpire={() => onExpire(session.code)} />
          )}
          {isExpired && <span className={styles.expiredTag}>Expired</span>}
          <svg
            className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && !isExpired && (
        <div className={styles.sessionBody}>
          <div className={styles.sessionQrRow}>
            <div className={styles.sessionQrWrap}>
              <p className={styles.sectionLabel}>Scan to download</p>
              <img src={session.qrCodeImage} alt="QR" className={styles.qrImage} />
            </div>

            <div className={styles.sessionCodeWrap}>
              <p className={styles.sectionLabel}>Share code</p>
              <div className={styles.codeBox}>
                <span className={styles.code}>{session.code}</span>
                <button className={`${styles.copyBtn} ${copied ? styles.copied : ''}`} onClick={copyCode}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className={styles.codeHint}>Enter on the Download page</p>

              <div className={styles.sessionFilesMini}>
                {session.files.map((f, i) => (
                  <div key={i} className={styles.sessionFileMiniRow}>
                    <span>📄</span>
                    <span className={styles.sessionFileMiniName}>{f.originalName}</span>
                    <span className={styles.sessionFileMiniSize}>{formatBytes(f.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            className={styles.terminateBtn}
            onClick={handleTerminate}
            disabled={terminating}
          >
            {terminating ? <span className={styles.spinnerDark} /> : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
              </svg>
            )}
            Terminate &amp; Delete Files
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */
export default function UploadPage() {
  const [sessions, setSessions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const overLimit = totalSize > MAX_TOTAL_SIZE;

  const saveSessions = (arr) => {
    const valid = arr.filter(s => s.expiresAt > Date.now());
    if (valid.length > 0) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(valid));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  };

  // Restore from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const valid = parsed.filter(p => p.expiresAt > Date.now());
        if (valid.length > 0) {
          setSessions(valid);
          setExpandedId(valid[valid.length - 1].code);
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const addFiles = (incoming) => {
    setError('');
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      const merged = [...prev, ...incoming.filter(f => !existing.has(f.name + f.size))];
      const newTotal = merged.reduce((s, f) => s + f.size, 0);
      if (newTotal > MAX_TOTAL_SIZE) {
        setError(`Total size would be ${formatBytes(newTotal)}, exceeding the 10 MB limit.`);
      }
      return merged;
    });
  };

  const removeFile = (idx) => { setFiles(prev => prev.filter((_, i) => i !== idx)); setError(''); };

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) addFiles(dropped);
  }, []);
  const onDragOver = useCallback((e) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onFileChange = (e) => {
    const picked = Array.from(e.target.files);
    if (picked.length) addFiles(picked);
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!files.length || overLimit) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      files.forEach(f => form.append('files', f));
      const { data } = await API.post('/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const newSession = {
        code: data.code,
        qrCodeImage: data.qrCodeImage,
        expiresAt: Date.now() + data.expiresIn * 1000,
        files: data.files,
      };
      setSessions(prev => {
        const updated = [...prev, newSession];
        saveSessions(updated);
        return updated;
      });
      setExpandedId(newSession.code);
      setFiles([]);
    } catch (err) {
      setError(err?.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleTerminate = (code) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.code !== code);
      saveSessions(updated);
      return updated;
    });
    if (expandedId === code) setExpandedId(null);
  };

  const handleExpire = (code) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.code !== code);
      saveSessions(updated);
      return updated;
    });
    if (expandedId === code) setExpandedId(null);
  };

  return (
    <div className={styles.page}>

      {/* Active sessions list */}
      {sessions.length > 0 && (
        <div className={styles.sessionList}>
          <div className={styles.sessionListLabel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
            Active Sessions ({sessions.length})
          </div>
          {sessions.map(s => (
            <SessionCard
              key={s.code}
              session={s}
              expanded={expandedId === s.code}
              onToggle={() => setExpandedId(prev => prev === s.code ? null : s.code)}
              onTerminate={handleTerminate}
              onExpire={handleExpire}
            />
          ))}
        </div>
      )}

      {/* Upload card — always visible */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.headerIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div>
            <h2 className={styles.cardTitle}>Share Files</h2>
            <p className={styles.cardSub}>Select any number of files — 10 MB total limit</p>
          </div>
        </div>

        <div className={styles.dropZoneWrap}>
          <div
            className={`${styles.dropZone} ${dragging ? styles.dragging : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" hidden multiple onChange={onFileChange} />
            <div className={styles.dropIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className={styles.dropTitle}>Drag &amp; drop files here</p>
            <p className={styles.dropSub}>or click to browse &nbsp;·&nbsp; max 10 MB total</p>
          </div>
        </div>

        {files.length > 0 && (
          <div className={styles.fileList}>
            {files.map((f, i) => (
              <div key={i} className={styles.fileRow}>
                <span className={styles.fileEmoji}>📄</span>
                <div className={styles.fileMeta}>
                  <span className={styles.fileName}>{f.name}</span>
                  <span className={styles.fileSize}>{formatBytes(f.size)}</span>
                </div>
                <button className={styles.removeBtn} onClick={() => removeFile(i)} title="Remove">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
            <div className={styles.totalRow}>
              <div className={styles.totalBar}>
                <div
                  className={styles.totalBarFill}
                  style={{
                    width: `${Math.min(100, (totalSize / MAX_TOTAL_SIZE) * 100)}%`,
                    background: overLimit ? '#ef4444' : totalSize > MAX_TOTAL_SIZE * 0.8 ? '#f97316' : '#22c55e',
                  }}
                />
              </div>
              <span className={styles.totalLabel} style={{ color: overLimit ? '#ef4444' : 'var(--text-muted)' }}>
                {formatBytes(totalSize)} / 10 MB
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className={styles.errorBox}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <div className={styles.cardFooter}>
          <button
            className={styles.uploadBtn}
            onClick={handleUpload}
            disabled={!files.length || overLimit || uploading}
          >
            {uploading ? (
              <><span className={styles.spinner} /> Uploading…</>
            ) : (
              <>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload &amp; Share
              </>
            )}
          </button>
        </div>
      </div>

      
    </div>
  );
}
