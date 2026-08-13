import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from 'react-bootstrap/Navbar';
import Container from 'react-bootstrap/Container';
import './Header.css';

const Header = ({ hasActiveAnalysis = false }) => {
    const handleHome = (event) => {
        if (hasActiveAnalysis && !window.confirm('Leave this analysis and return home? Your work will remain available in this browser session.')) {
            event.preventDefault();
        }
    };

    return (
        <Navbar className="site-header">
            <Container className="site-header__inner">
                <Navbar.Brand as={Link} className="site-brand" to="/" onClick={handleHome}>
                    <img
                        className="site-brand__mark"
                        src="/favicon-eduthemes-192.png"
                        alt=""
                        width="36"
                        height="36"
                        aria-hidden="true"
                    />
                    <span className="site-brand__name">EduThemes</span>
                </Navbar.Brand>
            </Container>
        </Navbar>
    );
};

export default Header;
