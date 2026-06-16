import React, { useState, useEffect } from 'react';
import styles from './ResultCard.module.css';

/* ── Countdown Timer ── */
function CountdownTimer({ expiresAt, onExpire }) {
    const calcTimeLeft = () => Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const [timeLeft, setTimeLeft] = useState(calcTimeLeft);

    useEffect(() => {
        const id = setInterval(() => {
            const t = calcTimeLeft();
            setTimeLeft(t);
            if (t <= 0) {
                clearInterval(id);
                if (onExpire) onExpire();
            }
        }, 1000);
        return () => clearInterval(id);
    }, [expiresAt, onExpire]);

    const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
    const secs = String(timeLeft % 60).padStart(2, '0');
    const pct = (timeLeft / 600) * 100;

    const color = timeLeft > 120 ? '#22c55e' : timeLeft > 60 ? '#f97316' : '#ef4444';

    return (
        <div className={styles.timerWrapper}>
            <span className={styles.timerLabel}>Expires in:</span>
            <span className={styles.timerDigits} style={{ color }}>
                {timeLeft > 0 ? `${mins}:${secs}` : "EXPIRED"}
            </span>
        </div>
    );
}

/* ── Result Card Component ── */
export default function ResultCard({ result, collapsed, onToggle, onExpire }) {
    const [copied, setCopied] = useState(false);

    const copyCode = (e) => {
        e.stopPropagation(); // prevent collapsing when clicking copy
        if (!result) return;
        navigator.clipboard.writeText(result.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!result) return null;

    const isExpired = result.expiresAt <= Date.now();

    return (
        <div className={`${styles.resultCard} ${collapsed ? styles.isCollapsed : ''}`}>
            <div className={styles.resultHeader} onClick={onToggle} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className={styles.headerInfo}>
                    <div className={styles.successBadge}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {isExpired ? 'Expired' : 'Uploaded'}
                    </div>
                    <p className={styles.resultFileName}>
                        <span>📄</span> {result.originalName}
                    </p>
                </div>
                <div className={`${styles.chevron} ${!collapsed ? styles.chevronOpen : ''}`} style={{ transition: 'transform 0.3s', transform: !collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </div>
            </div>

            {!collapsed && !isExpired && (
                <div className={styles.resultBody}>
                    <div className={styles.qrSection}>
                        <p className={styles.sectionLabel}>Scan QR Code</p>
                        <img src={result.qrCodeImage} alt="QR Code" className={styles.qrImage} />
                    </div>

                    <div className={styles.divider}>
                        <span>or</span>
                    </div>

                    <div className={styles.codeSection}>
                        <p className={styles.sectionLabel}>Share this code</p>
                        <div className={styles.codeBox}>
                            <span className={styles.code}>{result.code}</span>
                            <button className={`${styles.copyBtn} ${copied ? styles.copied : ''}`} onClick={copyCode}>
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        <p className={styles.codeHint}>Recipient can enter this code on the Download page</p>
                    </div>

                    <CountdownTimer expiresAt={result.expiresAt} onExpire={onExpire} />
                </div>
            )}

            {!collapsed && isExpired && (
                <div className={styles.resultBody}>
                    <p className={styles.expiredText} style={{ color: 'var(--red)', textAlign: 'center', fontSize: '0.9rem', padding: '20px' }}>
                        This file has expired and been deleted from the server.
                    </p>
                </div>
            )}
        </div>
    );
}

