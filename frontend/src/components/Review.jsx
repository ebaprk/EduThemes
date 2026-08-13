import React, { useState, useEffect } from 'react';
import { Container, Button, Card, Row, Col, Modal, Badge, Spinner, Alert, ProgressBar, Nav, Tab, Form, ListGroup, OverlayTrigger} from 'react-bootstrap';
import { FaCheck, FaTimes, FaUndo } from 'react-icons/fa';
import axios, { all } from 'axios';
import LabelCreationWindow from './LabelCreationWindow';
import { API_URL, getApiErrorMessage } from '../api';
import WorkflowHeader from './WorkflowHeader';
import WorkflowAlert from './WorkflowAlert';
import { addThemeAssignment, rejectThemeAssignments, removeThemeAssignment } from '../utils/themeAssignments';
//import ReviewModal from './ReviewModal';

const getReadableTextColor = (color = '#000000') => {
    const hex = color.replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return '#ffffff';
    const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    return ((red * 299 + green * 587 + blue * 114) / 1000) > 150 ? '#172b4d' : '#ffffff';
};

const Review = ({ sessionId, labels, setLabels, setResults, dataset, setDataset, claudeData, setClaudeData, onAdvanceStage, projectMetadata }) => {
    const [currentThemeIndex, setCurrentThemeIndex] = useState(0);
    const [responseActions, setResponseActions] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showReassignModal, setShowReassignModal] = useState(false);
    const [rejectedEntries, setRejectedEntries] = useState([]);
    const [showEditLabels, setShowEditLabels] = useState(false);
    const [unclassifiedSelections, setUnclassifiedSelections] = useState({});
    const [suggestedThemes, setSuggestedThemes] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [suggestionError, setSuggestionError] = useState(null);
    const [tempUncCat, setTempUncCat] = useState({});
    const [aiLoading, setAiLoading] = useState(false);
    const [allThemes, setAllThemes] = useState([...labels])
    

    const unclassifiedTheme = {
        name: "Unclassified",
        description: "Responses that don't fit any other theme",
        color: "#cccccc"
    };
    
    const hasUnclassifiedTheme = labels.some(label => label.name === "Unclassified");
    //let allThemes = hasUnclassifiedTheme ? labels : [...labels];
    const currentTheme = allThemes[currentThemeIndex] || { name: "None", color: "#cccccc" };
    let themeResponses = claudeData?.[currentTheme.name] || [];
    
    useEffect(() => {
        
        
        //console.log(dataset)
        
        if (!hasUnclassifiedTheme && claudeData && !claudeData["Unclassified"]) {
            setClaudeData((previous) => ({ ...previous, Unclassified: [] }));
        }
    }, [claudeData, hasUnclassifiedTheme, setClaudeData]);
    
    useEffect(() => {
        if (currentTheme && !responseActions[currentTheme.name]) {
            setResponseActions(prev => ({
                ...prev,
                [currentTheme.name]: Array(themeResponses.length).fill(null)
            }));
        }
    }, [currentTheme, themeResponses, responseActions]);

    const handleAction = (index, action) => {
        const updatedActions = [...(responseActions[currentTheme.name] || [])];
        updatedActions[index] = action;
        
        setResponseActions(prev => ({
            ...prev,
            [currentTheme.name]: updatedActions
        }));
    };

    



    const handleUndo = (index) => {
        const updatedActions = [...(responseActions[currentTheme.name] || [])];
        updatedActions[index] = null;
        
        setResponseActions(prev => ({
            ...prev,
            [currentTheme.name]: updatedActions
        }));
    };

    const handleAcceptAll = () => {
        setResponseActions(prev => ({
            ...prev,
            [currentTheme.name]: Array(themeResponses.length).fill('approve')
        }));
    };

    const handleRejectAll = () => {
        setResponseActions(prev => ({
            ...prev,
            [currentTheme.name]: Array(themeResponses.length).fill('deny')
        }));
    };


    const handleNextTheme = () => {
        const rejectedIndices = (responseActions[currentTheme.name] || [])
            .map((action, idx) => (action === 'deny' ? themeResponses[idx] : null))
            .filter(index => index !== null);

        if (rejectedIndices.length > 0) {
            setRejectedEntries(rejectedIndices);
            setShowReassignModal(true);
        } else if (currentThemeIndex < allThemes.length - 1) {

            setCurrentThemeIndex(currentThemeIndex + 1);
            //testing
            //if (allThemes[currentThemeIndex] == "Unclassified"){

            //}
            //testing
        } else {
            handleSubmitFinalDataset();
        }
    };

    const handleGetSuggestedThemes = async () => {
        setLoadingSuggestions(true);
        setSuggestionError(null);
        
        try {
            if (showSuggestions) {
                setSuggestedThemes([]);
            }
            const responses = themeResponses.map(idx => dataset[idx]?.original || "Response not found").join('\n');
            const response = await axios.post(`${API_URL}/session/${sessionId}/suggest-themes`, {
                response: responses,
                specBool: 'true',
                apiKey: projectMetadata.apiKey
            });

            if (response.data && response.data.suggested_themes) {
                setSuggestedThemes(response.data.suggested_themes);
                if (!showSuggestions) {
                    setShowSuggestions(true);
                }
            } else {
                setSuggestionError("No themes were generated. Try again or add one manually.");
            }
        } catch (error) {
            console.error("Error getting suggested themes:", error.response?.data || error.message);
            setSuggestionError(getApiErrorMessage(error, "We couldn't generate theme suggestions."));
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleFinishReassignment = () => {
        const { classifications: updatedClassifications, dataset: reassignedDataset } = rejectThemeAssignments({
            classifications: claudeData,
            dataset,
            rejectedIndices: rejectedEntries,
            themeName: currentTheme.name,
            unclassifiedTheme,
        });
        setClaudeData(updatedClassifications);
        setDataset(reassignedDataset);

        setShowReassignModal(false);

        if (currentThemeIndex >= allThemes.length - 1) {
            handleSubmitFinalDataset(updatedClassifications, reassignedDataset);
        } else {
            setCurrentThemeIndex(currentThemeIndex + 1);
        }
    };

    const addThemeToCode = (theme, responseIndex) => {
        const selectedThemeObj = allThemes.find((candidate) => candidate.name === theme);
        if (!selectedThemeObj || theme === 'Unclassified' || !dataset[responseIndex]) return;
        const updated = addThemeAssignment({
            classifications: claudeData,
            dataset,
            theme: selectedThemeObj,
            responseIndex,
        });
        setClaudeData(updated.classifications);
        setDataset(updated.dataset);
    }

    const removeThemeFromCode = (theme, responseIndex) => {
        if (!theme || theme === 'Unclassified') return;
        const updated = removeThemeAssignment({
            classifications: claudeData,
            dataset,
            themeName: theme,
            responseIndex,
        });
        setClaudeData(updated.classifications);
        setDataset(updated.dataset);
    }

    const queryAI = async () => {
        let sent = themeResponses.map((responseIndex, idx) => {
            return dataset[responseIndex]?.original;
        })
        setAiLoading(true);
        setError(null);

        try {
            const response = await axios.post(`${API_URL}/session/${sessionId}/submit-manual-coding`, {
                labels: allThemes,
                response: sent,
                specBool: 'true',
                apiKey: projectMetadata.apiKey
            });

            const dataReturned = response.data.claude_data;

            let updated = { classifications: claudeData, dataset };
            Object.keys(dataReturned).forEach(key => {
                for (var x=0; x<dataReturned[key].length; x++){
                    const selectedTheme = allThemes.find((theme) => theme.name === key);
                    if (selectedTheme) {
                        updated = addThemeAssignment({
                            ...updated,
                            theme: selectedTheme,
                            responseIndex: themeResponses[dataReturned[key][x]],
                        });
                    }
                }
            });
            setClaudeData(updated.classifications);
            setDataset(updated.dataset);
        } catch (error) {
            console.error("Error querying AI:", error.response?.data || error.message);
            setError(getApiErrorMessage(error, "We couldn't classify these responses."));
        } finally {
            setAiLoading(false);
        }
    }
    
    const addTheme = (theme) => {
        if (!theme?.name || allThemes.some((item) => item.name.toLowerCase() === theme.name.toLowerCase())) return;
        if (allThemes.filter((item) => item.name !== 'Unclassified').length >= 10) {
            setSuggestionError('You can create up to 10 themes.');
            return;
        }

        setAllThemes((previous) => [...previous, theme]);
        setLabels((previous) => [...previous.filter((item) => item.name !== 'Unclassified'), theme]);
        setClaudeData((previous) => ({ ...previous, [theme.name]: previous[theme.name] || [] }));

        // Initialize response actions for new theme
        setResponseActions(prev => ({
            ...prev,
            [theme.name]: []
        }));

        // Update dataset entries to include the new theme structure if needed
        setDataset(prevDataset => 
            prevDataset.map(entry => ({
                ...entry,
                themes: entry.themes || []  // Ensure themes array exists
            }))
        );
    };

    const handleSubmitFinalDataset = async (classificationsOverride = claudeData, datasetOverride = dataset) => {
        setIsLoading(true);
        setError(null);

        try {
            const updatedDataset = datasetOverride.map((entry) => ({
                ...entry,
                themes: [...(entry.themes || [])],
            }));

            Object.keys(responseActions).forEach(themeName => {
                const themeActions = responseActions[themeName];
                const themeResponseIndices = classificationsOverride[themeName] || [];

                themeActions.forEach((action, idx) => {
                    if (action === 'approve' || themeName === "Unclassified") {
                        const responseIndex = themeResponseIndices[idx];
                        if (responseIndex !== undefined && responseIndex < updatedDataset.length) {
                            const theme = allThemes.find(label => label.name === themeName);

                            if (theme) {
                                if (!updatedDataset[responseIndex].themes) {
                                    updatedDataset[responseIndex].themes = [];
                                }

                                const themeExists = updatedDataset[responseIndex].themes.some(
                                    t => t.name === theme.name
                                );

                                if (!themeExists && (themeName !== 'Unclassified' || updatedDataset[responseIndex].themes.length === 0)) {
                                    updatedDataset[responseIndex].themes.push({
                                        name: theme.name,
                                        color: theme.color,
                                        description: theme.description || ""
                                    });
                                }
                            }
                        }
                    }
                });
            });

            setDataset(updatedDataset);

            const response = await axios.post(
                `${API_URL}/session/${sessionId}/submit-final-dataset`,
                { 
                    dataset: updatedDataset,
                    labels: allThemes,
                    apiKey: projectMetadata.apiKey
                }
            );

            if (response.status === 200) {
                setResults({
                    themes: response.data.themes || [],
                    summary: response.data.summary || '',
                });
                onAdvanceStage();
            } else {
                setError('Error submitting final dataset: ' + (response.data.error || 'Unknown error'));
            }
        } catch (error) {
            setError(getApiErrorMessage(error, "We couldn't submit the final dataset."));
        } finally {
            setIsLoading(false);
        }
    };
    
    const currentActions = responseActions[currentTheme.name] || Array(themeResponses.length).fill(null);
    const allActionsCompleted = currentTheme.name === "Unclassified" || currentActions.every(action => action !== null);
    
    const totalThemes = allThemes.length;
    const completedThemes = Object.keys(responseActions).filter(theme => {
        const actions = responseActions[theme];
        return actions && actions.every(action => action !== null);
    }).length;
    
    const progressPercentage =  isLoading ? 100 : ( currentTheme.name === "Unclassified" 
        ? 100
        : totalThemes > 0 
            ? (completedThemes / totalThemes) * 100 
            : 0);
    const formattedThemeName = `${currentTheme.name} (${themeResponses.length} ${themeResponses.length === 1 ? 'response' : 'responses'})`;
    const pendingCount = currentTheme.name === "Unclassified"
        ? 0
        : currentActions.filter(action => action === null).length;

    return (
        <Container fluid className="workflow-page workflow-page--wide review-page">
            <WorkflowHeader
                currentStep={3}
                eyebrow="Step 3 · Quality review"
                title="Review every classification with confidence"
                description="Approve the AI’s theme assignments, correct anything that does not fit, and keep the final dataset grounded in your judgment."
            />

            <WorkflowAlert message={error} onClose={() => setError(null)} />

            <Row className="g-4 align-items-stretch">
                <Col lg={4} xl={3} className="review-sidebar">
                    <Card>
                        <Card.Body>
                            <span className="sidebar-card__label">Review workspace</span>
                            <h5>Theme review</h5>
                            <p className="text-muted mb-0">
                                Approve or reject each response, then continue through the theme list.
                            </p>
                        </Card.Body>
                    </Card>
                    <Card>
                        <Card.Body>
                            <span className="sidebar-card__label">Current theme</span>
                            <div className="current-theme">
                                <div 
                                    className="current-theme__dot"
                                    style={{ 
                                        backgroundColor: currentTheme.color
                                    }}
                                ></div>
                                <h2>{currentTheme.name}</h2>
                            </div>
                            <p className="current-theme__description">{currentTheme.description || "No description available"}</p>
                            
                        </Card.Body>
                    </Card>
                    <Card>
                        <Card.Body>
                            <span className="sidebar-card__label">Progress · {currentThemeIndex + 1} of {totalThemes}</span>
                            <div className="review-theme-list">
                                {allThemes.map((label, index) => {
                                    const isComplete = responseActions[label.name] && 
                                        responseActions[label.name].every(action => action !== null);
                                    
                                    return (
                                        <div 
                                            key={index}
                                            className={`review-theme-list__item${index === currentThemeIndex ? ' is-current' : ''}`}
                                        >
                                            <div 
                                                className={`review-theme-list__status${isComplete ? ' is-complete' : ''}`}
                                            ></div>
                                            <span>
                                                {label.name}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card.Body>
                    </Card>
                </Col>

                <Col lg={8} xl={9} className="review-main">
                    <Card className="workflow-panel">
                        <Card.Header>
                            <div className="workflow-toolbar">
                                <h5 className="mb-0">
                                    {formattedThemeName}
                                </h5>
                                <div className="workflow-toolbar__group">
                                {currentTheme.name === "Unclassified" && (<Button 
                                variant="primary" 
                                onClick={() => queryAI()}
                                disabled={aiLoading || themeResponses.length === 0}
                                aria-busy={aiLoading}
                                >
                                    
                                    {aiLoading ? (
                                        <>
                                            <Spinner 
                                                as="span" 
                                                animation="border" 
                                                size="sm" 
                                                role="status" 
                                                aria-hidden="true" 
                                            /> 
                                            &nbsp;&nbsp;Reassigning...
                                        </>
                                    ) : (
                                        'Reassign responses'
                                    )}
                                    
                                </Button>)}
                                <Button 
                                    variant="outline-primary"
                                    onClick={() => setShowEditLabels(true)}
                                >
                                    
                                    Edit themes
                                    
                                </Button>
                                <Button 
                                    variant="primary" 
                                    onClick={handleNextTheme} 
                                    disabled={(!allActionsCompleted || isLoading)}
                                >
                                    {isLoading ? (
                                        <>
                                            <Spinner 
                                                as="span" 
                                                animation="border" 
                                                size="sm" 
                                                role="status" 
                                                aria-hidden="true" 
                                            /> 
                                            &nbsp;&nbsp;Processing...
                                        </>
                                    ) : (
                                        currentThemeIndex >= allThemes.length - 1 ? 'Finish analysis' : 'Next theme'
                                    )}
                                </Button>
                                </div>
                            </div>
                        </Card.Header>
                        
                        <div className="review-progress-strip">
                            <div className="review-progress-track">
                                <span>
                                    {currentTheme.name === "Unclassified"
                                        ? (themeResponses.length === 0 ? 'All responses have a theme' : 'Assign any responses that still need a theme')
                                        : `${pendingCount} ${pendingCount === 1 ? 'response' : 'responses'} left to review`}
                                </span>
                                <ProgressBar
                                    now={progressPercentage}
                                    label={`${Math.round(progressPercentage)}%`}
                                    className="mb-0"
                                />
                            </div>
                            <div className="review-bulk-actions">
                                <Button 
                                    variant="success" 
                                    size="sm" 
                                    onClick={handleAcceptAll} 
                                    disabled={currentTheme.name === "Unclassified"}
                                >
                                    Accept all
                                </Button>
                                <Button 
                                    variant="danger" 
                                    size="sm" 
                                    onClick={handleRejectAll} 
                                    disabled={currentTheme.name === "Unclassified"}
                                >
                                    Reject all
                                </Button>
                            </div>
                        </div>
                        <Card.Body>
                            <div className="review-response-list">
                               
                                {themeResponses.length > 0 ? (
                                    themeResponses.map((responseIndex, idx) => {
                                        const responseText = responseIndex < dataset.length ? 
                                            dataset[responseIndex].original : 
                                            "Response not found";
                                            {/*border-bottom*/}
                                        return (
                                            <div 
                                                key={`${currentTheme.name}-${idx}`} 
                                                className={`review-response-card${currentActions[idx] === 'approve' ? ' is-approved' : ''}${currentActions[idx] === 'deny' ? ' is-rejected' : ''}`}
                                            >
                                                <span>
                                                    {responseText}
                                                </span>
                                                <div 
                                                    className="review-response-actions"
                                                >
                                                    {currentActions[idx] === null && currentTheme.name !== "Unclassified" && (
                                                        <>
                                                            <Button 
                                                                variant="success" 
                                                                className="d-flex align-items-center" 
                                                                size="sm"
                                                                onClick={() => handleAction(idx, 'approve')}
                                                                aria-label={`Accept response ${idx + 1}`}
                                                                title="Accept response"
                                                            >
                                                                <FaCheck/>
                                                            </Button>
                                                            <Button 
                                                                variant="danger" 
                                                                className="d-flex align-items-center" 
                                                                size="sm"
                                                                onClick={() => handleAction(idx, 'deny')}
                                                                aria-label={`Reject response ${idx + 1}`}
                                                                title="Reject response"
                                                            >
                                                                <FaTimes/>
                                                            </Button>
                                                        </>
                                                    )}
                                                    {currentActions[idx] !== null && currentTheme.name !== "Unclassified" && (
                                                        <>
                                                            <span className={`review-response-status ${currentActions[idx] === 'approve' ? 'is-approved' : 'is-rejected'}`}>
                                                                {currentActions[idx] === 'approve' ? 'Accepted' : 'Rejected'}
                                                            </span>
                                                            <Button
                                                                variant="secondary"
                                                                className="d-flex align-items-center"
                                                                size="sm"
                                                                onClick={() => handleUndo(idx)}
                                                                aria-label={`Undo decision for response ${idx + 1}`}
                                                                title="Undo decision"
                                                            >
                                                                <FaUndo/>
                                                            </Button>
                                                        </>
                                                    )}
                                                    {currentTheme.name === "Unclassified" && (
                                                        <Form.Group
                                                            controlId={`formThemes-${idx}`}
                                                            className="review-theme-picker"
                                                        >
                                                            <Form.Select
                                                                value=""
                                                                className="mt-2"
                                                                aria-label={`Assign theme to unclassified response ${idx + 1}`}
                                                                onChange={(event) => addThemeToCode(event.target.value, responseIndex)}
                                                            >
                                                                <option value="">Assign a theme…</option>
                                                                {allThemes.filter(theme => theme.name !== "Unclassified").map((theme) => (
                                                                    <option key={theme.name} value={theme.name}>{theme.name}</option>
                                                                ))}
                                                            </Form.Select>
                                                            {(dataset[responseIndex].themes || []).filter((theme) => theme.name !== 'Unclassified').map((theme, i) => {
                                                                const themeColor = theme.color || '#000000';

                                                                    return (
                                                                        <div key={i} >
                                                                            <Badge 
                                                                                bg="light" 
                                                                                text="dark" 
                                                                                style={{ 
                                                                                    
                                                                                    marginRight: '5px',
                                                                                    marginTop: '0px',
                                                                                    
                                                                                }}
                                                                                onClick={() => removeThemeFromCode(theme.name, responseIndex)}
                                                                            >
                                                                                <p style={{
                                                                                    backgroundColor: themeColor,
                                                                                    padding: '4px',
                                                                                    margin: '0px',
                                                                                    
                                                                                    color: getReadableTextColor(themeColor),
                                                                                    borderRadius: '5px'
                                                                                }}
                                                                                role="button"
                                                                                tabIndex="0"
                                                                                aria-label={`Remove ${theme.name} from this response`}
                                                                                onKeyDown={(event) => {
                                                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                                                        event.preventDefault();
                                                                                        removeThemeFromCode(theme.name, responseIndex);
                                                                                    }
                                                                                }}
                                                                            >{theme.name}</p>
                                                                            </Badge>
                                                                        </div>
                                                                    );

                                                                })
                                                            }
                                                        </Form.Group>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className="workflow-empty mb-0">
                                        No responses were classified with this theme.
                                    </p>
                                )}
                            </div>
                            
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Modal 
                show={showReassignModal} 
                onHide={() => setShowReassignModal(false)}
                centered
            >
                <Modal.Header closeButton>
                    <Modal.Title>Rejected Classifications</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        You've rejected {rejectedEntries.length} {rejectedEntries.length === 1 ? 'classification' : 'classifications'} for the theme "{currentTheme.name}".
                        Rejected items will move to the "Unclassified" category if they have no other assignments.
                    </p>
                    <p>
                        Continue to {currentThemeIndex >= allThemes.length - 1 ? 'finish the review' : 'the next theme'}?
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowReassignModal(false)}>
                        Go Back
                    </Button>
                    <Button variant="primary" onClick={handleFinishReassignment}>
                        {currentThemeIndex >= allThemes.length - 1 ? 'Finish Review' : 'Next Theme'}
                    </Button>
                </Modal.Footer>
            </Modal>
            {/*EDIT LABELS*/}
            <Modal 
                show={showEditLabels} 
                onHide={() => setShowEditLabels(false)}
                centered
                size="lg"
                scrollable
            >
                <Modal.Header closeButton>
                <Modal.Title>Add Themes</Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    {suggestionError && (
                        <Alert variant="danger" role="alert" dismissible onClose={() => setSuggestionError(null)}>
                            {suggestionError}
                        </Alert>
                    )}
                    <Row>
                    <Tab.Container id="left-tabs-example" defaultActiveKey="first">
                    
                        <Col sm={3}>
                        <Nav variant="pills" className="review-theme-tabs flex-column">
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
                                    //console.log(label);
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
                                                    color: getReadableTextColor(label.color),
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
                                <LabelCreationWindow
                                    labels={allThemes.filter((theme) => theme.name !== 'Unclassified')}
                                    setLabels={addTheme}
                                    addOnly
                                />
                            </Tab.Pane>
                            <Tab.Pane eventKey="third">
                                
                                <div className="suggestions-toolbar">
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
                                            <Spinner 
                                                as="span" 
                                                animation="border" 
                                                size="sm" 
                                                role="status" 
                                                aria-hidden="true" 
                                            /> 
                                            &nbsp;&nbsp;Refreshing...
                                        </>
                                    ) : (
                                        'Refresh Suggestions'
                                    )}
                                </Button>
                            </div>
                            
                            {loadingSuggestions ? (
                                <div className="text-center py-4">
                                    <Spinner animation="border" role="status">
                                        <span className="visually-hidden">Loading...</span>
                                    </Spinner>
                                    <p className="mt-2">Analyzing your responses to generate theme suggestions...</p>
                                </div>
                            ) : suggestedThemes.length > 0 ? (
                                <ListGroup>
                                    {suggestedThemes.map((theme, index) => {
                                        const alreadyAdded = allThemes.some(l => l.name === theme.name);
                                        return (
                                            <ListGroup.Item 
                                                key={index}
                                                className={`suggestion-item ${alreadyAdded ? 'bg-light' : ''}`}
                                            >
                                                <div>
                                                    <h5>{theme.name} {alreadyAdded}</h5>
                                                    <p className="text-muted mb-0">{theme.description}</p>
                                                </div>
                                                <Button 
                                                    variant={alreadyAdded ? "outline-secondary" : "outline-primary"}
                                                    onClick={() => {addTheme(theme);}}
                                                    disabled={alreadyAdded}
                                                    className="suggestion-item__action"
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
        </Container>
    );
};

export default Review;
