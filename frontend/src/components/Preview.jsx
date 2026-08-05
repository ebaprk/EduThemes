import React, { useState, useEffect } from 'react';
import { 
  Container, Spinner, Button, Card, Row, Col, Form, 
  Table, Badge, Modal, ListGroup, Alert, OverlayTrigger, Tooltip 
} from 'react-bootstrap';
import LabelModal from './LabelModal';
import axios from 'axios';
import { FaArrowRight, FaMagic } from 'react-icons/fa';
import { API_URL, getApiErrorMessage } from '../api';
import WorkflowHeader from './WorkflowHeader';

const Preview = ({ 
  sessionId, 
  dataset, 
  setDataset, 
  labels, 
  setLabels, 
  claudeData, 
  svmData, 
  setClaudeData, 
  setSvmData, 
  onAdvanceStage, 
  projectMetadata 
}) => {
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [suggestedThemes, setSuggestedThemes] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        console.log("hai")
      if (dataset && dataset.length > 0 && selectedEntry === null) {
        setSelectedEntry(dataset[0]);
        setSelectedIndex(0);
      }
    }, [dataset, selectedEntry]);

    const getRandomItem = (arr) => {
        // Generate a random floating-point number between 0 (inclusive) and 1 (exclusive)
        const randomIndex = Math.random();

        // Multiply by the array's length to get a number between 0 and array.length (exclusive)
        const scaledIndex = randomIndex * arr.length;

        // Use Math.floor to round down to the nearest whole number, giving a valid array index
        const floorIndex = Math.floor(scaledIndex);

        // Return the item at the randomly generated index
        return arr[floorIndex];
    }

    const handleSelectEntry = (entry, index) => {
        if (index === selectedIndex) {
            return;
        }
        saveThemes();
        setSelectedIndex(index);
        setSelectedEntry(entry);//console.log(selectedEntry.original));
    };

    const handleThemeChange = (e, entry = null, index = null) => {
        const newTheme = e.target.value;
        if (newTheme.trim() === '') return;

        const theme = labels.find(label => label.name === newTheme);
        if (!theme) return;

        if (entry && index !== null) {
            // Handle table row theme change
            const updatedDataset = [...dataset];
            const currentEntry = updatedDataset[index];
            
            if (!currentEntry.themes?.some(t => t.name === newTheme)) {
                currentEntry.themes = [...(currentEntry.themes || []), theme];
                setDataset(updatedDataset);
            }
        } else if (selectedEntry) {
            // Handle selected entry theme change
            if (!selectedEntry.themes?.some(t => t.name === newTheme)) {
                setSelectedEntry((prev) => ({
                    ...prev,
                    themes: [...(prev.themes || []), theme],
                }));
                saveThemes();
            }
        }

        e.target.value = '';
    };

    const saveThemes = () => {
        if (selectedEntry) {
            const updatedEntry = { ...selectedEntry, themes: selectedEntry.themes || [] };
            const updatedDataset = [...dataset];
            updatedDataset[selectedIndex] = updatedEntry;
            setDataset(updatedDataset);
        }
    };

    const removeTheme = (themeName, ind = null, themeIndex = null) => {
        if (ind != null) { 
            let updatedDataset = [...dataset];
            // Remove the theme at the specified themeIndex from the themes array
            updatedDataset[ind].themes = updatedDataset[ind].themes?.filter((_, idx) => idx !== themeIndex) || [];
            setDataset(updatedDataset);
            //console.log('REMOVED', updatedDataset);
        }
        else{
            console.log('huh')
            setSelectedEntry((prev) => ({
                ...prev,
                themes: prev.themes?.filter((theme) => theme.name !== themeName) || [],
            }));
            saveThemes();
            //setTimeout(() => saveThemes(), 0);
        }
        
       
    };

    const handleGetSuggestedThemes = async () => {
        setLoadingSuggestions(true);
        setError(null);
        
        try {
            if (showSuggestions) {
                setSuggestedThemes([]);
            }
            
            const response = await axios.post(`${API_URL}/session/${sessionId}/suggest-themes`, {
                labels: labels,
                apiKey: projectMetadata.apiKey
            });

            if (response.data && response.data.suggested_themes) {
                setSuggestedThemes(response.data.suggested_themes);
                if (!showSuggestions) {
                    setShowSuggestions(true);
                }
            } else {
                setError("No themes could be generated. Please check data or try again.");
            }
        } catch (error) {
            console.error("Error getting suggested themes:", error.response?.data || error.message);
            setError(getApiErrorMessage(error, "We couldn't generate theme suggestions."));
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleAddSuggestedTheme = (theme) => {
        const themeExists = labels.some(label => label.name === theme.name);
        if (!themeExists) {
            const COLORS = ['#f44336', '#e81e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];
            const color = getRandomItem(COLORS)//Math.floor(Math.random()*16777215).toString(16);
            
            const newTheme = {
                name: theme.name,
                description: theme.description,
                color: color
            };
            
            setLabels([...labels, newTheme]);
        }
    };

    const handleReview = async () => {
        setError(null);
        setIsLoading(true);
        try {
            const manualCodings = dataset
                .map((entry, index) => ({
                    index,
                    themes: entry.themes || [],
                }))
                .filter((entry) => entry.themes.length > 0);

            console.log(`Submitting ${manualCodings.length} manually coded responses`);

            const response = await axios.post(`${API_URL}/session/${sessionId}/submit-manual-coding`, {
                labels,
                manual_codings: manualCodings,
                apiKey: projectMetadata.apiKey
            });

            console.log(response.data);
            setClaudeData(response.data.claude_data);
            setSvmData(response.data.svm_data);
            onAdvanceStage();
        } catch (error) {
            console.error("Error submitting manual coding:", error.response?.data || error.message);
            setError(getApiErrorMessage(error, "We couldn't submit your manual coding."));
        } finally {
            setIsLoading(false);
        }
    };

    const codedCount = dataset?.filter((entry) => entry.themes?.length > 0).length || 0;
    const totalResponses = dataset?.length || 0;
    const percentageCoded = totalResponses > 0 ? ((codedCount / totalResponses) * 100).toFixed(1) : 0;

    return (
        <Container fluid className="workflow-page workflow-page--wide preview-page">
            <WorkflowHeader
                currentStep={2}
                eyebrow="Step 2 · Manual coding"
                title="Shape the themes in your data"
                description="Create a useful theme set, code a representative sample, and give the AI a strong foundation for classification."
            />

            {error && <Alert variant="danger" className="workflow-alert" dismissible onClose={() => setError(null)}>{error}</Alert>}

            <Row className="g-4 align-items-stretch">
                <Col lg={4} xl={3} className="preview-sidebar">
                    <Card>
                        <Card.Body>
                            <span className="sidebar-card__label">Your workspace</span>
                            <h5>Manual coding</h5>
                            <p className="text-muted mb-0">
                                Select responses from the table, build your theme set, and code examples before review.
                            </p>
                        </Card.Body>
                    </Card>

                    <Card>
                        <Card.Body>
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <span className="sidebar-card__label mb-0">Created themes · {labels.length}</span>
                                <div>
                                    {/* <Button 
                                        variant="outline-secondary" 
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
                                                <span className="visually-hidden">Loading...</span>
                                            </>
                                        ) : (
                                            "↻"
                                        )}
                                    </Button> */}
                                </div>
                            </div>
                            <div className="theme-list mt-3">
                            {labels.length > 0 ? (
                                <>
                                    {labels.map((label, index) => (
                                        <div key={index} className="theme-list__item">
                                            <div 
                                                className="theme-list__dot"
                                                style={{ 
                                                    backgroundColor: label.color
                                                }}
                                            ></div>
                                            <div>
                                                <div>{label.name.length > 24 ? 
                                                        label.name.substring(0, 24) + '...' : 
                                                        label.name}</div>
                                                {/* {label.description && (
                                                    <small className="text-muted">{label.description.length > 50 ? 
                                                        label.description.substring(0, 50) + '...' : 
                                                        label.description}
                                                    </small>
                                                )} */}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <p className="text-muted small mb-0">No themes yet. Use “Edit Themes” or generate suggestions to get started.</p>
                            )}
                            </div>
                        </Card.Body>
                    </Card>

                    <Card>
                        <Card.Body id="array_chart">
                            {selectedEntry ? (
                                <>
                                    <span className="sidebar-card__label">Selected response</span>
                                    <div className="selected-response">
                                        <div className="selected-response__block">
                                            <span>Original</span>
                                            <p>{selectedEntry.original}</p>
                                        </div>
                                        <div className="selected-response__block">
                                            <span>Cleaned</span>
                                            <p>{selectedEntry.cleaned}</p>
                                        </div>
                                    {/*<Form.Group controlId="formThemes">
                                        <strong>Assigned Themes</strong>
                                        {selectedEntry.themes?.length === 0 || selectedEntry.themes === undefined ? (
                                            <p className="text-muted mt-2">No themes assigned yet.</p>
                                        ) : (
                                            <div className="mb-2 mt-2">
                                                {selectedEntry.themes?.map((theme, index) => (
                                                    <OverlayTrigger
                                                        key={index}
                                                        placement="top"
                                                        overlay={
                                                            <Tooltip id={`tooltip-${index}`}>
                                                                {theme.description || "No description available"}
                                                            </Tooltip>
                                                        }
                                                    >
                                                        <Badge
                                                            bg={null}
                                                            style={{
                                                                backgroundColor: theme.color,
                                                                marginRight: '5px',
                                                                marginBottom: '5px',
                                                                cursor: 'pointer',
                                                            }}
                                                            onClick={() => removeTheme(theme.name)}
                                                        >
                                                            {theme.name} ×
                                                        </Badge>
                                                    </OverlayTrigger>
                                                ))}
                                            </div>
                                        )}
                                        <Form.Control
                                            type="text"
                                            placeholder="Select a theme..."
                                            list="theme-options"
                                            onChange={handleThemeChange}
                                            className="mt-2"
                                        />
                                        <datalist id="theme-options">
                                            {labels.map((label, index) => (
                                                <option key={index} value={label.name} />
                                            ))}
                                        </datalist>
                                        <div className="d-flex mt-2">
                                            <small className="text-muted flex-grow-1">
                                                Select from existing themes or add new ones using the "Edit Themes" button.
                                            </small>
                                        </div>
                                    </Form.Group>*/}
                                    </div>
                                </>
                            ) : (
                                <p className="text-muted">
                                    Select a response to view details and assign themes.
                                </p>
                            )}
                        </Card.Body>
                    </Card>
                </Col>

                <Col lg={8} xl={9} className="preview-main">
                    <Card className="workflow-panel">
                        <Card.Header>
                            <div className="workflow-toolbar">
                            <div className="workflow-toolbar__group">
                                <LabelModal labels={labels || []} setLabels={setLabels} />
                                <Button 
                                    variant="outline-primary" 
                                    onClick={() => setShowSuggestions(true)}
                                    disabled={loadingSuggestions}
                                >
                                    <FaMagic className="me-2" aria-hidden="true" />
                                    Suggest themes
                                </Button>
                            </div>
                            <div className="workflow-toolbar__group">
                                <span className="workflow-stat">
                                    Coded <strong>{codedCount}/{totalResponses}</strong> · {percentageCoded}%
                                </span>
                                <Button 
                                    onClick={handleReview} 
                                    disabled={
                                        labels.length === 0 || 
                                        !sessionId || 
                                        isLoading
                                    }
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
                                        <>
                                            Review classifications
                                            <FaArrowRight className="ms-2" aria-hidden="true" />
                                        </>
                                    )}
                                </Button>
                            </div>
                            </div>
                        </Card.Header>
                        <Card.Body id="given_chart">
                            <div className="preview-table-wrap">
                                {dataset && dataset.length > 0 ? (
                                    <Table hover responsive size="sm" className="preview-table">
                                        <thead>
                                            <tr>
                                                <th 
                                                    className="text-center align-middle" 
                                                    style={{ width: '1%' }}
                                                >
                                                    #
                                                </th>
                                                <th className="text-center align-middle">Response</th>
                                                <th className="text-center align-middle" style={{ width: '20%' }}>Themes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dataset.map((entry, index) => (
                                                
                                                <tr 
                                                    key={index} 
                                                    onClick={() => handleSelectEntry(entry, index)}                                                     
                                                    className={index === selectedIndex ? 'is-selected' : ''}
                                                >
                                                    <td 
                                                        className="text-center align-middle" 
                                                        style={{ fontWeight: 'bold', width: '1%' }}
                                                    >
                                                        {index + 1}
                                                    </td>
                                                    <td 
                                                        className="align-middle"
                                                    >
                                                        {entry.original.length > 100 ? 
                                                            `${entry.original.substring(0, 100)}...` : 
                                                            entry.original
                                                        }
                                                    </td>
                                                    <td className="align-middle preview-theme-cell">
                                                        <div className="d-flex flex-wrap gap-1">
                                                            <Form.Control
                                                                type="text"
                                                                placeholder="Select a theme..."
                                                                list="theme-options"
                                                                onChange={(e) => handleThemeChange(e, entry, index)}
                                                                className="mt-2"
                                                            />
                                                            <datalist id="theme-options">
                                                                {labels.map((label, index) => (
                                                                    <option key={index} value={label.name} />
                                                                ))}
                                                            </datalist>
                                                            {entry.themes && entry.themes.length > 0 ? 
                                                                entry.themes.map((theme, tidx) => (
                                                                    
                                                                    <Badge
                                                                        key={tidx}
                                                                        className="theme-pill"
                                                                        bg={null}
                                                                        style={{
                                                                            backgroundColor: theme.color,
                                                                        }}
                                                                        //temp
                                                                        onClick={() => {removeTheme(theme,index,tidx)}} //remove theme
                                                                    >
                                                                        {theme.name}
                                                                        {/*<Badge
                                                                            bg={null}
                                                                            style={{
                                                                                backgroundColor: theme.color,
                                                                                marginRight: '5px',
                                                                                marginBottom: '5px',
                                                                                cursor: 'pointer',
                                                                            }}
                                                                            onClick={() => removeTheme(entry.themes.name)}
                                                                        ></Badge>*/}
                                                                    </Badge>
                                                                )) : 
                                                                <span className="text-muted small">None</span>
                                                            }
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                ) : (
                                    <p className="workflow-empty mb-0">
                                        No dataset available. Please upload a dataset.
                                    </p>
                                )}
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Modal 
                show={showSuggestions} 
                onHide={() => setShowSuggestions(false)}
                centered
                size="lg"
                scrollable
            >
                <Modal.Header closeButton>
                    <Modal.Title>Theme Suggestions</Modal.Title>
                </Modal.Header>
                <Modal.Body>
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
                                const alreadyAdded = labels.some(l => l.name === theme.name);
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
                                            onClick={() => handleAddSuggestedTheme(theme)}
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
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowSuggestions(false)}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default Preview;
