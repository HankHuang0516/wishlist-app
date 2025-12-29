export const getUserLocale = (): string => {
    if (typeof navigator !== 'undefined') {
        return navigator.language || 'en-US';
    }
    return 'en-US';
};

export const getCurrencyCode = (): string => {
    const locale = getUserLocale();
    if (locale.startsWith('zh-TW')) return 'TWD'; // NT$
    if (locale.startsWith('zh')) return 'CNY'; // Fallback for other Chinese
    if (locale.startsWith('ja')) return 'JPY';
    if (locale.startsWith('en-GB')) return 'GBP';
    if (locale.startsWith('en-AU')) return 'AUD';
    if (locale.startsWith('en-CA')) return 'CAD';
    if (locale.startsWith('de') || locale.startsWith('fr') || locale.startsWith('it') || locale.startsWith('es')) return 'EUR';
    return 'USD';
};

export const getCurrencySymbol = (currencyCode: string): string => {
    try {
        return (0).toLocaleString(
            undefined,
            { style: 'currency', currency: currencyCode, minimumFractionDigits: 0, maximumFractionDigits: 0 }
        ).replace(/\d/g, '').trim();
    } catch (e) {
        return '$'; // Fallback
    }
}


export const formatPrice = (amount: number): string => {
    const currency = getCurrencyCode();
    try {
        return new Intl.NumberFormat(getUserLocale(), {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    } catch (e) {
        return `$${amount}`;
    }
};

interface Holiday {
    name: string;
    date: Date;
}

export const getNextHoliday = (): Holiday => {
    const locale = getUserLocale();
    const today = new Date();
    const year = today.getFullYear();
    let holidays: Holiday[] = [];

    if (locale.startsWith('zh-TW')) {
        // Taiwan Holidays
        holidays = [
            { name: "元旦 New Year", date: new Date(year, 0, 1) },
            { name: "農曆新年 Lunar New Year", date: new Date(year, 0, 29) }, // Approx 2025
            { name: "和平紀念日 Peace Day", date: new Date(year, 1, 28) },
            { name: "兒童節 Children's Day", date: new Date(year, 3, 4) },
            { name: "清明節 Tomb Sweeping", date: new Date(year, 3, 5) },
            { name: "勞動節 Labor Day", date: new Date(year, 4, 1) },
            { name: "端午節 Dragon Boat", date: new Date(year, 4, 31) }, // Approx 2025
            { name: "中秋節 Moon Festival", date: new Date(year, 9, 6) }, // Approx 2025
            { name: "國慶日 National Day", date: new Date(year, 9, 10) },
        ];
    } else if (locale.startsWith('en-US')) {
        // US Holidays
        holidays = [
            { name: "New Year's Day", date: new Date(year, 0, 1) },
            { name: "Valentine's Day", date: new Date(year, 1, 14) },
            { name: "Independence Day", date: new Date(year, 6, 4) },
            { name: "Halloween", date: new Date(year, 9, 31) },
            { name: "Thanksgiving", date: new Date(year, 10, 27) }, // Approx
            { name: "Christmas", date: new Date(year, 11, 25) },
        ];
    } else {
        // Generic / International
        holidays = [
            { name: "New Year's Day", date: new Date(year, 0, 1) },
            { name: "Christmas", date: new Date(year, 11, 25) },
        ];
    }

    // Find next
    let next = holidays.find(h => h.date >= today);

    // Check next year's first holiday if none found this year
    if (!next) {
        if (locale.startsWith('zh-TW')) {
            next = { name: "元旦 New Year", date: new Date(year + 1, 0, 1) };
        } else {
            next = { name: "New Year's Day", date: new Date(year + 1, 0, 1) };
        }
    }

    return next || { name: "Holiday", date: new Date() };
};

const translations: Record<string, Record<string, string>> = {
    'zh-TW': {
        'nav.home': '首頁',
        'nav.dashboard': '禮物',
        'nav.social': '朋友',
        'nav.settings': '設定',
        'nav.logout': '登出',
        'nav.login': '登入'
    },
    'en-US': {
        'nav.home': 'Home',
        'nav.dashboard': 'Dashboard',
        'nav.social': 'Social',
        'nav.settings': 'Settings',
        'nav.logout': 'Logout',
        'nav.login': 'Login'
    }
};

export const t = (key: string): string => {
    const locale = getUserLocale();
    const lang = locale.startsWith('zh') ? 'zh-TW' : 'en-US';
    return translations[lang]?.[key] || translations['en-US'][key] || key;
};
