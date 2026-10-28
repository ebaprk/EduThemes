import React from 'react';

export default function StudyEvidence({ analysis, responses, questionId }) {
  const dataset = analysis.coded_responses || [];
  const names = [...new Set(dataset.flatMap((entry) => (entry.themes || []).map((theme) => theme.name)))];
  const openSource = (event, id) => {
    const source = document.getElementById(`response-${id}`);
    if (!source) return;
    event.preventDefault();
    const details = source.closest('details');
    if (details) details.open = true;
    source.scrollIntoView({ behavior: 'smooth', block: 'center' });
    source.setAttribute('tabindex', '-1'); source.focus({ preventScroll: true });
  };
  return <div className="study-evidence"><h4>Evidence behind the themes</h4><p>Counts below come from the saved coded responses. One response can appear under more than one theme.</p>
    {names.map((name) => {
      const entries = dataset.filter((entry) => entry.themes?.some((theme) => theme.name === name));
      const label = analysis.labels?.find((item) => item.name === name);
      return <details key={name}><summary>{name} · {entries.length} of {dataset.length} coded responses</summary>{label && <p>{label.definition || label.description}</p>}<ol>{entries.map((entry, index) => {
        const source = responses.find((response) => response.id === entry.submission_id && response.study_version_id === entry.study_version_id);
        const original = source?.answers?.[questionId];
        const decision = entry.review_decisions?.[name];
        return <li key={entry.submission_id || index}><blockquote>{original || entry.original}</blockquote>{original && original !== entry.original && <p className="study-help">Text used for coding: {entry.original}</p>}
          {decision && <p className="study-help">{decision.action === 'approve' ? 'Classification accepted' : 'Classification rejected'}{decision.recorded_at ? ` · ${new Date(decision.recorded_at).toLocaleString()}` : ''}</p>}
          {source ? <a href={`#response-${source.id}`} onClick={(event) => openSource(event, source.id)}>View original response and consent record</a> : <small>Original response text retained; no source link recorded for this imported or legacy entry.</small>}
        </li>;
      })}</ol></details>;
    })}
    {!names.length && <p>No theme assignments are saved in this analysis yet.</p>}
  </div>;
}
