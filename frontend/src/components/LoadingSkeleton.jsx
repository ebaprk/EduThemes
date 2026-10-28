import React from 'react';
import './LoadingSkeleton.css';

export function Skeleton({ className = '', style }) {
  return <span className={`edu-skeleton ${className}`} style={style} aria-hidden="true" />;
}

function Lines({ count = 3 }) {
  return <div className="edu-skeleton-lines">{Array.from({ length: count }, (_, index) =>
    <Skeleton key={index} style={{ width: `${[100, 92, 76, 96][index % 4]}%` }} />
  )}</div>;
}

function Panel({ field = false }) {
  return <div className="edu-skeleton-panel">
    <Skeleton className="edu-skeleton--title" />
    <Lines count={field ? 2 : 3} />
    {field ? <Skeleton className="edu-skeleton--field" /> : <Skeleton className="edu-skeleton--action" />}
  </div>;
}

function ResponseLayout({ rows }) {
  return <div className="edu-skeleton-workspace">
    <div className="edu-skeleton-stack"><Panel /><Panel /></div>
    <div className="edu-skeleton-panel">
      <div className="edu-skeleton-toolbar"><Skeleton className="edu-skeleton--title" /><Skeleton className="edu-skeleton--action" /></div>
      {Array.from({ length: rows }, (_, index) => <div className="edu-skeleton-response" key={index}><Lines count={3} /><Skeleton className="edu-skeleton--pill" /></div>)}
    </div>
  </div>;
}

export default function LoadingSkeleton({ variant = 'text', label = 'Loading…', rows = 3, className = '' }) {
  if (variant === 'inline') return <span className={`edu-loading edu-loading--inline ${className}`} role="status">
    <span>{label}</span><span className="edu-loading__inline-bars" aria-hidden="true"><Skeleton /><Skeleton /><Skeleton /></span>
  </span>;

  let content;
  switch (variant) {
    case 'workspace':
      content = <div className="edu-skeleton-stack"><Skeleton className="edu-skeleton--heading" /><Lines count={2} /><div className="edu-skeleton-grid">{Array.from({ length: rows }, (_, index) => <Panel key={index} />)}</div></div>;
      break;
    case 'cards':
      content = <div className="edu-skeleton-grid">{Array.from({ length: rows }, (_, index) => <Panel key={index} />)}</div>;
      break;
    case 'study':
    case 'form':
      content = <div className="edu-skeleton-stack"><Skeleton className="edu-skeleton--heading" /><Lines count={2} />{Array.from({ length: rows }, (_, index) => <Panel field key={index} />)}</div>;
      break;
    case 'analysis':
      content = <div className="edu-skeleton-stack"><Skeleton className="edu-skeleton--heading" /><Lines count={2} /><Skeleton className="edu-skeleton--steps" /><ResponseLayout rows={rows} /></div>;
      break;
    case 'responses':
      content = <ResponseLayout rows={rows} />;
      break;
    case 'results':
      content = <div className="edu-skeleton-stack"><div className="edu-skeleton-metrics">{Array.from({ length: 5 }, (_, index) => <div className="edu-skeleton-panel" key={index}><Skeleton /><Skeleton className="edu-skeleton--number" /></div>)}</div><div className="edu-skeleton-panel"><Skeleton className="edu-skeleton--title" /><Lines count={8} /></div></div>;
      break;
    case 'suggestions':
      content = <div className="edu-skeleton-stack">{Array.from({ length: rows }, (_, index) => <Panel key={index} />)}</div>;
      break;
    case 'connection':
      content = <Panel />;
      break;
    default:
      content = <Lines count={rows} />;
  }
  return <div className={`edu-loading edu-loading--${variant} ${className}`} role="status">
    <span className="edu-loading__label">{label}</span>
    <div aria-hidden="true">{content}</div>
  </div>;
}
