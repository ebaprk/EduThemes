import React from 'react';
import { CircleHelp } from 'lucide-react';

const helpCenter = 'https://eduthemes-help-abepark.web.app/';

export function FeatureHelp({ audience = 'researcher', guide, label = 'Help center', className = '' }) {
  const [page, section] = (guide || '').split('#');
  const href = page ? `${helpCenter}${audience}/${page}.html${section ? `#${section}` : ''}` : helpCenter;
  return (
    <a className={`edu-feature-help ${className}`.trim()} href={href} target="_blank" rel="noreferrer"
      aria-label={`${label} (opens in a new tab)`}>
      <CircleHelp aria-hidden="true" size={16} />
      <span>{label}</span>
    </a>
  );
}
