
export const APP_CONSTANTS = {
    PRODUCTION_URL: 'https://wishlist-app-production.up.railway.app',
    API_PREFIX: '/api',

    // Default Fallbacks (used when env vars are missing)
    DEFAULT_CLIENT_URL: 'https://wishlist-app-production.up.railway.app',
    DEFAULT_API_URL: 'https://wishlist-app-production.up.railway.app/api',

    // Bot Identity
    USER_AGENT: 'Mozilla/5.0 (compatible; WishlistAI-Bot/1.0; +https://wishlist-app-production.up.railway.app/)',

    // Auth
    EMAIL_VERIFICATION_EXPIRY_HOURS: 24,
    PASSWORD_RESET_EXPIRY_HOURS: 1,
    JWT_EXPIRY: '7d',
};

// Computed URL helper
export const getClientUrl = () => process.env.CLIENT_URL || APP_CONSTANTS.DEFAULT_CLIENT_URL;
export const getApiUrl = () => process.env.API_URL || APP_CONSTANTS.DEFAULT_API_URL;
