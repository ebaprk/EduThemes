import axios from 'axios';

const configuredApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_URL;

const defaultApiUrl = import.meta.env.DEV
  ? "http://127.0.0.1:1500"
  : `${window.location.protocol}//${window.location.hostname}:1500`;

export const API_URL = (configuredApiUrl || defaultApiUrl).replace(/\/+$/, "");

axios.defaults.timeout = 5 * 60 * 1000;

export const getApiErrorCode = (error) => error?.response?.data?.code || null;

export const isSessionExpiredError = (error) => (
  getApiErrorCode(error) === 'SESSION_EXPIRED' || error?.response?.status === 410
);

export const getApiErrorMessage = (error, fallbackMessage) => {
  const serverMessage = error?.response?.data?.error || error?.response?.data?.message;

  if (isSessionExpiredError(error)) {
    window.dispatchEvent(new CustomEvent('eduthemes:session-expired'));
    return 'This analysis session expired. Start a new analysis to continue.';
  }

  if (serverMessage) {
    return serverMessage;
  }

  if (error?.code === 'ECONNABORTED') {
    return `${fallbackMessage} The request took too long. Your work is still available; please retry.`;
  }

  if (error?.request || error?.code === "ERR_NETWORK") {
    return `${fallbackMessage} Check your connection and try again.`;
  }

  return `${fallbackMessage} Please try again.`;
};
