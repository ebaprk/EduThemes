export const researcherUrl = import.meta.env.VITE_RESEARCHER_URL
  || import.meta.env.VITE_FRONT_URL
  || window.location.origin;

export const participantUrl = import.meta.env.VITE_PARTICIPANT_URL
  || window.location.origin;

export const studyLink = (code) => new URL(`/join/${encodeURIComponent(code)}`, participantUrl).toString();
