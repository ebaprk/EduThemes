import React, { useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';
import axios from 'axios';
import {
    FaArrowRight,
} from 'react-icons/fa';
import { API_URL, getApiErrorMessage } from '../api';
import './Start.css';
import WorkflowAlert from './WorkflowAlert';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';

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
    const [confirmReplace, setConfirmReplace] = useState(false);

    const startSession = async () => {
        if (isStarting) return;
        setConfirmReplace(false);
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
                {isStarting ? <LoadingSkeleton variant="text" label="Preparing your analysis workspace…" rows={4} /> : <p>Upload an Excel or CSV file, describe your study, and work through the analysis step by step.</p>}
            </div>
            <div className="start-card__footer">
                <Button
                    className="start-primary-button"
                    onClick={() => hasActiveAnalysis ? setConfirmReplace(true) : startSession()}
                    disabled={isStarting}
                    aria-busy={isStarting}
                >
                    {isStarting ? (
                        <><Skeleton className="edu-skeleton--button" /> Starting…</>
                    ) : (
                        <>{hasActiveAnalysis ? 'Start a new analysis' : 'Create an analysis'} <FaArrowRight aria-hidden="true" /></>
                    )}
                </Button>
                {hasActiveAnalysis && <span className="start-card__hint">Finish or export your current analysis before replacing it.</span>}
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

                    <h1>Import responses</h1>

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

                </div>

                <WorkflowAlert
                    message={error}
                    heading="Unable to start analysis"
                    onClose={() => setError(null)}
                    className="start-alert"
                />
                <Modal show={confirmReplace} onHide={() => setConfirmReplace(false)} centered aria-labelledby="replace-analysis-title">
                    <Modal.Header closeButton><Modal.Title id="replace-analysis-title">Replace the current workspace?</Modal.Title></Modal.Header>
                    <Modal.Body><p>Starting a new analysis replaces the workspace for “{researchQuestion || 'Your current analysis'}”. Continue or export that analysis first if you still need it.</p><p>Saved study findings remain in their study.</p></Modal.Body>
                    <Modal.Footer><Button variant="secondary" onClick={() => setConfirmReplace(false)}>Keep current workspace</Button><Button className="start-primary-button" onClick={startSession}>Replace and start new analysis</Button></Modal.Footer>
                </Modal>

            </div>
        </main>
    );
};

export default Start;
