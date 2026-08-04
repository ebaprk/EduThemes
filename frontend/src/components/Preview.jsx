import React, { useState, useEffect } from 'react';
import { 
  Container, Spinner, Button, Card, Row, Col, Form, 
  Table, Badge, Modal, ListGroup, Alert, OverlayTrigger, Tooltip 
} from 'react-bootstrap';
import LabelModal from './LabelModal';
import axios from 'axios';
import { API_URL, getApiErrorMessage } from '../api';

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
        <Container fluid className="d-flex justify-content-center align-items-start p-0" style={{ padding: '0', height: '90vh' }}>
            <Row className="h-100 m-0 w-100 gap-3">
                <Col xs={3} className="p-2 bg-light h-100">
                    <Card className="mb-2" style={{ height: "20%" }}>
                        <Card.Body className="rounded d-flex flex-column">
                            <h5>Manual Coding</h5><hr style={{ margin: '0px' }}/>
                            <p className="text-muted">
                                This page allows you to create themes and manually code a sample to train the AI assistant.
                            </p>
                            {error && <Alert variant="danger">{error}</Alert>}
                        </Card.Body>
                    </Card>

                    <Card className="mb-2">
                        <Card.Body className="rounded d-flex flex-column">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <strong>Created Themes - ({labels.length})</strong>
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
                            <hr style={{ margin: '0px' }} />
                            <div className="overflow-y-auto" style={{ height: '150px', overflowY: 'auto' }}>
                            {labels.length > 0 ? (
                                <div >
                                    {labels.map((label, index) => (
                                        <div key={index} className="d-flex align-items-center mb-2">
                                            <div 
                                                style={{ 
                                                    width: '15px', 
                                                    height: '15px', 
                                                    borderRadius: '50%', 
                                                    backgroundColor: label.color,
                                                    marginRight: '10px'
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
                                </div>
                            ) : (
                                <p className="text-muted">No themes defined yet. Create themes using the "Edit Themes" button or get AI suggestions with the "Suggest Themes" button.</p>
                            )}
                            </div>
                        </Card.Body>
                    </Card>

                    <Card className="flex-grow-1" style={{ height: '47%' }}>
                        <Card.Body className="rounded d-flex flex-column" id="array_chart" style={{ maxHeight: '100%' }}>
                            {selectedEntry ? (
                                <>
                                    <strong>Selected Response</strong>
                                    <hr style={{ margin: '0px' }}/>
                                    <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                                        { console.log('--',selectedEntry.original)}
                                    <p><strong>Original:</strong> {selectedEntry.original}</p>
                                    <p><strong>Cleaned:</strong> {selectedEntry.cleaned}</p>
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

                <Col xs={8} className="p-2 h-100 d-flex bg-light flex-column">
                    <Card className="flex-grow-1">
                        <Card.Header className="d-flex justify-content-between align-items-center">
                            <div className="d-flex align-items-center">
                                <LabelModal labels={labels || []} setLabels={setLabels} />
                                <Button 
                                    variant="outline-primary" 
                                    size="m" 
                                    onClick={() => setShowSuggestions(true)}
                                    disabled={loadingSuggestions}
                                    className="me-2 ms-4"
                                >
                                    Suggested Themes
                                </Button>
                            </div>
                            <div className="d-flex align-items-center">
                                
                                <OverlayTrigger
                                    placement="top"
                                    overlay={<Tooltip>Number of responses with assigned themes</Tooltip>}
                                >
                                    <Button variant="outline-dark" disabled style={{ marginRight: '10px' }}>
                                        Coded: {codedCount}/{totalResponses} ({percentageCoded}%)
                                    </Button>
                                </OverlayTrigger>
                                <Button 
                                    onClick={handleReview} 
                                    disabled={
                                        labels.length === 0 || 
                                        !sessionId || 
                                        isLoading
                                    }
                                    className='ms-3'
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
                                        'Review'
                                    )}
                                </Button>
                            </div>
                        </Card.Header>
                        <Card.Body style={{ height: '1px' }} id="given_chart">
                            <div 
                                className="bg-light border"
                                style={{ height: '100%', overflowY: 'auto' }}
                            >
                                {dataset && dataset.length > 0 ? (
                                    <Table striped hover bordered size="sm" className="m-0">
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
                                                    style={{ 
                                                        cursor: 'pointer',
                                                        backgroundColor: index === selectedIndex ? '#e8f4f8' : 'inherit'
                                                    }}
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
                                                    <td className="align-middle">
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

                                                                        bg={null}
                                                                        style={{
                                                                            backgroundColor: theme.color,
                                                                            fontSize: '0.7rem'
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
                                    <p className="text-muted text-center m-3">
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
            >
                <Modal.Header closeButton>
                    <Modal.Title>Theme Suggestions</Modal.Title>
                </Modal.Header>
                <Modal.Body>
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
                                        className={`d-flex justify-content-between align-items-center ${alreadyAdded ? 'bg-light' : ''}`}
                                    >
                                        <div>
                                            <h5>{theme.name} {alreadyAdded}</h5>
                                            <p className="text-muted mb-0">{theme.description}</p>
                                        </div>
                                        <Button 
                                            variant={alreadyAdded ? "outline-secondary" : "outline-primary"}
                                            onClick={() => handleAddSuggestedTheme(theme)}
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
