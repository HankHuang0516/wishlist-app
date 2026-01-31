declare global {
    interface Window {
        gtag: (
            command: 'event' | 'config' | 'js' | 'set',
            targetId: string,
            params?: Record<string, any>
        ) => void;
        dataLayer: any[];
    }
}

// Ensure gtag exists to prevent runtime errors if GA fails to load
const gtag = typeof window !== 'undefined' && window.gtag
    ? window.gtag
    : (...args: any[]) => {
        // Fallback: push to dataLayer if gtag function isn't ready
        if (typeof window !== 'undefined') {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(args);
        }
    };

export const Analytics = {
    // Standard GA4 Events
    logLogin: (method: 'phone' | 'email') => {
        gtag('event', 'login', {
            method: method
        });
    },

    logSignUp: (method: 'phone' | 'email') => {
        gtag('event', 'sign_up', {
            method: method
        });
    },

    logShare: (contentType: 'wishlist' | 'item', itemId?: string) => {
        gtag('event', 'share', {
            method: 'native_or_copy',
            content_type: contentType,
            item_id: itemId
        });
    },

    logAddToWishlist: (currency: string, value: number, items: { item_id: string, item_name: string }[]) => {
        gtag('event', 'add_to_wishlist', {
            currency: currency,
            value: value,
            items: items
        });
    },

    logViewItemList: (wishlistId: string, wishlistName: string) => {
        gtag('event', 'view_item_list', {
            item_list_id: wishlistId,
            item_list_name: wishlistName
        });
    },

    // Custom Events
    logCustomEvent: (eventName: string, params?: Record<string, any>) => {
        gtag('event', eventName, params);
    }
};
