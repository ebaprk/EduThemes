import React from 'react';
import Navbar from 'react-bootstrap/Navbar';
import Container from 'react-bootstrap/Container';
import './Header.css';

const Header = () => {
    const homeUrl = import.meta.env.VITE_FRONT_URL || '/';

    return (
        <Navbar className="site-header">
            <Container className="site-header__inner">
                <Navbar.Brand className="site-brand" href={homeUrl}>
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
