import React from 'react';
import Navbar from 'react-bootstrap/Navbar';
import Container from 'react-bootstrap/Container';
import { FaLayerGroup, FaMagic } from 'react-icons/fa';
import './Header.css';

const Header = () => {
    const homeUrl = import.meta.env.VITE_FRONT_URL || '/';

    return (
        <Navbar className="site-header">
            <Container className="site-header__inner">
                <Navbar.Brand className="site-brand" href={homeUrl}>
                    <span className="site-brand__mark" aria-hidden="true">
                        <FaLayerGroup />
                    </span>
                    <span className="site-brand__copy">
                        <span className="site-brand__name">EduThemes</span>
                        <span className="site-brand__tagline">See the meaning in every response</span>
                    </span>
                </Navbar.Brand>

                <div className="site-header__badge" aria-label="AI-assisted qualitative analysis">
                    <FaMagic aria-hidden="true" />
                    <span>AI-assisted analysis</span>
                </div>
            </Container>
        </Navbar>
    );
};

export default Header;
