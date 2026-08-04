const configuredApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_URL;

const defaultApiUrl = import.meta.env.DEV
  ? "http://127.0.0.1:1500"
  : `${window.location.protocol}//${window.location.hostname}:1500`;

export const API_URL = (configuredApiUrl || defaultApiUrl).replace(/\/+$/, "");

export const getApiErrorMessage = (error, fallbackMessage) => {
  const serverMessage = error?.response?.data?.error || error?.response?.data?.message;

  if (serverMessage) {
    return `${fallbackMessage} ${serverMessage}`;
  }

  if (error?.request || error?.code === "ERR_NETWORK") {
    return `${fallbackMessage} The analysis service could not be reached. Make sure the backend is running, then try again.`;
  }

  if (error?.message) {
    return `${fallbackMessage} ${error.message}`;
  }

  return `${fallbackMessage} Please try again.`;
};
