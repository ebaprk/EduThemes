import React from 'react';
import { Label } from "@eduthemes/ui/components/label";
import { Textarea } from "@eduthemes/ui/components/textarea";
export const reportSections = [['methods', 'Methods and human review', 'Describe the data source and sampling, research context, qualitative approach, coding unit, codebook development, examples given to AI, and review actually performed. Distinguish independent coding from reconciliation.'], ['limitations', 'Limitations', 'Discuss sample limits, missing or contradictory evidence, interpretation uncertainty, and what the study cannot establish. Include verification effort and any untested assumptions.'], ['ai_disclosure', 'AI assistance disclosure', 'Record the model and version if known, when it was used, its tasks, guidance or prompts, and how outputs were checked. Identify unrecorded details rather than inferring them.']];
export function ReportFields({
  value,
  onChange,
  prefix = 'review'
}) {
  const hints = {methods:'Data source, coding process, and human review.',limitations:'Sample limits, uncertainty, and contradictory evidence.',ai_disclosure:'Model, tasks, prompts, and how outputs were checked.'};
  return <div className="study-form-grid report-fields">{reportSections.map(([key, label]) => <div className="study-field" key={key}><Label htmlFor={`${prefix}-${key}`}>{label}</Label><Textarea id={`${prefix}-${key}`} aria-describedby={`${prefix}-${key}-help`} value={value[key]} rows={3} maxLength={10000} onChange={event => onChange(key, event.target.value)} /><p className="study-help" id={`${prefix}-${key}-help`}>{hints[key]}</p></div>)}</div>;
}
export default function ReportPreparation() {
  return <details className="report-preparation"><summary>Scientific reporting guide</summary><p>Describe the work actually performed. A completed report does not establish that its methods or interpretations are valid.</p><dl className="report-field-guidance">{reportSections.map(([key,label,help])=><div key={key}><dt>{label}</dt><dd>{help}</dd></div>)}</dl><ul>
    <li>Connect the purpose and research question to the data collected and the qualitative approach.</li>
    <li>Describe sampling, setting, researcher perspectives, and relevant consent or privacy arrangements.</li>
    <li>Explain how the codebook developed, what one coded unit means, and who made or checked decisions.</li>
    <li>For a coding reliability study, report independent original choices, shared sample sizes, agreement measures, and reconciliation separately. Reflexive thematic analysis does not require kappa.</li>
    <li>Support findings with original passages, consider contradictory cases, and distinguish interpretation from frequency counts.</li>
    <li>Document AI assistance and study limitations. Review the generated summary and every selected quote.</li>
  </ul><p><a href="https://www.equator-network.org/reporting-guidelines/srqr/" target="_blank" rel="noreferrer">SRQR</a> offers broad qualitative reporting guidance. <a href="https://doi.org/10.1093/intqhc/mzm042" target="_blank" rel="noreferrer">COREQ</a> specifically addresses interviews and focus groups. Choose guidance that fits the study; neither is an automatic certification.</p></details>;
}
