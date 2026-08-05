import React, { useState } from 'react';
import { Button, Form, Alert, Container, Card, Spinner, Row, Col } from 'react-bootstrap';
import { FaArrowRight, FaCheck, FaFileExcel, FaLock, FaUpload } from 'react-icons/fa';
import axios from 'axios';
import { API_URL, getApiErrorMessage } from '../api';
import WorkflowHeader from './WorkflowHeader';

const Upload = ({ sessionId, onAdvanceStage, setDataset, setVisualization, setProjectMetadata }) => {
    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [projectDescription, setProjectDescription] = useState('');
    const [researchQuestion, setResearchQuestion] = useState('');
    const [additionalContext, setAdditionalContext] = useState('');
    const [apiKey, setApiKey] = useState('');

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
            'application/vnd.ms-excel',
            'text/csv'
        ];
        
        if (selectedFile && (
            allowedTypes.includes(selectedFile.type) || 
            selectedFile.name.endsWith('.csv')
        )) {
            setFile(selectedFile);
            setError(null);
        } else {
            setFile(null);
            setError('Please upload a valid Excel or CSV file (.xlsx, .xls, .csv)');
        }
    };

    const uploadDataset = async () => {
        if (!file || !sessionId) {
            setError('Please select a file and start a session first');
            return;
        }

        if (!researchQuestion) {
            setError('Please enter a research question');
            return;
        }

        if (!projectDescription) {
            setError('Please enter a project description');
            return;
        }

        const formData = new FormData();
        formData.append('dataset', file);
        formData.append('projectDescription', projectDescription);
        formData.append('researchQuestion', researchQuestion);
        formData.append('additionalContext', additionalContext);
        formData.append('apiKey', apiKey);

        setIsLoading(true);
        try {
            const response = await axios.post(`${API_URL}/session/${sessionId}/upload-dataset`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            console.log('Dataset uploaded:', response.data);

            setProjectMetadata({
                researchQuestion,
                projectDescription,
                additionalContext,
                apiKey
            });

            setDataset(response.data.preprocessed_dataset);
            console.log(response.data.preprocessed_dataset);
            setVisualization(response.data.visualization_image);
            onAdvanceStage();
        } catch (err) {
            console.error('Failed to upload dataset:', err);
            setError(getApiErrorMessage(err, 'We couldn\'t upload your dataset.'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Container fluid className="workflow-page upload-page">
            <WorkflowHeader
                currentStep={1}
                eyebrow="Step 1 · Set up"
                title="Give your analysis the right context"
                description="Tell EduThemes what you want to learn, then add the response file you want to explore."
            />

            {error && (
                <Alert variant="danger" role="alert" className="workflow-alert" dismissible onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            <Row className="g-4 align-items-start">
                <Col lg={4}>
                    <aside className="upload-page__aside">
                        <span className="upload-page__aside-icon" aria-hidden="true">
                            <FaFileExcel />
                        </span>
                        <h2>Prepare your response file</h2>
                        <p>A little structure up front helps the analysis produce clearer, more useful themes.</p>
                        <ul className="upload-tips">
                            <li><FaCheck aria-hidden="true" /><span>Use an Excel or CSV file with one response per row.</span></li>
                            <li><FaCheck aria-hidden="true" /><span>Place the text responses you want to analyze in the first column.</span></li>
                            <li><FaCheck aria-hidden="true" /><span>Write a focused research question to guide the theme discovery.</span></li>
                        </ul>
                    </aside>
                </Col>

                <Col lg={8}>
                    <Card className="workflow-panel upload-form-card">
                        <Card.Body>
                            <Form onSubmit={(event) => { event.preventDefault(); uploadDataset(); }}>
                                <section className="workflow-form-section">
                                    <div className="workflow-form-section__heading">
                                        <span className="workflow-form-section__number">01</span>
                                        <div>
                                            <h2>Frame the research</h2>
                                            <p>Help the model understand the purpose behind your responses.</p>
                                        </div>
                                    </div>

                                    <Form.Group controlId="formResearchQuestion" className="mb-4">
                                        <Form.Label>Research question <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="What do you want to learn from this data?"
                                            value={researchQuestion}
                                            onChange={(event) => setResearchQuestion(event.target.value)}
                                            required
                                        />
                                        <Form.Text>Example: “How do students perceive AI tools in education?”</Form.Text>
                                    </Form.Group>

                                    <Form.Group controlId="formProjectDescription">
                                        <Form.Label>Project description <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            as="textarea"
                                            rows={4}
                                            placeholder="Describe your project, participants, and goals"
                                            value={projectDescription}
                                            onChange={(event) => setProjectDescription(event.target.value)}
                                            required
                                        />
                                        <Form.Text>Include enough context to make the generated themes specific to your study.</Form.Text>
                                    </Form.Group>
                                </section>

                                <section className="workflow-form-section">
                                    <div className="workflow-form-section__heading">
                                        <span className="workflow-form-section__number">02</span>
                                        <div>
                                            <h2>Add analysis details</h2>
                                            <p>Optional context can improve interpretation of specialized language.</p>
                                        </div>
                                    </div>

                                    <Row className="g-3">
                                        <Col md={7}>
                                            <Form.Group controlId="formAdditionalContext">
                                                <Form.Label>Additional context <span className="text-muted fw-normal">(optional)</span></Form.Label>
                                                <Form.Control
                                                    as="textarea"
                                                    rows={3}
                                                    placeholder="Add details about the participants, setting, or terminology"
                                                    value={additionalContext}
                                                    onChange={(event) => setAdditionalContext(event.target.value)}
                                                />
                                            </Form.Group>
                                        </Col>
                                        <Col md={5}>
                                            <Form.Group controlId="formApiKey">
                                                <Form.Label>Analysis model</Form.Label>
                                                <Form.Select
                                                    aria-label="Analysis model"
                                                    value={apiKey}
                                                    onChange={(event) => setApiKey(event.target.value)}
                                                >
                                                    <option value="">Select a model</option>
                                                    <option value="claude">Claude</option>
                                                    <option value="chatgpt">ChatGPT</option>
                                                </Form.Select>
                                                <Form.Text>Choose the model available for this analysis.</Form.Text>
                                            </Form.Group>
                                        </Col>
                                    </Row>
                                </section>

                                <section className="workflow-form-section">
                                    <div className="workflow-form-section__heading">
                                        <span className="workflow-form-section__number">03</span>
                                        <div>
                                            <h2>Upload the responses</h2>
                                            <p>Supported formats: .xlsx, .xls, and .csv.</p>
                                        </div>
                                    </div>

                                    <Form.Group controlId="formFile" className="upload-dropzone">
                                        <div className="upload-dropzone__label">
                                            <FaUpload aria-hidden="true" />
                                            <span>{file ? file.name : 'Choose a response file'}</span>
                                        </div>
                                        <Form.Control
                                            type="file"
                                            accept=".xlsx,.xls,.csv"
                                            onChange={handleFileChange}
                                            required
                                        />
                                        <Form.Text>The first column should contain the text responses to analyze.</Form.Text>
                                    </Form.Group>
                                </section>

                                <div className="upload-form-footer">
                                    <span className="upload-form-footer__note">
                                        <FaLock aria-hidden="true" /> Your file is used only for this analysis session.
                                    </span>
                                    <Button
                                        variant="primary"
                                        type="submit"
                                        className="upload-submit"
                                        disabled={!file || !sessionId || !projectDescription || !researchQuestion || isLoading}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                                                Preparing your data…
                                            </>
                                        ) : (
                                            <>
                                                Upload and continue
                                                <FaArrowRight aria-hidden="true" />
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </Form>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </Container>
    );
};

export default Upload;
