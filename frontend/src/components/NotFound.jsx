import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './NotFound.css';

const REDIRECT_SECONDS = 5;

const NotFound = () => {
    const navigate = useNavigate();
    const [secondsRemaining, setSecondsRemaining] = useState(REDIRECT_SECONDS);

    useEffect(() => {
        const countdown = window.setInterval(() => {
            setSecondsRemaining((seconds) => Math.max(0, seconds - 1));
        }, 1000);
        const redirect = window.setTimeout(() => navigate('/', { replace: true }), REDIRECT_SECONDS * 1000);

        return () => {
            window.clearInterval(countdown);
            window.clearTimeout(redirect);
        };
    }, [navigate]);

    return (
        <main className="not-found-page">
            <section className="not-found-card" aria-labelledby="not-found-title">
                <img src="/favicon-eduthemes-192.png" alt="" width="72" height="72" aria-hidden="true" />
                <p className="not-found-code">404</p>
                <h1 id="not-found-title">Page not found</h1>
                <p>The address may be incorrect, or the page may have moved.</p>
                <Link className="not-found-home" to="/">Return home</Link>
                <p className="not-found-redirect" aria-live="polite">
                    Returning home automatically in {secondsRemaining} second{secondsRemaining === 1 ? '' : 's'}.
                </p>
            </section>
        </main>
    );
};

export default NotFound;
