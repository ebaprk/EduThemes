import React from 'react';
import { FaCheck } from 'react-icons/fa';

const steps = ['Set up', 'Code', 'Review', 'Results'];

const WorkflowHeader = ({ currentStep, eyebrow, title, description }) => (
    <header className="workflow-heading">
        <div className="workflow-heading__copy">
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
                        <span className="workflow-stepper__number" aria-hidden="true">
                            {isComplete ? <FaCheck /> : stepNumber}
                        </span>
                        <span className="workflow-stepper__label">{step}</span>
                    </li>
                );
            })}
        </ol>
    </header>
);

export default WorkflowHeader;
