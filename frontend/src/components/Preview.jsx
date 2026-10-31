import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import React, { useState, useEffect, useRef } from 'react';
import {
  Container, Button, Card, Row, Col, Form,
  Table, Modal, ListGroup, Alert
} from 'react-bootstrap';
import LabelModal from './LabelModal';
import axios from 'axios';
import { FaArrowRight, FaTags } from 'react-icons/fa';
import { API_URL, getApiErrorMessage } from '../api';
import WorkflowHeader from './WorkflowHeader';
import WorkflowAlert from './WorkflowAlert';

const Preview = ({
  sessionId, ensureSession,
  dataset,
  setDataset,
  labels,
  setLabels,
  claudeData,
  svmData,
  setClaudeData,
  setSvmData,
  onAdvanceStage,
    projectMetadata,
    uploadSummary,
}) => {
    const [query, setQuery] = useState(''); const [uncodedOnly, setUncodedOnly] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0); const selectedEntry = dataset?.[selectedIndex] || null;
    const active = useRef(true);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const [isLoading, setIsLoading] = useState(false);
    const [suggestedThemes, setSuggestedThemes] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [error, setError] = useState(null);
    const [suggestionError, setSuggestionError] = useState(null);

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

    const handleSelectEntry = (_entry, index) => setSelectedIndex(index);
    const handleThemeChange = (event, entry = null, index = null) => {
      const theme = labels.find(label => label.name === event.target.value);
      const target = index ?? selectedIndex;
      if (theme) setDataset(previous => previous.map((item, position) => position === target && !item.themes?.some(t => t.name === theme.name) ? { ...item, themes: [...(item.themes || []), theme] } : item));
      event.target.value = '';
    };
    const removeTheme = (name, index = null, themeIndex = null) => setDataset(previous => previous.map((item, position) => position === (index ?? selectedIndex) ? { ...item, themes: (item.themes || []).filter((theme, i) => themeIndex !== null ? i !== themeIndex : theme.name !== name) } : item));
    const handleGetSuggestedThemes = async () => {
        setLoadingSuggestions(true);
        setSuggestionError(null);

        try {
            if (showSuggestions) {
                setSuggestedThemes([]);
            }

            const activeSession = ensureSession ? await ensureSession() : sessionId;
            const response = await axios.post(`${API_URL}/session/${activeSession}/suggest-themes`, {
                labels: labels,
                apiKey: projectMetadata.apiKey
            });

            if (!active.current) return;
            if (response.data && response.data.suggested_themes) {
                setSuggestedThemes(response.data.suggested_themes);
                if (!showSuggestions) {
                    setShowSuggestions(true);
                }
            } else {
                setSuggestionError("No themes were generated. Try again or add themes manually.");
            }
        } catch (error) {
            console.error("Error getting suggested themes:", error.response?.data || error.message);
            setSuggestionError(getApiErrorMessage(error, "We couldn't generate theme suggestions."));
        } finally {
            setLoadingSuggestions(false);
        }
    };

    const handleAddSuggestedTheme = (theme) => {
        const themeExists = labels.some(label => label.name === theme.name);
        if (!themeExists) {
            const COLORS = ['#176b52', '#ff7856', '#d0a72d', '#7a5c99', '#3f7d9d', '#8a6a2f', '#556b5d', '#9a4f61'];
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

            const activeSession = ensureSession ? await ensureSession() : sessionId;
            const response = await axios.post(`${API_URL}/session/${activeSession}/submit-manual-coding`, {
                labels,
                manual_codings: manualCodings,
                apiKey: projectMetadata.apiKey
            });

            if (!active.current) return;
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
                title="Code responses"
                description="Assign themes to examples, then classify the remaining responses."
            />

            <WorkflowAlert message={error} onClose={() => setError(null)} />

            {uploadSummary && (
                <div className="dataset-summary" role="status" aria-label="Uploaded dataset summary">
                    <strong>{uploadSummary.response_count} responses ready</strong>
                    <span>Response column: {uploadSummary.response_column}</span>
                    {uploadSummary.theme_column && <span>Theme column: {uploadSummary.theme_column}</span>}
                    {uploadSummary.blank_rows_skipped > 0 && <span>{uploadSummary.blank_rows_skipped} blank rows skipped</span>}
                </div>
            )}

            {isLoading && <LoadingSkeleton variant="inline" label="Classifying responses…" />}
            {(
            <fieldset disabled={isLoading} className="study-unframed-fieldset"><Row className="g-4 align-items-stretch">
                <Col lg={4} xl={3} className="preview-sidebar">


                    <Card>
                        <Card.Body>
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <span className="sidebar-card__label mb-0">Created themes · {labels.length}</span>
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
{selectedEntry.cleaned !== selectedEntry.original && (                                        <div className="selected-response__block">
                                            <span>Cleaned</span>
                                            <p>{selectedEntry.cleaned}</p>
                                        </div>)}
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
                                <LabelModal
                                    labels={labels || []}
                                    setLabels={setLabels}
                                    onDeleteLabel={(themeName) => setDataset(dataset.map((entry) => ({
                                        ...entry,
                                        themes: (entry.themes || []).filter((theme) => theme.name !== themeName),
                                    })))}
                                />
                                <Button
                                    variant="outline-primary"
                                    onClick={() => { setShowSuggestions(true); handleGetSuggestedThemes(); }}
                                    disabled={loadingSuggestions}
                                >
                                    <FaTags className="me-2" aria-hidden="true" />
                                    Suggest themes
                                </Button>
                            </div>
                            <div className="workflow-toolbar__group">
                                <span className="workflow-stat">
                                    Coded <strong>{codedCount}/{totalResponses}</strong> · {percentageCoded}%
                                </span>
                                <Button
                                    onClick={handleReview}
                                    aria-busy={isLoading}
                                    disabled={
                                        labels.length === 0 ||
                                        codedCount === 0 ||
                                        !sessionId ||
                                        isLoading
                                    }
                                    title={codedCount === 0 ? 'Assign at least one theme to a response before continuing.' : undefined}
                                >
                                    {isLoading ? (
                                        <>
                                            <Skeleton className="edu-skeleton--button" />
                                            &nbsp;&nbsp;Preparing review…
                                        </>
                                    ) : (
                                        <>
                                            Classify responses
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
                                    <><div className="coding-filters"><input aria-label="Search responses" type="search" placeholder="Search responses" value={query} onChange={e => setQuery(e.target.value)} /><label><input type="checkbox" checked={uncodedOnly} onChange={e => setUncodedOnly(e.target.checked)} /> Uncoded only</label></div><Table hover responsive size="sm" className="preview-table">
                                        <thead>
                                            <tr>
                                                <th
                                                    className="text-center align-middle preview-index-cell"
                                                >
                                                    #
                                                </th>
                                                <th className="align-middle">Response</th>
                                                <th className="align-middle" style={{ width: '24%' }}>Themes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dataset.map((entry, index) => (!entry.original.toLowerCase().includes(query.toLowerCase()) || (uncodedOnly && entry.themes?.length)) ? null : (

                                                <tr
                                                    key={index}
                                                    onClick={() => handleSelectEntry(entry, index)}
                                                    className={index === selectedIndex ? 'is-selected' : ''}
                                                    aria-selected={index === selectedIndex}
                                                    tabIndex="0"
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            handleSelectEntry(entry, index);
                                                        }
                                                    }}
                                                >
                                                    <td
                                                        className="text-center align-middle preview-index-cell"
                                                    >
                                                        {index + 1}
                                                    </td>
                                                    <td
                                                        className="align-middle preview-response-cell"
                                                    >
                                                        {entry.original}
                                                    </td>
                                                    <td className="align-middle preview-theme-cell">
                                                        <div className="d-flex flex-wrap gap-1">
                                                            <Form.Select
                                                                value=""
                                                                aria-label={`Assign a theme to response ${index + 1}`}
                                                                onChange={(e) => handleThemeChange(e, entry, index)}
                                                                onClick={(event) => event.stopPropagation()}
                                                            >
                                                                <option value="">Assign theme…</option>
                                                                {labels.map((label) => (
                                                                    <option key={label.name} value={label.name}>{label.name}</option>
                                                                ))}
                                                            </Form.Select>
                                                            {entry.themes && entry.themes.length > 0 ?
                                                                entry.themes.map((theme, tidx) => (
                                                                    <button
                                                                        type="button"
                                                                        key={`${theme.name}-${tidx}`}
                                                                        className="theme-pill"
                                                                        style={{
                                                                            '--theme-color': theme.color,
                                                                        }}
                                                                        aria-label={`Remove ${theme.name} from response ${index + 1}`}
                                                                        title={`Remove ${theme.name}`}
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            removeTheme(theme.name, index, tidx);
                                                                        }}
                                                                    >
                                                                        {theme.name}
                                                                        <span className="theme-pill__remove" aria-hidden="true">×</span>
                                                                    </button>
                                                                )) :
                                                                <span className="text-muted small">No theme assigned</span>
                                                            }
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table></>
                                ) : (
                                    <p className="workflow-empty mb-0">
                                        No dataset available. Please upload a dataset.
                                    </p>
                                )}
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row></fieldset>
            )}

            <Modal
                show={showSuggestions}
                onHide={() => setShowSuggestions(false)}
                centered
                size="lg"
                scrollable
            >
                <Modal.Header closeButton>
                    <Modal.Title>Theme suggestions</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {suggestionError && (
                        <Alert variant="danger" role="alert" dismissible onClose={() => setSuggestionError(null)}>
                            {suggestionError}
                        </Alert>
                    )}
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
                                    <Skeleton className="edu-skeleton--button" />
                                    &nbsp;&nbsp;Generating…
                                </>
                            ) : (
                                'Generate suggestions'
                            )}
                        </Button>
                    </div>

                    {loadingSuggestions ? (
                        <LoadingSkeleton variant="suggestions" label="Generating theme suggestions…" />
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
                                            <h5>{theme.name}</h5>
                                            <p className="text-muted mb-0">{theme.description}</p>
                                        </div>
                                        <Button
                                            variant={alreadyAdded ? "outline-secondary" : "outline-primary"}
                                            onClick={() => handleAddSuggestedTheme(theme)}
                                            disabled={alreadyAdded}
                                            className="suggestion-item__action"
                                        >
                                            {alreadyAdded ? 'Added' : 'Add theme'}
                                        </Button>
                                    </ListGroup.Item>
                                );
                            })}
                        </ListGroup>
                    ) : (
                        <p className="text-center text-muted">Generate suggestions to create a first pass at your theme set.</p>
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
