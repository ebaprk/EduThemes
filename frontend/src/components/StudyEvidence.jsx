import React, { useId, useLayoutEffect, useRef } from 'react';
import { LuChevronDown } from 'react-icons/lu';
import { Card } from '@eduthemes/ui/components/card';

export default function StudyEvidence({ dataset, labels, themes, sourceBase, selectedTheme }) {
  const headingId = useId();
  const selectedRow = useRef(null);
  useLayoutEffect(() => {
    const row = selectedRow.current;
    if (!selectedTheme || !row) return;
    row.open = true;
    row.querySelector('summary')?.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [selectedTheme]);
  const entriesByTheme = new Map();
  dataset.forEach((entry, index) => {
    const names = new Set((entry.themes || []).map(theme => theme.name));
    for (const name of names) {
      if (!entriesByTheme.has(name)) entriesByTheme.set(name, []);
      entriesByTheme.get(name).push({ entry, number: index + 1 });
    }
  });

  const labelByName = new Map((labels || []).map(label => [label.name, label]));
  const summaryByName = new Map(themes.map(theme => [theme.name, theme]));
  const names = [...new Set([...summaryByName.keys(), ...entriesByTheme.keys()])];
  // Unclassified belongs after the named themes in both current and older runs.
  const orderedNames = names.filter(name => name !== 'Unclassified');
  if (names.includes('Unclassified')) orderedNames.push('Unclassified');

  return <Card as="section" className="theme-evidence-panel" aria-labelledby={headingId}>
    <div className="theme-evidence-header">
      <div>
        <h2 id={headingId}>Evidence behind the themes</h2>
        {orderedNames.length > 0 && <p>
          A response can appear under more than one theme.
        </p>}
      </div>
    </div>
    {orderedNames.map(name => {
      const summary = summaryByName.get(name);
      const entries = entriesByTheme.get(name) || [];
      const count = Number(summary?.frequency ?? entries.length);
      const label = labelByName.get(name);
      const definition = label?.definition || label?.description || summary?.definition || summary?.description;
      return <details key={name} ref={name === selectedTheme ? selectedRow : undefined} className="theme-evidence-item">
        <summary className="theme-evidence-trigger">
          <span className="theme-evidence-dot" style={{ backgroundColor: summary?.color || label?.color }} aria-hidden="true" />
          <span className="theme-evidence-name">{name}</span>
          <span className="theme-evidence-count">{count} {count === 1 ? 'response' : 'responses'}</span>
          <LuChevronDown className="theme-evidence-chevron" aria-hidden="true" />
        </summary>
        <div className="theme-evidence-body">
          {definition && <p className="theme-evidence-definition">{definition}</p>}
          {entries.length ? <>
            {count !== entries.length && <p className="study-help">{entries.length} original {entries.length === 1 ? 'response' : 'responses'} available for this theme.</p>}
            <ol className="theme-evidence-quotes" role="list">
              {entries.map(({ entry, number }) => {
                const decision = entry.review_decisions?.[name];
                return <li key={number}>
                  <p className="theme-evidence-meta">Response {number}{decision && <>
                    {' · '}{decision.action === 'approve' ? 'Classification accepted' : 'Classification rejected'}
                    {decision.recorded_at && <> · {new Date(decision.recorded_at).toLocaleString()}</>}
                  </>}</p>
                  <blockquote>{entry.original}</blockquote>
                  {sourceBase && entry.submission_id && <a href={`${sourceBase}#response-${entry.submission_id}`}>View original response and consent</a>}
                </li>;
              })}
            </ol>
          </> : <p className="study-help">{count > 0 ? 'No original responses are saved for this theme.' : 'No responses were assigned to this theme.'}</p>}
        </div>
      </details>;
    })}
    {!orderedNames.length && <p className="theme-evidence-empty">No themes were saved for this analysis.</p>}
  </Card>;
}
