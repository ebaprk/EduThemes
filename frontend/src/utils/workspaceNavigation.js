const sections = { overview:'Overview', design:'Study design', recruit:'Recruitment', collect:'Responses', analysis:'Analysis', 'team-coding':'Team coding', findings:'Findings', 'participant-results':'Participant results', settings:'Team & settings' };
export function studySearchUrl(query) {
  const text = String(query || '').trim();
  return text ? `/?${new URLSearchParams({ q:text })}` : '/';
}
export function workspaceNavigation(pathname, search = '', source) {
  const params = new URLSearchParams(search);
  const match = pathname.match(/^\/studies\/([^/]+)(?:\/questions\/([^/]+)\/(code|review|results))?\/?$/);
  if (match && match[1] !== 'new') {
    if (match[2]) {
      const version = params.get('version') || (source?.studyId === match[1] && source?.questionId === match[2] ? source.versionId : null);
      const query = new URLSearchParams({ section:'analysis' });
      if (version) query.set('version', version);
      return { back:`/studies/${match[1]}?${query}`, backLabel:'Back to study', title:({ code:'Coding', review:'Classification review', results:'Saved findings' })[match[3]] };
    }
    return { back:'/', backLabel:'All studies', title:sections[params.get('section')] || 'Overview' };
  }
  if (pathname === '/studies/new') return { back:'/', backLabel:'All studies', title:'Create study' };
  if (['/upload','/code','/review','/results'].includes(pathname)) return { back:'/analysis', backLabel:'Import workspace', title:({ '/upload':'Set up analysis', '/code':'Coding', '/review':'Classification review', '/results':'Findings' })[pathname] };
  return { title:pathname === '/analysis' ? 'Import workspace' : 'Research workspace' };
}
