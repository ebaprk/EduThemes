export const participantUrl = import.meta.env.VITE_PARTICIPANT_URL
  || window.location.origin;

export const studyLink = (code) => new URL(`/join/${encodeURIComponent(code)}`, participantUrl).toString();
