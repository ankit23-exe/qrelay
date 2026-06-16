import React, { useState, useEffect } from 'react';
import styles from './MouseFollower.module.css';

export default function MouseFollower() {
    const [mousePos, setMousePos] = useState({ x: -100, y: -100 });

    useEffect(() => {
        const handleMouseMove = (e) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div
            className={styles.torch}
            style={{
                left: `${mousePos.x}px`,
                top: `${mousePos.y}px`
            }}
        />
    );
}
