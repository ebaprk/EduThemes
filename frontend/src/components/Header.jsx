import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from 'react-bootstrap/Navbar';
import Container from 'react-bootstrap/Container';
import './Header.css';

const Header = ({ hasActiveAnalysis = false, participant = false }) => {
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
                        src="/eduthemes-mark.svg"
                        alt=""
                        width="34"
                        height="34"
                        aria-hidden="true"
                    />
                    <span className="site-brand__name">EduThemes</span>
                </Navbar.Brand>
                <nav className="site-nav" aria-label="Main navigation">
                    <Link to="/" aria-current={!participant ? 'page' : undefined}>Researcher</Link>
                    <Link to="/join" aria-current={participant ? 'page' : undefined}>Participant</Link>
                </nav>
            </Container>
        </Navbar>
    );
};

export default Header;
