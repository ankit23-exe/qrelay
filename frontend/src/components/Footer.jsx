import React from 'react';
import styles from './Footer.module.css';

export default function Footer() {
    return (
        <footer className={styles.footer}>
            <p>Files are auto deleted after <strong>10 minutes</strong> &bull; All file types supported</p>
        </footer>
    );
}
