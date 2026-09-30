import React, { useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import axios from 'axios';
import {
    FaArrowRight,
    FaFileAlt,
    FaLightbulb,
    FaListUl,
    FaTags,
} from 'react-icons/fa';
import { API_URL, getApiErrorMessage } from '../api';
import './Start.css';
import WorkflowAlert from './WorkflowAlert';

const workflowSteps = [
    { number: '01', icon: FaFileAlt, title: 'Set up', description: 'Add responses and project context.' },
    { number: '02', icon: FaTags, title: 'Code', description: 'Build and refine your theme set.' },
    { number: '03', icon: FaListUl, title: 'Review', description: 'Check the suggested assignments.' },
    { number: '04', icon: FaLightbulb, title: 'Results', description: 'Explore and export your findings.' },
];

const stageNames = {
    upload: 'Set up',
    preview: 'Code',
    review: 'Review',
    results: 'Results',
};

const Start = ({
    hasActiveAnalysis,
    researchQuestion,
    responseCount,
    resumeStage,
    onResume,
    onSessionStart,
    onAdvanceStage,
    setLabels,
    notice,
    onDismissNotice,
}) => {
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState(null);

    const startSession = async () => {
        if (isStarting) return;

        setError(null);
        setIsStarting(true);

        try {
            const response = await axios.post(API_URL + '/session/start');

            if (!response.data?.session_id) {
                throw new Error('The server did not return a session ID.');
            }

            setLabels([]);
            onSessionStart(response.data.session_id);
            onAdvanceStage();
        } catch (error) {
            console.error('Session start error:', error.response || error);
            setError(getApiErrorMessage(error, 'We couldn\'t start your analysis.'));
        } finally {
            setIsStarting(false);
        }
    };

    const newAnalysisCard = (
        <section className={'start-card start-card--new' + (hasActiveAnalysis ? ' start-card--secondary' : '')} aria-labelledby="new-analysis-title">
            <span className="start-card__eyebrow">New analysis</span>
            <div className="start-card__body">
                <h2 id="new-analysis-title">Start with a response file</h2>
                <p>Upload an Excel or CSV file, describe your study, and work through the analysis step by step.</p>
            </div>
            <div className="start-card__footer">
                <Button
                    className="start-primary-button"
                    onClick={startSession}
                    disabled={isStarting}
                    aria-busy={isStarting}
                >
                    {isStarting ? (
                        <><Spinner as="span" animation="border" size="sm" aria-hidden="true" /> Starting…</>
                    ) : (
                        <>{hasActiveAnalysis ? 'Start a new analysis' : 'Create an analysis'} <FaArrowRight aria-hidden="true" /></>
                    )}
                </Button>
                {hasActiveAnalysis && <span className="start-card__hint">This replaces your current workspace.</span>}
            </div>
        </section>
    );

    return (
        <main className="start-page">
            <div className="start-shell">
                {notice && (
                    <Alert variant="warning" role="status" dismissible onClose={onDismissNotice} className="start-alert start-session-notice">
                        {notice}
                    </Alert>
                )}

                <header className="start-heading">
                    <span className="start-heading__eyebrow">Workspace overview</span>
                    <h1>Welcome to EduThemes</h1>
                    <p>Organize responses, review themes, and export findings from one workspace.</p>
                </header>

                <div className="start-dashboard">
                    {hasActiveAnalysis && (
                        <section className="start-card start-card--resume" aria-labelledby="resume-analysis-title">
                            <div className="start-card__topline">
                                <span className="start-card__eyebrow">Current analysis</span>
                                <span className="start-card__status">In progress</span>
                            </div>
                            <div className="start-card__body">
                                <h2 id="resume-analysis-title">{researchQuestion || 'Your analysis workspace'}</h2>
                                <p>
                                    {responseCount > 0
                                        ? responseCount + ' ' + (responseCount === 1 ? 'response' : 'responses') + ' added · Continue at ' + stageNames[resumeStage]
                                        : 'Continue setting up your analysis.'}
                                </p>
                            </div>
                            <div className="start-card__footer">
                                <Button className="start-resume-button" onClick={onResume}>
                                    Continue analysis <FaArrowRight aria-hidden="true" />
                                </Button>
                            </div>
                        </section>
                    )}

                    {newAnalysisCard}

                    {!hasActiveAnalysis && (
                        <aside className="start-card start-card--prep" aria-labelledby="before-you-begin-title">
                            <span className="start-card__eyebrow">Before you begin</span>
                            <h2 id="before-you-begin-title">Have these ready</h2>
                            <ul className="start-prep-list">
                                <li>An Excel or CSV file of open-ended responses</li>
                                <li>A research question</li>
                                <li>A short description of your project</li>
                            </ul>
                            <a className="start-example-link" href="/assets/sample-responses.csv" download="sample-responses.csv">
                                Download sample CSV <FaArrowRight aria-hidden="true" />
                            </a>
                        </aside>
                    )}
                </div>

                <WorkflowAlert
                    message={error}
                    heading="Unable to start analysis"
                    onClose={() => setError(null)}
                    className="start-alert"
                />

                <section className="start-workflow" aria-labelledby="workflow-title">
                    <div className="start-workflow__heading">
                        <div>
                            <span className="start-heading__eyebrow">Your workflow</span>
                            <h2 id="workflow-title">Four steps from file to findings</h2>
                        </div>
                        <p>You can return to earlier steps as you review your work.</p>
                    </div>
                    <ol className="start-workflow__grid">
                        {workflowSteps.map(({ number, icon: Icon, title, description }) => (
                            <li className="start-step" key={number}>
                                <span className="start-step__icon" aria-hidden="true"><Icon /></span>
                                <span className="start-step__number">{number}</span>
                                <h3>{title}</h3>
                                <p>{description}</p>
                            </li>
                        ))}
                    </ol>
                </section>
            </div>
        </main>
    );
};

export default Start;
