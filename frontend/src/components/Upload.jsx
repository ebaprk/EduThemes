import React, { useEffect, useRef, useState } from 'react';
import { Button, Form, Spinner } from 'react-bootstrap';
import {
    FaArrowLeft,
    FaArrowRight,
    FaCheck,
    FaFileExcel,
    FaUpload,
} from 'react-icons/fa';
import axios from 'axios';
import { API_URL, getApiErrorMessage } from '../api';
import WorkflowAlert from './WorkflowAlert';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const questions = [
    { eyebrow: 'Your inquiry', title: 'Research question', note: 'What do you want to learn from these responses?' },
    { eyebrow: 'The study', title: 'Project description', note: 'Briefly describe the setting, participants, and goal.' },
    { eyebrow: 'Optional details', title: 'Additional context', note: 'Add terminology or context that could affect the analysis.' },
    { eyebrow: 'Analysis engine', title: 'Analysis model', note: 'Choose the model that will suggest the first set of themes.' },
    { eyebrow: 'Your responses', title: 'Response file', note: 'Upload an Excel or CSV file up to 20 MB.' },
];

const Upload = ({ sessionId, onAdvanceStage, setDataset, setLabels, setVisualization, setClaudeData, setSvmData, setResults, setProjectMetadata, setUploadSummary }) => {
    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [projectDescription, setProjectDescription] = useState('');
    const [researchQuestion, setResearchQuestion] = useState('');
    const [additionalContext, setAdditionalContext] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [availableModels, setAvailableModels] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const questionRef = useRef(null);

    useEffect(() => {
        const controller = new AbortController();
        fetch(`${API_URL}/models`, { signal: controller.signal })
            .then((response) => response.ok ? response.json() : null)
            .then((data) => {
                if (!data?.models) return;
                setAvailableModels(data.models);
                const configured = Object.entries(data.models).filter(([, enabled]) => enabled);
                if (configured.length === 1) setApiKey(configured[0][0]);
            })
            .catch(() => {});
        return () => controller.abort();
    }, []);

    useEffect(() => {
        setError(null);
        const frame = window.requestAnimationFrame(() => questionRef.current?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, [currentQuestion]);

    const handleFileChange = (event) => {
        const selectedFile = event.target.files?.[0];
        const extension = selectedFile?.name.split('.').pop()?.toLowerCase();
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
        ];

        if (!selectedFile) return;
        if (selectedFile.size > MAX_FILE_SIZE) {
            setFile(null);
            setError('Choose a file smaller than 20 MB.');
        } else if (allowedTypes.includes(selectedFile.type) || ['xlsx', 'xls', 'csv'].includes(extension)) {
            setFile(selectedFile);
            setError(null);
        } else {
            setFile(null);
            setError('Choose a valid Excel or CSV file (.xlsx, .xls, or .csv).');
        }
    };

    const validateQuestion = () => {
        const messages = [
            !researchQuestion.trim() && 'Add a research question to continue.',
            !projectDescription.trim() && 'Add a short project description to continue.',
            false,
            !apiKey && 'Choose an analysis model to continue.',
            !file && 'Choose an Excel or CSV file to continue.',
        ];
        const message = messages[currentQuestion];
        if (message) setError(message);
        return !message;
    };

    const uploadDataset = async () => {
        if (!validateQuestion() || !sessionId) return;

        const formData = new FormData();
        formData.append('dataset', file);
        formData.append('projectDescription', projectDescription);
        formData.append('researchQuestion', researchQuestion);
        formData.append('additionalContext', additionalContext);
        formData.append('apiKey', apiKey);

        setError(null);
        setIsLoading(true);
        try {
            const response = await axios.post(`${API_URL}/session/${sessionId}/upload-dataset`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setProjectMetadata({ researchQuestion, projectDescription, additionalContext, apiKey });
            setDataset(response.data.preprocessed_dataset);
            setLabels(response.data.predefined_themes || []);
            setVisualization(response.data.visualization_image);
            setClaudeData(null);
            setSvmData(null);
            setResults(null);
            setUploadSummary(response.data.dataset_summary || null);
            onAdvanceStage();
        } catch (err) {
            console.error('Failed to upload dataset:', err);
            setError(getApiErrorMessage(err, 'We couldn\'t upload your dataset.'));
        } finally {
            setIsLoading(false);
        }
    };

    const goForward = () => {
        if (!validateQuestion()) return;
        setError(null);
        if (currentQuestion === questions.length - 1) uploadDataset();
        else setCurrentQuestion((value) => value + 1);
    };

    const goBack = () => {
        if (currentQuestion === 0) return;
        setCurrentQuestion((value) => value - 1);
    };

    const handleKeyDown = (event) => {
        const isTextarea = event.target.tagName === 'TEXTAREA';
        if (event.key === 'Enter' && (!isTextarea || event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            goForward();
        }
    };

    const question = questions[currentQuestion];
    const progress = ((currentQuestion + 1) / questions.length) * 100;

    return (
        <main className="setup-flow" onKeyDown={handleKeyDown}>
            <div className="setup-progress" aria-label={`Setup question ${currentQuestion + 1} of ${questions.length}`}>
                <div className="setup-progress__track"><span style={{ width: `${progress}%` }} /></div>
                <span>{String(currentQuestion + 1).padStart(2, '0')} / {String(questions.length).padStart(2, '0')}</span>
            </div>

            <form className="setup-stage" onSubmit={(event) => { event.preventDefault(); goForward(); }}>
                <div className="setup-stage__copy" key={currentQuestion}>
                    <span className="setup-stage__eyebrow">{question.eyebrow}</span>
                    <h1 ref={questionRef} tabIndex="-1">{question.title}</h1>
                    <p>{question.note}</p>

                    <div className="setup-control">
                        {currentQuestion === 0 && (
                            <Form.Control
                                className="setup-text-input"
                                type="text"
                                aria-label="Research question"
                                placeholder="e.g. How do students use AI to learn?"
                                value={researchQuestion}
                                onChange={(event) => setResearchQuestion(event.target.value)}
                                autoFocus
                            />
                        )}

                        {currentQuestion === 1 && (
                            <Form.Control
                                className="setup-textarea"
                                as="textarea"
                                rows={4}
                                aria-label="Project description"
                                placeholder="This study explores…"
                                value={projectDescription}
                                onChange={(event) => setProjectDescription(event.target.value)}
                                autoFocus
                            />
                        )}

                        {currentQuestion === 2 && (
                            <Form.Control
                                className="setup-textarea"
                                as="textarea"
                                rows={4}
                                aria-label="Additional context"
                                placeholder="Optional context…"
                                value={additionalContext}
                                onChange={(event) => setAdditionalContext(event.target.value)}
                                autoFocus
                            />
                        )}

                        {currentQuestion === 3 && (
                            <div className="setup-models" role="radiogroup" aria-label="Analysis model">
                                {[
                                    { id: 'navigator', name: 'NaviGator AI', detail: 'University of Florida' },
                                ].map((model, index) => {
                                    const unavailable = availableModels?.[model.id] === false;
                                    const selected = apiKey === model.id;
                                    return (
                                        <button
                                            className={`setup-model${selected ? ' is-selected' : ''}`}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            disabled={unavailable}
                                            onClick={() => setApiKey(model.id)}
                                            autoFocus={index === 0}
                                            key={model.id}
                                        >
                                            <span className="setup-model__key">{String.fromCharCode(65 + index)}</span>
                                            <span><strong>{model.name}</strong><small>{unavailable ? 'Unavailable' : model.detail}</small></span>
                                            {selected && <FaCheck aria-hidden="true" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {currentQuestion === 4 && (
                            <div className={`setup-file${file ? ' has-file' : ''}`}>
                                <FaFileExcel aria-hidden="true" />
                                <div>
                                    <strong>{file ? file.name : 'Choose your response file'}</strong>
                                    <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Ready to analyze` : '.xlsx, .xls, or .csv · 20 MB maximum'}</span>
                                </div>
                                <label className="setup-file__button">
                                    <FaUpload aria-hidden="true" />
                                    {file ? 'Replace' : 'Browse'}
                                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} autoFocus />
                                </label>
                            </div>
                        )}
                    </div>

                    <WorkflowAlert message={error} onClose={() => setError(null)} />

                    <div className="setup-actions">
                        {currentQuestion > 0 && (
                            <Button type="button" className="setup-back" onClick={goBack} disabled={isLoading}>
                                <FaArrowLeft aria-hidden="true" /> Back
                            </Button>
                        )}
                        <Button type="submit" className="setup-next" disabled={isLoading} aria-busy={isLoading}>
                            {isLoading ? <><Spinner as="span" animation="border" size="sm" /> Reading your data…</> : <>{currentQuestion === questions.length - 1 ? 'Analyze responses' : 'Continue'} <FaArrowRight aria-hidden="true" /></>}
                        </Button>
                        {!isLoading && <span className="setup-enter">press <strong>{currentQuestion === 1 || currentQuestion === 2 ? '⌘ + Enter' : 'Enter ↵'}</strong></span>}
                    </div>
                </div>
            </form>

            {currentQuestion === 4 && (
                <footer className="setup-footer">
                    <a href="/assets/sample-responses.csv" download="sample-responses.csv">Download sample CSV</a>
                </footer>
            )}
        </main>
    );
};

export default Upload;
