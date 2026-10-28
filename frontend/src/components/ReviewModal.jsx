import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import React, { useState, useEffect } from 'react';
import { Container, Button, Card, Row, Col, Modal, Badge, Alert, ProgressBar, Nav, Tab, Form, ListGroup, OverlayTrigger} from 'react-bootstrap';
import { FaCheck, FaTimes, FaUndo } from 'react-icons/fa';
import axios, { all } from 'axios';
import LabelCreationWindow from './LabelCreationWindow';

const ReviewModal = ({allThemes, addTheme, setLabels, showEditLabels, currentThemeIndex}) => {
    return (
        <div>
            <Modal 
                show={showEditLabels} 
                onHide={() => setShowEditLabels(false)}
                centered
                size="lg"
            >
                <Modal.Header closeButton>
                <Modal.Title>Add Themes</Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    <Row>
                    <Tab.Container id="left-tabs-example" defaultActiveKey="first">
                    
                        <Col sm={3}>
                        <Nav variant="pills" className="flex-column">
                            <Nav.Item>
                            <Nav.Link eventKey="first">Cur. Themes</Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                            <Nav.Link eventKey="second">Add Theme</Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                            <Nav.Link eventKey="third">LLM Process</Nav.Link>
                            </Nav.Item>
                        </Nav>
                        </Col>
                        <Col sm={9}>
                        <Tab.Content>
                            <Tab.Pane eventKey="first">
                                {allThemes.map((label, index) => {
                                    console.log(label);
                                    const isComplete = responseActions[label.name] && 
                                        responseActions[label.name].every(action => action !== null);
                                    
                                    return (
                                        <div 
                                            key={index}
                                            className=" align-items-center mb-2"
                                            style={{ opacity: index === currentThemeIndex ? 1 : 0.7 }}
                                        >
                                            <div 
                                                
                                            ></div>
                                            <span style={{ 
                                                    borderRadius: '10px',
                                                    padding: '5px', 
                                                    color: '#fff',
                                                    backgroundColor: label.color,
                                                    
                                                }}>
                                                {label.name}
                                            </span>
                                            <p style={{
                                                marginTop: '5px',
                                                marginLeft: '15px'
                                            }}>{label.description}</p>
                                        </div>
                                    );
                                })}

                            </Tab.Pane>
                            <Tab.Pane eventKey="second">
                                <LabelCreationWindow labels={allThemes || []} setLabels={setLabels} />
                            </Tab.Pane>
                            <Tab.Pane eventKey="third">
                                
                                <div className="d-flex justify-content-between mb-3">
                                <span>
                                    {suggestedThemes.length > 0 ? 
                                        `Found ${suggestedThemes.length} theme suggestions` : 
                                        "Generate themes"}
                                </span>
                                <Button 
                                    variant="outline-primary" 
                                    size="sm" 
                                    onClick={handleGetSuggestedThemes}
                                    disabled={loadingSuggestions || !sessionId || dataset?.length === 0}
                                >
                                    {loadingSuggestions ? (
                                        <>
                                            <Skeleton className="edu-skeleton--button" />
                                            &nbsp;&nbsp;Refreshing...
                                        </>
                                    ) : (
                                        'Refresh Suggestions'
                                    )}
                                </Button>
                            </div>
                            
                            {loadingSuggestions ? (
                                <LoadingSkeleton variant="suggestions" label="Generating theme suggestions…" />
                            ) : suggestedThemes.length > 0 ? (
                                <ListGroup>
                                    {suggestedThemes.map((theme, index) => {
                                        const alreadyAdded = allThemes.some(l => l.name === theme.name);
                                        return (
                                            <ListGroup.Item 
                                                key={index}
                                                className={`d-flex justify-content-between align-items-center ${alreadyAdded ? 'bg-light' : ''}`}
                                            >
                                                <div>
                                                    <h5>{theme.name} {alreadyAdded}</h5>
                                                    <p className="text-muted mb-0">{theme.description}</p>
                                                </div>
                                                <Button 
                                                    variant={alreadyAdded ? "outline-secondary" : "outline-primary"}
                                                    onClick={() => addTheme(theme)}
                                                    disabled={alreadyAdded}
                                                    style={{ minWidth: '110px' }}
                                                >
                                                    {alreadyAdded ? 'Added' : 'Add Theme'}
                                                </Button>
                                            </ListGroup.Item>
                                        );
                                    })}
                                </ListGroup>
                            ) : (
                                <p className="text-center text-muted">Click "Refresh Suggestions" to generate new themes.</p>
                            )}

                            </Tab.Pane>
                        </Tab.Content>
                        </Col>
                    
                    </Tab.Container>
                
                </Row>
                </Modal.Body>

                <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowEditLabels(false)}>Close</Button>
                {/*<Button variant="primary">Save changes</Button>*/}
                </Modal.Footer>
            </Modal>
        </div>
    );
}

export default ReviewModal;