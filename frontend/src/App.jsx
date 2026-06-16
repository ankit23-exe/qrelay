import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import Footer from './components/Footer.jsx';
import MouseFollower from './components/MouseFollower.jsx';
import UploadPage from './components/UploadPage.jsx';
import DownloadPage from './components/DownloadPage.jsx';
import styles from './App.module.css';

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <BrowserRouter>
      <div className={styles.shell}>
        <Nav theme={theme} toggleTheme={toggleTheme} />
        <Hero />

        {/* ── Main content ── */}
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/download" element={<DownloadPage />} />
          </Routes>
        </main>

        <Footer />

        {/* Background elements */}
         <MouseFollower /> 
        <div className={styles.sideGlowLeft} />
        <div className={styles.sideGlowRight} />
        <div className={styles.orb3} />
        {/* <div className={styles.orb1} />
        <div className={styles.orb2} /> */}
      </div>
    </BrowserRouter>
  );
}
