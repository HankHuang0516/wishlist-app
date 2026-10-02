import { getUserLocale } from '../utils/localization';

const copy = {
  home: ['首頁', 'Home'], gifts: ['禮物', 'Gifts'], explore: ['探索', 'Explore'],
  chat: ['聊天', 'Chat'], friends: ['朋友', 'Friends'], settings: ['設定', 'Settings'],
  navigation: ['主要功能', 'Main navigation'],
  wishesDescription: ['我的願望與照片辨識', 'My wishes and photo recognition'],
  exploreDescription: ['探索商品地圖', 'Explore the listing map'],
  chatDescription: ['聊天與面交', 'Chat and meetups'],
  premium: ['尊榮會員', 'Premium member'], logout: ['登出', 'Sign out'], login: ['登入', 'Sign in'],
  help: ['意見回饋與協助', 'Feedback and help'], feedback: ['意見回饋', 'Feedback'],
  terms: ['使用者條款', 'Terms of use'], privacy: ['隱私權政策', 'Privacy policy'],
  support: ['支援與聯絡', 'Support and contact'], deletion: ['刪除帳號', 'Account deletion'],
  partners: ['供給合作', 'Supply partnerships'], changelog: ['進版日誌', 'Changelog'],
  privatePhoto: ['僅本人可見的商品照片', 'Listing photo visible only to you'],
  photoLoading: ['照片載入中', 'Loading photo'], photoUnavailable: ['照片暫時無法載入', 'Photo temporarily unavailable'],
  photoSeparator: ['：', ': '],
} as const;

export function webShellText(key: keyof typeof copy) {
  let chinese = false;
  try { chinese = getUserLocale().startsWith('zh'); } catch { /* Navigation remains usable without locale storage. */ }
  return copy[key][chinese ? 0 : 1];
}
