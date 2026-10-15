const configuredApiUrl = import.meta.env.VITE_API_URL || import.meta.env.REACT_APP_API_URL;

export const API_URL = (configuredApiUrl || 'http://localhost:5000/api').replace(/\/+$/, '');
