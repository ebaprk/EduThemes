import React from 'react';
import { Link } from 'react-router-dom';
import './NotFound.css';

const NotFound = () => {
    return (
        <main className="not-found-page">
            <section className="not-found-card" aria-labelledby="not-found-title">
                <img src="/eduthemes-mark.svg" alt="" width="72" height="72" aria-hidden="true" />
                <p className="not-found-code">404</p>
                <h1 id="not-found-title">Page not found</h1>
                <p>The address may be incorrect, or the page may have moved.</p>
                <Link className="not-found-home" to="/">Return home</Link>
            </section>
        </main>
    );
};

export default NotFound;
