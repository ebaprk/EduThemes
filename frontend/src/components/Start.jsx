import React, { useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import axios from 'axios';
import {
    FaArrowRight,
    FaCheck,
    FaFileAlt,
    FaLightbulb,
    FaListUl,
    FaMagic,
} from 'react-icons/fa';
import { API_URL, getApiErrorMessage } from '../api';
import './Start.css';

const workflowSteps = [
    {
        number: '01',
        icon: FaFileAlt,
        title: 'Add your responses',
        description: 'Upload an Excel or CSV file and tell us what you want to learn.',
    },
    {
        number: '02',
        icon: FaMagic,
        title: 'Find meaningful patterns',
        description: 'AI organizes related responses into clear, editable themes.',
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

const Start = ({ onSessionStart, onAdvanceStage, setLabels }) => {
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
            <section className="start-hero" aria-labelledby="start-title">
                <div className="start-hero__content">
                    <div className="start-eyebrow">
                        <span className="start-eyebrow__icon" aria-hidden="true">
                            <FaMagic />
                        </span>
                        Qualitative analysis, made clear
                    </div>

                    <h1 id="start-title" className="start-title">
                        Turn open-ended responses into
                        <span> themes you can act on.</span>
                    </h1>

                    <p className="start-description">
                        EduThemes helps educators and researchers uncover the ideas behind their
                        survey data—without hours of manual coding.
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
                        <span className="start-file-note">
                            <FaCheck aria-hidden="true" /> Excel and CSV supported
                        </span>
                    </div>

                    {error && (
                        <Alert
                            variant="danger"
                            role="alert"
                            dismissible
                            onClose={() => setError(null)}
                            className="start-alert"
                        >
                            <Alert.Heading as="h2">Unable to start analysis</Alert.Heading>
                            <div>{error}</div>
                        </Alert>
                    )}
                </div>

                <div className="start-preview" aria-label="Example analysis summary">
                    <div className="start-preview__glow" aria-hidden="true" />
                    <div className="start-preview__card">
                        <div className="start-preview__header">
                            <div>
                                <span className="start-preview__label">Analysis preview</span>
                                <h2>Student feedback</h2>
                            </div>
                            <span className="start-preview__badge">124 responses</span>
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
                    <span className="start-section-kicker">How it works</span>
                    <h2 id="workflow-title">From raw responses to clear direction</h2>
                    <p>A guided workflow keeps you in control at every step.</p>
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
