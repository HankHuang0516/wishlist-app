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
        'nav.login': '登入',
        // Homepage
        'home.title': '整理你的願望。',
        'home.subtitle': 'AI 智慧許願清單，拍照就能記錄。分享給朋友，送禮不再煩惱。',
        'home.getStarted': '開始使用',
        'home.learnMore': '了解更多',
        // Feature Cards
        'home.feature1.title': '拍一下，願望就記住了 📱',
        'home.feature1.desc': 'AI 自動幫你找到商品名稱、價格和購買連結',
        'home.feature2.title': '送禮不踩雷，朋友說讚 🎁',
        'home.feature2.desc': '分享你的願望清單，讓朋友知道你想要什麼',
        'home.feature3.title': '願望不再忘記 ✨',
        'home.feature3.desc': '依照場合分類，生日、節日、犒賞自己都能輕鬆管理',
        'home.feature4.title': '偷看清單，送進心坎 💕',
        'home.feature4.desc': '另一半偷偷查看願望，買到心儀禮物超幸福'
    },
    'en-US': {
        'nav.home': 'Home',
        'nav.dashboard': 'Dashboard',
        'nav.social': 'Social',
        'nav.settings': 'Settings',
        'nav.logout': 'Logout',
        'nav.login': 'Login',
        // Homepage
        'home.title': 'Organize your desires.',
        'home.subtitle': 'A minimalist wishlist powered by AI. Snap a photo, we\'ll do the rest. Share with friends, simplify your gifting.',
        'home.getStarted': 'Get Started',
        'home.learnMore': 'Learn More',
        // Feature Cards
        'home.feature1.title': 'Snap it, save it 📱',
        'home.feature1.desc': 'AI finds product name, price, and shopping links automatically',
        'home.feature2.title': 'Perfect gifts, happy friends 🎁',
        'home.feature2.desc': 'Share your wishlist so friends know what you really want',
        'home.feature3.title': 'Never forget a wish ✨',
        'home.feature3.desc': 'Organize by occasion - birthdays, holidays, treats for yourself',
        'home.feature4.title': 'Peek & surprise 💕',
        'home.feature4.desc': 'Your partner secretly checks your list and gets the perfect gift'
    }
};

export const t = (key: string): string => {
    const locale = getUserLocale();
    const lang = locale.startsWith('zh') ? 'zh-TW' : 'en-US';
    return translations[lang]?.[key] || translations['en-US'][key] || key;
};
