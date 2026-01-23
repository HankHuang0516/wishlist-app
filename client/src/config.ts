export const API_BASE_URL = import.meta.env.PROD
    ? ''
    : (import.meta.env.VITE_API_URL || 'http://localhost:8000');
export const API_URL = `${API_BASE_URL}/api`;

export const getFullApiUrl = () => {
    if (import.meta.env.PROD && typeof window !== 'undefined') {
        return `${window.location.origin}/api`;
    }
    return API_URL.startsWith('http') ? API_URL : `http://localhost:8000${API_URL}`;
};
