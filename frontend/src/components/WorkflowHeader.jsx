import React, { useContext } from 'react';
import { AnalysisContext } from './AnalysisContext';
import { FaCheck } from 'react-icons/fa';
import { Link, useLocation } from 'react-router-dom';

const steps = ['Set up', 'Code', 'Review', 'Results'];
const stepPaths = ['/upload', '/code', '/review', '/results'];

const WorkflowHeader = ({ currentStep, eyebrow, title, description, readOnly = false }) => {
 const location = useLocation();
 const source = useContext(AnalysisContext);
 const prefix = source ? `/studies/${source.studyId}/questions/${source.questionId}` : null;
 const paths = prefix ? [`/studies/${source.studyId}?section=design&version=${source.versionId}`, ...['code','review','results'].map(step => `${prefix}/${step}?version=${source.versionId}`)] : stepPaths;
 return (
    <header className="workflow-heading">
        <div className="workflow-heading__copy">
            {currentStep > 1 && !readOnly && (
                <Link className="workflow-back-link" to={paths[currentStep - 2]}>
                    ← Back to {steps[currentStep - 2]}
                </Link>
            )}

            <h1>{title}</h1>
            {description && <p>{description}</p>}
        </div>

        <ol className="workflow-stepper" aria-label="Analysis progress">
            {steps.map((step, index) => {
                const stepNumber = index + 1;
                const isComplete = stepNumber < currentStep;
                const isCurrent = stepNumber === currentStep;

                return (
                    <li
                        key={step}
                        className={`workflow-stepper__item${isComplete ? ' is-complete' : ''}${isCurrent ? ' is-current' : ''}`}
                        aria-current={isCurrent ? 'step' : undefined}
                    >
                        {isComplete && !readOnly ? (
                            <Link to={paths[index]} aria-label={`Return to completed step ${stepNumber}: ${step}`}>
                                <span className="workflow-stepper__number" aria-hidden="true"><FaCheck /></span>
                                <span className="workflow-stepper__label">{step}</span>
                            </Link>
                        ) : (
                            <>
                                <span className="workflow-stepper__number" aria-hidden="true">{stepNumber}</span>
                                <span className="workflow-stepper__label">{step}</span>
                            </>
                        )}
                    </li>
                );
            })}
        </ol>
    </header>
);
};

export default WorkflowHeader;
