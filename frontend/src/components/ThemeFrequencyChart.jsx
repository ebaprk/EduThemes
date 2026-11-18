import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@eduthemes/ui/components/card';

const numberFormat = new Intl.NumberFormat();
const shareFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });

export default function ThemeFrequencyChart({ themes, responseCount, evidenceHref }) {
  const headingId = useId();
  const rows = themes.map(({ name, frequency, color }) => ({
    name,
    count: Number(frequency ?? NaN),
    color,
    unclassified: name === 'Unclassified',
  })).filter(row => Number.isFinite(row.count) && row.count >= 0)
    .sort((a, b) => Number(a.unclassified) - Number(b.unclassified) || b.count - a.count);

  const highestCount = Math.max(0, ...rows.map(row => row.count));
  const scale = highestCount <= 5 ? highestCount : Math.ceil(highestCount / 5) * 5;
  const total = Number(responseCount);
  const showShare = total > 0 && highestCount <= total;

  return <Card as="section" className="theme-frequency-panel" aria-labelledby={headingId}>
    <header className="theme-frequency-header">
      <h2 id={headingId}>Responses by theme</h2>
      {rows.length > 0 && <p>
        Counts can overlap when responses have multiple themes. Select a theme to see its evidence.
      </p>}
    </header>
    {rows.length > 0 ? <>
      {scale > 0 && <div className="theme-frequency-axis" aria-hidden="true">
        <span>0</span><span>{numberFormat.format(scale)} {scale === 1 ? 'response' : 'responses'}</span>
      </div>}
      <ul className="theme-frequency-list" role="list" aria-label="Theme response counts">
        {rows.map(({ name, count, color, unclassified }) => {
          const share = showShare ? count / total : null;
          return <li key={name} className="theme-frequency-row" data-unclassified={unclassified || undefined}>
            <Link className="theme-frequency-name" to={evidenceHref(name)} replace>{name}</Link>
            <div className="theme-frequency-track" aria-hidden="true">
              <span style={{ width: `${scale ? count / scale * 100 : 0}%`, backgroundColor: unclassified ? undefined : color }} />
            </div>
            <span className="theme-frequency-values">
              <strong>{numberFormat.format(count)}</strong><span className="sr-only"> {count === 1 ? 'response' : 'responses'}</span>
              {share !== null && <span className="theme-frequency-share">{share > 0 && share < 0.001 ? '<0.1%' : shareFormat.format(share)}<span className="sr-only"> of all responses</span></span>}
            </span>
          </li>;
        })}
      </ul>
    </> : <p className="theme-frequency-empty">No theme counts were saved for this analysis.</p>}
  </Card>;
}
