import React, { useEffect, useState } from 'react';

export default function StudySectionNav({ hasResponses, responseCount, teamCount }) {
  const [active, setActive] = useState('study-overview');
  const sections = [
    ['study-overview', 'Overview'],
    ['study-participation', 'Participation'],
    ...(hasResponses ? [['study-responses', 'Responses', responseCount]] : []),
    ['study-team', 'Research team', teamCount],
  ];

  useEffect(() => {
    let frame;
    const update = () => {
      const ids = ['study-overview', 'study-participation', ...(hasResponses ? ['study-responses'] : []), 'study-team'];
      let current = ids[0];
      for (const id of ids) {
        if (document.getElementById(id)?.getBoundingClientRect().top <= 140) current = id;
      }
      setActive(current);
    };
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [hasResponses]);

  return <nav className="study-section-nav" aria-label="Study sections">
    {sections.map(([id, label, count]) => <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined} onClick={() => setActive(id)}>
      {label}{count !== undefined && <span>{count}</span>}
    </a>)}
  </nav>;
}
