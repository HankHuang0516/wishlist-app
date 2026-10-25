import {act,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {AuthContext} from '../context/AuthContext';
import AccountBenefits,{parseAllowance} from './AccountBenefits';
import {parseBillingBenefits} from '../lib/billingBenefits';
const auth={user:{id:19,phoneNumber:'fixture'},token:'fixture-session',login:vi.fn(),logout:vi.fn(),refreshUser:vi.fn(),isAuthenticated:true};
const allowance={freeMonthlyLimit:3,freeUsedThisMonth:1,permanentCreditsRemaining:7,paidPurchasesAvailable:false};
const billing={inquiry:{premium:false,freeWeeklyLimit:3,freeUsedThisWeek:1,freeRemaining:2,resetsAt:'2026-10-25T16:00:00Z',timeZone:'Asia/Taipei'},accountToken:'11111111-1111-4111-8111-111111111111',obfuscatedAccountId:'a'.repeat(64),environment:'Production',availability:{apple:false,google:false,web:false}};
const ok=(value:unknown)=>({ok:true,json:async()=>value});
const view=(token=auth.token)=><AuthContext.Provider value={{...auth,token}}><AccountBenefits/></AuthContext.Provider>;
beforeEach(()=>localStorage.setItem('user-locale','zh-TW'));
afterEach(()=>{localStorage.clear();vi.unstubAllGlobals();});
describe('weekly inquiry and separate monetization offers',()=>{
 it.each(['zh-TW','en-US'])('shows the single tip price, weekly quota and private management links in %s',async locale=>{
  localStorage.setItem('user-locale',locale);const fetch=vi.fn(async(url:string)=>ok(url.endsWith('/payment/benefits')?billing:allowance));vi.stubGlobal('fetch',fetch);render(view());const zh=locale==='zh-TW';
  await screen.findByText(zh?'永久加值剩餘：7 次':'Permanent credits remaining: 7 uses');
  expect(screen.getByText(zh?'本週免費代問剩 2／3 次':'2 of 3 free inquiries left this week')).toBeInTheDocument();
  expect(screen.getByText(zh?'贊助 Wishlist · NT$90':'Support Wishlist · NT$90')).toBeInTheDocument();
  expect(screen.getByText(zh?'尊榮版訂閱 · NT$90／月':'Premium subscription · NT$90/month')).toBeInTheDocument();
  expect(screen.getByText(zh?'行銷小助手加值 · US$1／10 次':'Marketing top-up · US$1/10 uses')).toBeInTheDocument();
  for(const link of screen.getAllByRole('link')){expect(link).toHaveAttribute('rel','noopener noreferrer');expect(link.getAttribute('href')).not.toContain(auth.token);}
  expect(fetch.mock.calls.every(call=>!((call as unknown[])[1] as RequestInit)?.method)).toBe(true);
 });
 it('uses server premium access rather than treating a sponsorship or marketing balance as membership',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>ok(url.endsWith('/payment/benefits')?{...billing,inquiry:{...billing.inquiry,premium:true}}:allowance)));render(view());await screen.findByText('尊榮代問權益已啟用');expect(screen.queryByText('本週免費代問剩 2／3 次')).not.toBeInTheDocument();
 });
 it('failed reads remain unknown rather than zero and explicit retry never purchases',async()=>{
  const fetch=vi.fn().mockRejectedValue(new Error('offline'));vi.stubGlobal('fetch',fetch);render(view());await screen.findByRole('alert');expect(screen.getByText('永久加值剩餘：暫時無法核對')).toBeInTheDocument();
  fetch.mockImplementation(async(url:string)=>ok(url.endsWith('/payment/benefits')?billing:allowance));fireEvent.click(screen.getByRole('button',{name:'重新核對權益'}));await screen.findByText('永久加值剩餘：7 次');expect(fetch.mock.calls.every(([,init])=>!init.method)).toBe(true);
 });
 it('does not display old account benefits while another account read is held',async()=>{
  const release:((value:unknown)=>void)[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
   if((init.headers as Record<string,string>).Authorization.includes('fixture-session'))return ok(url.endsWith('/payment/benefits')?billing:allowance);
   return new Promise(resolve=>release.push(resolve));
  }));const mounted=render(view());await screen.findByText('永久加值剩餘：7 次');mounted.rerender(view('other-session'));expect(screen.queryByText('永久加值剩餘：7 次')).not.toBeInTheDocument();
  await act(async()=>{release[0](ok({...allowance,permanentCreditsRemaining:2}));release[1](ok(billing));});await screen.findByText('永久加值剩餘：2 次');
 });
 it('rejects malformed and inconsistent quotas, balances and purchase availability',()=>{
  for(const value of [null,[],{}, {...allowance,permanentCreditsRemaining:-1},{...allowance,freeUsedThisMonth:'3'}])expect(()=>parseAllowance(value)).toThrow();
  for(const value of [null,{}, {...billing,inquiry:{...billing.inquiry,freeRemaining:3}}, {...billing,inquiry:{...billing.inquiry,premium:'true'}},{...billing,availability:{apple:'true',google:false,web:false}}])expect(()=>parseBillingBenefits(value)).toThrow();
 });
});
