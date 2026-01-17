export const getUserLocale = (): string => {
    if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('user-locale');
        if (saved) return saved;
    }
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
        // Navigation
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
        'home.feature1.title': '拍一下，願望就記住了 📱',
        'home.feature1.desc': 'AI 自動幫你找到商品名稱、價格和購買連結',
        'home.feature2.title': '送禮不踩雷，朋友說讚 🎁',
        'home.feature2.desc': '分享你的願望清單，讓朋友知道你想要什麼',
        'home.feature3.title': '願望不再忘記 ✨',
        'home.feature3.desc': '依照場合分類，生日、節日、犒賞自己都能輕鬆管理',
        'home.feature4.title': '偷看清單，送進心坎 💕',
        'home.feature4.desc': '另一半偷偷查看願望，買到心儀禮物超幸福',

        // Login Page
        'login.title': '歡迎回來',
        'feedback.title': '意見回饋',
        'feedback.placeholder': '遇到問題？有功能建議？或只是想聊天？',
        'feedback.submit': '送出',
        'feedback.submitting': '處理中...',
        'feedback.cancel': '取消',
        'feedback.success': '感謝您的回饋！',
        'feedback.aiReply': 'Wishlist.ai 客服回覆:',
        'feedback.close': '關閉',
        'feedback.note': '注意：兩次提交之間需間隔 10 分鐘。',
        'settings.securityMandatory': '(系統強制)',

        // PWA
        'pwa.installTitle': '安裝 App',
        'pwa.android': 'Android',
        'pwa.noButton': "Don't see the button?",
        'pwa.manual': 'Manually install:',
        'pwa.step1': 'Tap the Menu icon (three dots)',
        'pwa.step2': 'Tap "Install App" or "Add to Home screen"',
        'pwa.step3': 'Tap "Install"',
        'pwa.howTo': '如何安裝？',
        'pwa.desktopDesc': '請檢查網址列右側的安裝圖示',

        // Wishlist Detail
        'wishlist.emptyOwner': '此清單目前是空的。點擊 + 新增項目！',
        'wishlist.emptyVisitor': '此願望清單目前是空的。',
        'login.phoneNumber': '手機號碼',
        'login.password': '密碼',
        'login.forgotPassword': '忘記密碼？',
        'login.signIn': '登入',
        'login.signingIn': '登入中...',
        'login.noAccount': '還沒有帳號？',
        'login.signUp': '註冊',

        // Register Page
        'register.title': '建立帳號',
        'register.subtitle': '輸入資料建立你的帳號',
        'register.name': '姓名',
        'register.namePlaceholder': '王小明',
        'register.birthday': '生日',
        'register.year': '年',
        'register.month': '月',
        'register.day': '日',
        'register.phoneNumber': '手機號碼',
        'register.password': '密碼',
        'register.createAccount': '建立帳號',
        'register.creatingAccount': '建立中...',
        'register.hasAccount': '已有帳號？',
        'register.signIn': '登入',

        // Forgot Password
        'forgot.title': '忘記密碼',
        'forgot.subtitle': '輸入手機號碼重設密碼',
        'forgot.sendCode': '發送驗證碼',
        'forgot.sending': '發送中...',
        'forgot.otpSent': '驗證碼已發送',
        'forgot.enterOtp': '輸入驗證碼',
        'forgot.newPassword': '新密碼',
        'forgot.resetPassword': '重設密碼',
        'forgot.resetting': '重設中...',
        'forgot.backToLogin': '返回登入',

        // Settings
        'settings.title': '設定',
        'settings.profile': '個人資料',
        'settings.changePassword': '修改密碼',
        'settings.notifications': '通知設定',
        'settings.premium': '升級 Premium',
        'settings.language': '語言',
        'settings.logout': '登出',
        'settings.save': '儲存',
        'settings.saving': '儲存中...',

        // Social
        'social.title': '朋友',
        'social.search': '搜尋使用者',
        'social.searchPlaceholder': '輸入姓名或手機號碼',
        'social.following': '追蹤中',
        'social.followers': '追蹤者',
        'social.follow': '追蹤',
        'social.unfollow': '取消追蹤',
        'social.noFollowing': '尚未追蹤任何人',
        'social.noFollowers': '還沒有追蹤者',

        // Dashboard
        'dashboard.myWishlists': '我的願望清單',
        'dashboard.newWishlist': '新增清單',
        'dashboard.empty': '還沒有願望清單',
        'dashboard.createFirst': '建立你的第一個願望清單',

        // Wishlist Detail
        'wishlist.addItem': '新增項目',
        'wishlist.empty': '清單是空的',
        'wishlist.addFirst': '新增你的第一個願望',
        'wishlist.delete': '刪除',
        'wishlist.edit': '編輯',
        'wishlist.share': '分享',
        'wishlist.price': '價格',
        'wishlist.buyNow': '立即購買',

        // Detail
        'detail.addUrl': '新增連結',
        'detail.uploadImg': '上傳圖片',
        'detail.addItemTitle': '新增物品',
        'detail.itemLabel': '商品網址 (支援各大電商)',
        'detail.itemPlaceholder': 'https://shopee.tw/product/...',
        'detail.smartInputTip': '貼上商品網址，AI 將自動為您填寫名稱、價格和圖片！',
        'detail.cloneTitle': '加入我的清單',
        'detail.cloneDesc': '選擇要加入的清單',
        'detail.cloneConfirm': '確認加入',
        'detail.cloneSuccess': '成功加入清單',
        'detail.deleteItemTitle': '刪除物品',
        'detail.deleteItemMsg': '確定要刪除此物品嗎？',
        'detail.copied': '已複製！',

        // Common
        'common.loading': '載入中...',
        'common.error': '發生錯誤',
        'common.retry': '重試',
        'common.cancel': '取消',
        'common.confirm': '確認',
        'common.save': '儲存',
        'common.saved': '已儲存！',
        'common.language': '語言',
        'common.languageDesc': '選擇您偏好的顯示語言',

        // Dashboard
        'dashboard.emptyTitle': '開啟您的願望之旅',
        'dashboard.emptyDesc': '建立第一個願望清單，開始收集您喜愛的物品！',
        'common.delete': '刪除',
        'common.edit': '編輯',
        'common.close': '關閉',
        'common.back': '返回',
        'common.next': '下一步',
        'common.done': '完成',
        'common.add': '新增',
        'common.processing': '處理中...',

        // AI Status
        'ai.complete': 'AI 識別完成',
        'ai.failed': 'AI 識別失敗',
        'ai.analyzing': 'AI 分析中',
        'ai.skipped': '傳統模式',

        // Settings - Deep Content
        'settings.avatar': '大頭照',
        'settings.displayName': '顯示名稱',
        'settings.nickname': '暱稱',

        'settings.emailNotifs': '電子郵件通知',
        'settings.notifMarketing': '接收行銷與更新資訊',
        'settings.notifSecurity': '帳號安全警示 (強制開啟)',
        'settings.avatarVisible': '目前狀態: 所有人可見 (讓朋友更容易找到你)',
        'settings.avatarHidden': '目前狀態: 隱藏 (別人看到會是預設灰色人)',
        'settings.changeAvatar': '更換照片',
        'settings.uploading': '更新中...',
        'settings.nicknames': '暱稱',
        'settings.nicknamesDesc': '(最多5個，預設為 piggy) 越多暱稱使自己更容易被搜尋到。',
        'settings.nicknamesPlaceholder': '例如: piggy, 小豬, 佩琪 (用逗號分隔)',
        'settings.privacyTitle': '隱私資料 (禮物送到家專用)',
        'settings.realName': '真實姓名',
        'settings.address': '寄送地址',
        'settings.phone': '手機號碼',
        'settings.birthday': '生日',
        'settings.public': '公開顯示',
        'settings.hidden': '隱藏',
        'settings.statusPublic': '目前: 公開顯示',
        'settings.statusHidden': '目前: 隱藏 (僅用於送禮)',
        'settings.statusHiddenBirthday': '目前: 隱藏 (設為隱藏時，不會出現在朋友的生日提醒中)',
        'settings.securityTitle': '帳號安全',
        'settings.securityDesc': '為了您的帳號安全，建議定期更改密碼。點擊下方按鈕前往修改頁面。',
        'settings.monetizationTitle': '贊助與升級',
        'settings.expandList': '擴充清單容量',
        'settings.expandListDesc': '單一清單上限 +10',
        'settings.buyNow': '立即購買',
        'settings.premiumTitle': '無限訂閱制',
        'settings.premiumDesc': '解鎖所有清單無限容量',
        'settings.subscribe': '立即訂閱',
        'settings.isPremium': '✨ 您目前是尊榮會員',
        'settings.cancelSubscription': '取消訂閱',
        'settings.historyTitle': '交易紀錄',
        'settings.viewHistory': '查看贊助與購買紀錄',
        'settings.installApp': '安裝應用程式',
        'settings.installDesc': '獲得更流暢的 App 體驗',
        'settings.installBtn': '立即安裝',

        // Social - Extra
        'social.findFriends': '尋找朋友',
        'social.mutual': '朋友',
        'social.peek': '偷窺',
        'social.confirmUnfollow': '確定要刪除好友 {name} 嗎？',
        'social.unfollowErr': '無法追蹤',
        'social.birthdayPrefix': '生日: ',
        'social.nicknamePrefix': '暱稱: ',
        'social.noUsers': '找不到使用者',

        // Forgot Password - Extra
        'forgot.enterOtpDesc': '請輸入驗證碼與新密碼',
        'forgot.otpSentAlert': '驗證碼已發送',
        'forgot.resetSuccessAlert': '密碼重設成功！請使用新密碼登入。',

        // Change Password
        'changePwd.title': '修改密碼',
        'changePwd.desc': '請輸入目前密碼與新密碼。',
        'changePwd.current': '目前密碼',
        'changePwd.new': '新密碼',
        'changePwd.confirm': '確認新密碼',
        'changePwd.update': '更新密碼',
        'changePwd.updating': '更新中...',
        'changePwd.success': '密碼修改成功！',
        'changePwd.matchErr': '新密碼不相符',
        'changePwd.lengthErr': '密碼長度至少需 6 個字元',

        // Friend Profile
        'friend.title': '好友資料',
        'friend.basicInfo': '基本資料',
        'friend.hidden': '已隱藏',
        'friend.viewWishlist': '查看願望清單',

        // Purchase History
        'purchase.accountTitle': '帳戶購買紀錄',
        'purchase.accountDesc': '訂閱與升級紀錄',
        'purchase.giftsTitle': '已送出的禮物',
        'purchase.giftsDesc': '您已標記為購買的物品',
        'purchase.noAccount': '查無購買紀錄',
        'purchase.noGifts': '尚未送出任何禮物',
        'purchase.for': '給 {name}',

        // Wishlist Dashboard
        'dashboard.totalItems': '物品總數',
        'dashboard.perList': '每份清單',

        'dashboard.userWishlists': '{name} 的公開清單',
        'dashboard.createTitle': '建立新清單',
        'dashboard.titlePlaceholder': '清單名稱 (例如: 2024 生日)',
        'dashboard.descPlaceholder': '描述 (選填)',
        'dashboard.publicLabel': '公開此清單 (Public)',
        'dashboard.public': '所有人可見',
        'dashboard.private': '僅自己可見',
        'dashboard.createBtn': '建立清單',
        'dashboard.deleteConfirmTitle': '刪除願望清單',
        'dashboard.deleteConfirmMsg': '您確定要刪除整個願望清單嗎？包含其中的所有物品。此操作無法復原。',
        'dashboard.emptyOwner': '您還沒有建立任何清單。在上方建立一個吧！',
        'dashboard.emptyVisitor': '此用戶尚未建立任何公開清單。',


    },
    'en-US': {
        // Navigation
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
        'home.feature1.title': 'Snap it, save it 📱',
        'home.feature1.desc': 'AI finds product name, price, and shopping links automatically',
        'home.feature2.title': 'Perfect gifts, happy friends 🎁',
        'home.feature2.desc': 'Share your wishlist so friends know what you really want',
        'home.feature3.title': 'Never forget a wish ✨',
        'home.feature3.desc': 'Organize by occasion - birthdays, holidays, treats for yourself',
        'home.feature4.title': 'Peek & surprise 💕',
        'home.feature4.desc': 'Your partner secretly checks your list and gets the perfect gift',

        // Login Page
        'login.title': 'Welcome back',
        'login.subtitle': 'Enter your phone number to sign in',
        'login.phoneNumber': 'Phone Number',
        'login.password': 'Password',
        'login.forgotPassword': 'Forgot password?',
        'login.signIn': 'Sign In',
        'login.signingIn': 'Signing In...',
        'login.noAccount': 'Don\'t have an account?',
        'login.signUp': 'Sign up',

        // Register Page
        'register.title': 'Create an account',
        'register.subtitle': 'Enter your details to create your account',
        'register.name': 'Name',
        'register.namePlaceholder': 'John Doe',
        'register.birthday': 'Birthday',
        'register.year': 'Year',
        'register.month': 'Month',
        'register.day': 'Day',
        'register.phoneNumber': 'Phone Number',
        'register.password': 'Password',
        'register.createAccount': 'Create Account',
        'register.creatingAccount': 'Creating Account...',
        'register.hasAccount': 'Already have an account?',
        'register.signIn': 'Sign in',

        // Forgot Password
        'forgot.title': 'Forgot Password',
        'forgot.subtitle': 'Enter your phone number to reset password',
        'forgot.sendCode': 'Send Code',
        'forgot.sending': 'Sending...',
        'forgot.otpSent': 'Code Sent',
        'forgot.enterOtp': 'Enter Code',
        'forgot.newPassword': 'New Password',
        'forgot.resetPassword': 'Reset Password',
        'forgot.resetting': 'Resetting...',
        'forgot.backToLogin': 'Back to Login',

        // Settings
        'settings.title': 'Settings',
        'settings.profile': 'Profile',
        'settings.changePassword': 'Change Password',
        'settings.notifications': 'Notifications',
        'settings.premium': 'Upgrade to Premium',
        'settings.language': 'Language',
        'settings.logout': 'Logout',
        'settings.save': 'Save',
        'settings.saving': 'Saving...',

        // Social
        'social.title': 'Social',
        'social.search': 'Search Users',
        'social.searchPlaceholder': 'Enter name or phone number',
        'social.following': 'Following',
        'social.followers': 'Followers',
        'social.follow': 'Follow',
        'social.unfollow': 'Unfollow',
        'social.noFollowing': 'Not following anyone yet',
        'social.noFollowers': 'No followers yet',

        // Dashboard
        'dashboard.myWishlists': 'My Wishlists',
        'dashboard.newWishlist': 'New Wishlist',
        'dashboard.empty': 'No wishlists yet',
        'dashboard.createFirst': 'Create your first wishlist',

        // Wishlist Detail
        'wishlist.addItem': 'Add Item',
        'wishlist.empty': 'This list is empty',
        'wishlist.addFirst': 'Add your first wish',
        'wishlist.delete': 'Delete',
        'wishlist.edit': 'Edit',
        'wishlist.share': 'Share',
        'wishlist.price': 'Price',
        'wishlist.buyNow': 'Buy Now',

        // Detail
        'detail.addUrl': 'Add URL',
        'detail.uploadImg': 'Upload Image',
        'detail.addItemTitle': 'Add Item',
        'detail.itemLabel': 'Product URL',
        'detail.itemPlaceholder': 'https://amazon.com/...',
        'detail.smartInputTip': 'Paste a product URL, and AI will auto-fill the name, price, and image!',
        'detail.cloneTitle': 'Add to My Wishlist',
        'detail.cloneDesc': 'Select a wishlist',
        'detail.cloneConfirm': 'Add to Wishlist',
        'detail.cloneSuccess': 'Added to wishlist successfully',
        'detail.deleteItemTitle': 'Delete Item',
        'detail.deleteItemMsg': 'Are you sure you want to delete this item?',
        'detail.copied': 'Copied!',

        // Common
        'common.loading': 'Loading...',
        'common.error': 'An error occurred',
        'common.retry': 'Retry',
        'common.cancel': 'Cancel',
        'common.confirm': 'Confirm',
        'common.save': 'Save',
        'common.saved': 'Saved!',
        'common.language': 'Language',
        'common.languageDesc': 'Choose your preferred language',

        // Dashboard
        'dashboard.emptyTitle': 'Start Your Wishlist Journey',
        'dashboard.emptyDesc': 'Create your first wishlist and start collecting items you love!',
        'common.delete': 'Delete',
        'common.edit': 'Edit',
        'common.close': 'Close',
        'common.back': 'Back',
        'common.next': 'Next',
        'common.done': 'Done',
        'common.add': 'Add',
        'common.processing': 'Processing...',

        // AI Status
        'ai.complete': 'AI Complete',
        'ai.failed': 'AI Failed',
        'ai.analyzing': 'AI Analyzing',
        'ai.skipped': 'Manual Mode',

        // Settings - Deep Content
        'settings.avatar': 'Profile Picture',
        'settings.displayName': 'Display Name',
        'settings.nickname': 'Nickname',

        'settings.emailNotifs': 'Email Notifications',
        'settings.notifMarketing': 'Receive Marketing & Updates',
        'settings.notifSecurity': 'Security Alerts (Required)',
        'settings.avatarVisible': 'Status: Visible to everyone (Easier for friends to find you)',
        'settings.avatarHidden': 'Status: Hidden (Others see default avatar)',
        'settings.changeAvatar': 'Change Photo',
        'settings.uploading': 'Uploading...',
        'settings.nicknames': 'Nicknames',
        'settings.nicknamesDesc': '(Max 5, default is piggy) More nicknames make it easier to be found.',
        'settings.nicknamesPlaceholder': 'e.g., piggy, cutie, honey (separated by commas)',
        'settings.privacyTitle': 'Private Info (For Gift Delivery)',
        'settings.realName': 'Real Name',
        'settings.address': 'Delivery Address',
        'settings.phone': 'Phone Number',
        'settings.birthday': 'Birthday',
        'settings.public': 'Visible',
        'settings.hidden': 'Hidden',
        'settings.statusPublic': 'Status: Visible',
        'settings.statusHidden': 'Status: Hidden (Only for gifting)',
        'settings.statusHiddenBirthday': 'Status: Hidden (Will not appear in friends\' birthday reminders)',
        'settings.securityTitle': 'Account Security',
        'settings.securityDesc': 'For your security, we recommend changing your password regularly.',
        'settings.monetizationTitle': 'Sponsorship & Upgrade',
        'settings.expandList': 'Expand List Capacity',
        'settings.expandListDesc': 'List limit +10',
        'settings.buyNow': 'Buy Now',
        'settings.premiumTitle': 'Unlimited Subscription',
        'settings.premiumDesc': 'Unlock unlimited capacity for all lists',
        'settings.subscribe': 'Subscribe Now',
        'settings.isPremium': '✨ You are a Premium Member',
        'settings.cancelSubscription': 'Cancel Subscription',
        'settings.historyTitle': 'Transaction History',
        'settings.viewHistory': 'View History',
        'settings.installApp': 'Install App',
        'settings.installDesc': 'Get a smoother app experience',
        'settings.installBtn': 'Install Now',

        // Social - Extra
        'social.findFriends': 'Find Friends',
        'social.mutual': 'Friend',
        'social.peek': 'Following',
        'social.confirmUnfollow': 'Are you sure you want to remove {name}?',
        'social.unfollowErr': 'Cannot follow',
        'social.birthdayPrefix': 'Birthday: ',
        'social.nicknamePrefix': 'Nickname: ',
        'social.noUsers': 'No users found',

        // Forgot Password - Extra
        'forgot.enterOtpDesc': 'Enter verification code and new password',
        'forgot.otpSentAlert': 'Verification code sent',
        'forgot.resetSuccessAlert': 'Password reset successful! Please login.',

        // Change Password
        'changePwd.title': 'Change Password',
        'changePwd.desc': 'Enter your current password and a new password.',
        'changePwd.current': 'Current Password',
        'changePwd.new': 'New Password',
        'changePwd.confirm': 'Confirm New Password',
        'changePwd.update': 'Update Password',
        'changePwd.updating': 'Updating...',
        'changePwd.success': 'Password changed successfully!',
        'changePwd.matchErr': 'New passwords do not match',
        'changePwd.lengthErr': 'Password must be at least 6 characters',

        // Friend Profile
        'friend.title': 'Profile',
        'friend.basicInfo': 'Basic Info',
        'friend.hidden': 'Hidden',
        'friend.viewWishlist': 'View Wishlists',

        // Purchase History
        'purchase.accountTitle': 'Account Purchases',
        'purchase.accountDesc': 'Subscriptions and Upgrades',
        'purchase.giftsTitle': 'Gifts Sent',
        'purchase.giftsDesc': 'Items you marked as purchased',
        'purchase.noAccount': 'No account purchases found.',
        'purchase.noGifts': 'You haven\'t marked any items as purchased yet.',
        'purchase.for': 'For {name}',

        // Wishlist Dashboard
        'dashboard.totalItems': 'Total Items',
        'dashboard.perList': 'Per List',

        'dashboard.userWishlists': '{name}\'s Public Wishlists',
        'dashboard.createTitle': 'Create New Wishlist',
        'dashboard.titlePlaceholder': 'Wishlist Title (e.g. Birthday 2024)',
        'dashboard.descPlaceholder': 'Description (Optional)',
        'dashboard.publicLabel': 'Public Wishlist',
        'dashboard.public': 'Visible to everyone',
        'dashboard.private': 'Visible only to me',
        'dashboard.createBtn': 'Create Wishlist',
        'dashboard.deleteConfirmTitle': 'Delete Wishlist',
        'dashboard.deleteConfirmMsg': 'Are you sure you want to delete this wishlist? This cannot be undone.',
        'dashboard.emptyOwner': 'You don\'t have any wishlists yet. Create one above!',
        'dashboard.emptyVisitor': 'This user hasn\'t created any public wishlists.',


    }
};

export const t = (key: string): string => {
    const locale = getUserLocale();
    const lang = locale.startsWith('zh') ? 'zh-TW' : 'en-US';
    return translations[lang]?.[key] || translations['en-US'][key] || key;
};
