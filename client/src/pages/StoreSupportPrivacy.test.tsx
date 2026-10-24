import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import PrivacyPolicy from './PrivacyPolicy';
import SupportPage from './SupportPage';
import TermsOfUse from './TermsOfUse';

const auth = { user: null, token: null, login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), isAuthenticated: false };

afterEach(() => {localStorage.clear();vi.restoreAllMocks();});

describe('store-facing support and privacy pages', () => {
  it.each([PrivacyPolicy,TermsOfUse])('keeps legal content and a named 44px back action usable when locale storage fails',Page=>{
    vi.spyOn(localStorage,'getItem').mockImplementation(()=>{throw Error('storage unavailable');});render(<MemoryRouter><Page/></MemoryRouter>);
    expect(screen.getByRole('button',{name:'Go back'})).toHaveClass('min-h-11','min-w-11');expect(screen.getByRole('heading',{level:1}).textContent).not.toMatch(/[\u4e00-\u9fff]/);
  });
  it('describes current photo, location, chat, AI, and deletion processing in Chinese', () => {
    localStorage.setItem('user-locale', 'zh-TW');
    render(<MemoryRouter><PrivacyPolicy /></MemoryRouter>);
    expect(screen.getByText(/Flickr/)).toBeInTheDocument();
    expect(screen.getByText(/面交地點僅提供相關對話參與者/)).toBeInTheDocument();
    expect(screen.getByText(/照片與您提供的商品資訊可能交由 AI/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /刪除帳號/ })).toHaveAttribute('href', '/account-deletion');
    expect(screen.getByRole('link', { name: '支援頁面' })).toHaveAttribute('href', '/support');
    expect(screen.getByText(/不傳送網址查詢參數、驗證碼/)).toBeInTheDocument();
  });

  it.each(['zh-TW','en-US'])('explains private chat photos, truthful public counts and optional push identifiers in %s', locale => {
    localStorage.setItem('user-locale',locale);render(<MemoryRouter><PrivacyPolicy/></MemoryRouter>);
    const content=document.body.textContent!;
    expect(content).toContain('EXIF');expect(content).toContain('Expo');expect(content).toContain('APNs');expect(content).toContain('FCM');
    if(locale==='zh-TW') {expect(content).toContain('不公開名單');expect(content).toContain('訊息內容預覽預設關閉');expect(content).toContain('不會因補傳照片而自動送交 AI');}
    else {expect(content).toContain('never lists of people');expect(content).toContain('Message previews are off by default');expect(content).toContain('not automatically sent to AI');}
  });

  it('offers public feedback without requiring app sign-in', () => {
    localStorage.setItem('user-locale', 'en-US');
    render(<MemoryRouter><AuthContext.Provider value={auth}><SupportPage /></AuthContext.Provider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Contact support' }));
    expect(screen.getByText('Email (Required for reply)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Delete account and data' })).toHaveAttribute('href', '/account-deletion');
  });
});
