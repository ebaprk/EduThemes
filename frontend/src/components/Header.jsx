import React from 'react';
import Navbar from 'react-bootstrap/Navbar';
import Container from 'react-bootstrap/Container';
import { FaLayerGroup } from 'react-icons/fa';
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
                    <span className="site-brand__name">EduThemes</span>
                </Navbar.Brand>
            </Container>
        </Navbar>
    );
};

export default Header;
