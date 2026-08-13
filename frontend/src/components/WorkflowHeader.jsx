import React from 'react';
import { FaCheck } from 'react-icons/fa';
import { Link } from 'react-router-dom';

const steps = ['Set up', 'Code', 'Review', 'Results'];
const stepPaths = ['/upload', '/code', '/review', '/results'];

const WorkflowHeader = ({ currentStep, eyebrow, title, description }) => (
    <header className="workflow-heading">
        <div className="workflow-heading__copy">
            {currentStep > 1 && (
                <Link className="workflow-back-link" to={stepPaths[currentStep - 2]}>
                    ← Back to {steps[currentStep - 2]}
                </Link>
            )}
            <span className="workflow-kicker">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
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
                        {isComplete ? (
                            <Link to={stepPaths[index]} aria-label={`Return to completed step ${stepNumber}: ${step}`}>
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

export default WorkflowHeader;
