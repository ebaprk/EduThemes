import { FeatureHelp } from '@eduthemes/ui/components/feature-help';
import React, {useContext} from 'react';
import {FaCheck} from 'react-icons/fa';
import {Link} from 'react-router-dom';
import {AnalysisContext, AnalysisSaveContext} from './AnalysisContext';
import {analysisNavigation} from '../utils/analysisWorkflow';
import LoadingSkeleton from './LoadingSkeleton';
import {Notice} from '@eduthemes/ui/workbench';
import {Button} from '@eduthemes/ui/components/button';

const workflowHelp = {
  1: ['import-responses', 'Help with importing responses'],
  2: ['code-responses', 'Help with themes and coding examples'],
  3: ['review-classifications', 'Help with reviewing classifications'],
  4: ['read-findings', 'Help with findings and exports']
};

export default function WorkflowHeader({currentStep,title,description,readOnly=false,question,compact=false,actions,children}) {
  const source=useContext(AnalysisContext);
  const save=useContext(AnalysisSaveContext);
  const saveFailed=Boolean(source && !source.readOnly && save?.state?.startsWith('Could not'));
  const flow=analysisNavigation(source,currentStep);
  const context=source?.prompt || question;
  const savedFindings=readOnly && source;
  return <header className={`workflow-heading${compact ? '' : ' workflow-heading--detailed'}`}>
    <div className="workflow-heading__copy">
      <Link className="workflow-back-link" to={savedFindings?`/studies/${source.studyId}?${new URLSearchParams({section:'findings',version:source.versionId})}`:flow.back}>
        ← {savedFindings?'Back to saved findings':flow.backLabel}
      </Link>
      {source && <div className="workflow-study-context" aria-label="Study context">
        <span className="workflow-study-name">{source.title}</span>
        <div className="workflow-study-meta">
          {source.versionNumber && <span>Version {source.versionNumber}</span>}
          {source.readOnly ? null : save?.state?.startsWith('Saving') ? <LoadingSkeleton variant="inline" className="workflow-save-state" label="Saving…" />
            : save?.state && <span className="workflow-save-state" data-state={saveFailed ? 'error' : 'saved'} role="status" aria-label="Analysis save status" title={save.state}>
              {!saveFailed && <FaCheck aria-hidden="true" />}{saveFailed ? 'Not saved' : 'Saved'}
            </span>}
        </div>
      </div>}
      {actions ? <div className="workflow-title-row"><h1>{title}</h1>{actions}</div> : <h1>{title}</h1>}
      {context&&<p className="workflow-question">{!compact&&<span>{source?'Question being analyzed':'Research question'}</span>}{context}</p>}
      {description&&<p className="workflow-description">{description}</p>}
      {workflowHelp[currentStep] && <FeatureHelp guide={workflowHelp[currentStep][0]} label={workflowHelp[currentStep][1]} />}
      {children}
    </div>
    {!savedFindings && !compact && <ol className="workflow-stepper" data-steps={flow.steps.length} aria-label="Analysis progress">
      {flow.steps.map((step,index)=><li key={step.label} className={`workflow-stepper__item${index<flow.index?' is-complete':''}${index===flow.index?' is-current':''}`} aria-current={index===flow.index?'step':undefined}>
        {index<flow.index&&!readOnly?<Link to={step.path} aria-label={`Return to completed step ${index+1}: ${step.label}`}><span className="workflow-stepper__number" aria-hidden="true"><FaCheck/></span><span className="workflow-stepper__label">{step.label}</span></Link>:<><span className="workflow-stepper__number" aria-hidden="true">{index+1}</span><span className="workflow-stepper__label">{step.label}</span></>}
      </li>)}
    </ol>}
    {saveFailed && <Notice variant="danger" className="workflow-save-error"><p>{save.state}</p><Button type="button" onClick={save.onDownload} variant="outline" size="auto">Download current coding</Button></Notice>}
  </header>;
}
