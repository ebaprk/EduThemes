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
    {
        number: '01',
        icon: FaFileAlt,
        title: 'Add your responses',
        description: 'Upload an Excel or CSV file and tell us what you want to learn.',
    },
    {
        number: '02',
        icon: FaTags,
        title: 'Build a theme set',
        description: 'Generate a first pass, then edit the labels and definitions to fit your study.',
    },
    {
        number: '03',
        icon: FaListUl,
        title: 'Review the themes',
        description: 'Refine the labels and make sure every theme reflects your data.',
    },
    {
        number: '04',
        icon: FaLightbulb,
        title: 'Turn findings into action',
        description: 'Explore the results and get practical suggestions for what to do next.',
    },
];

const Start = ({ onSessionStart, onAdvanceStage, setLabels, notice, onDismissNotice }) => {
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState(null);

    const startSession = async () => {
        if (isStarting) return;

        setError(null);
        setIsStarting(true);

        try {
            const response = await axios.post(`${API_URL}/session/start`);

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

    return (
        <main className="start-page">
            {notice && (
                <Alert variant="warning" role="status" dismissible onClose={onDismissNotice} className="start-alert start-session-notice">
                    {notice}
                </Alert>
            )}
            <section className="start-hero" aria-labelledby="start-title">
                <div className="start-hero__content">
                    <div className="start-eyebrow">
                        Guided qualitative analysis
                    </div>

                    <h1 id="start-title" className="start-title">
                        Make sense of open-ended responses.
                    </h1>

                    <p className="start-description">
                        EduThemes helps educators and researchers code survey responses, review
                        themes, and produce a clear analysis while keeping human judgment in the loop.
                    </p>

                    <div className="start-actions">
                        <Button
                            className="start-primary-button"
                            onClick={startSession}
                            disabled={isStarting}
                            aria-busy={isStarting}
                        >
                            {isStarting ? (
                                <>
                                    <Spinner
                                        as="span"
                                        animation="border"
                                        size="sm"
                                        role="status"
                                        aria-hidden="true"
                                    />
                                    Starting analysis…
                                </>
                            ) : (
                                <>
                                    Start an analysis
                                    <FaArrowRight aria-hidden="true" />
                                </>
                            )}
                        </Button>
                    </div>

                    <WorkflowAlert
                        message={error}
                        heading="Unable to start analysis"
                        onClose={() => setError(null)}
                        className="start-alert"
                    />
                </div>

                <div className="start-preview" aria-label="Example analysis summary">
                    <div className="start-preview__card">
                        <div className="start-preview__header">
                            <div>
                                <span className="start-preview__label">Example output</span>
                                <h2>Student feedback</h2>
                            </div>
                            <span className="start-preview__count">124 responses</span>
                        </div>

                        <div className="start-preview__theme">
                            <div className="start-preview__theme-title">
                                <span className="start-preview__dot start-preview__dot--purple" />
                                Personalized learning
                            </div>
                            <strong>42%</strong>
                        </div>
                        <div className="start-preview__bar">
                            <span className="start-preview__bar-fill start-preview__bar-fill--purple" />
                        </div>

                        <div className="start-preview__theme">
                            <div className="start-preview__theme-title">
                                <span className="start-preview__dot start-preview__dot--blue" />
                                Time &amp; efficiency
                            </div>
                            <strong>31%</strong>
                        </div>
                        <div className="start-preview__bar">
                            <span className="start-preview__bar-fill start-preview__bar-fill--blue" />
                        </div>

                        <div className="start-preview__theme">
                            <div className="start-preview__theme-title">
                                <span className="start-preview__dot start-preview__dot--gold" />
                                Access &amp; inclusion
                            </div>
                            <strong>18%</strong>
                        </div>
                        <div className="start-preview__bar">
                            <span className="start-preview__bar-fill start-preview__bar-fill--gold" />
                        </div>

                        <div className="start-preview__insight">
                            <span className="start-preview__insight-icon" aria-hidden="true">
                                <FaLightbulb />
                            </span>
                            <div>
                                <span>Key insight</span>
                                Students value tools that adapt to their pace and learning needs.
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="start-workflow" aria-labelledby="workflow-title">
                <div className="start-workflow__intro">
                    <span className="start-section-kicker">Four-step workflow</span>
                    <h2 id="workflow-title">A clear path from responses to findings</h2>
                    <p>Each stage has one job, so it is always clear what to do next.</p>
                </div>

                <div className="start-workflow__grid">
                    {workflowSteps.map(({ number, icon: Icon, title, description }) => (
                        <article className="start-step" key={number}>
                            <div className="start-step__topline">
                                <span className="start-step__icon" aria-hidden="true">
                                    <Icon />
                                </span>
                                <span className="start-step__number">{number}</span>
                            </div>
                            <h3>{title}</h3>
                            <p>{description}</p>
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
};

export default Start;
