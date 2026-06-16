import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Hero.module.css';

export default function Hero() {
    return (
        <div className={styles.hero}>
            <div className={styles.heroBadge}>
                <span className={styles.heroDot} />
                No login required
            </div>
            <h1 className={styles.heroTitle}>
                Share files <span className={styles.heroAccent}>instantly</span>
            </h1>
            <p className={styles.heroSub}>
                Drop a file, get a QR code. Scan and download.
            </p>

            <div className={styles.mobileNav}>
                <NavLink
                    to="/"
                    end
                    className={({ isActive }) => `${styles.mobileLink} ${isActive ? styles.active : ''}`}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>Upload</span>
                </NavLink>
                <NavLink
                    to="/download"
                    className={({ isActive }) => `${styles.mobileLink} ${isActive ? styles.active : ''}`}
                >
                    <svg className='align-center mr-2' width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download</span>
                </NavLink>
            </div>
        </div>
    );
}
