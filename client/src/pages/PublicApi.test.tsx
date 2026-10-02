import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ApiShowcasePage from './ApiShowcasePage';
import ApiDocsPage from './ApiDocsPage';
beforeEach(()=>{localStorage.setItem('user-locale','en-US');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn(async()=>{})}});});
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});
it('copies the exact configured loopback scheme and uses single accessible original links',async()=>{
  render(<MemoryRouter><ApiShowcasePage/></MemoryRouter>);fireEvent.click(screen.getByRole('button',{name:'Copy',exact:true}));await screen.findByRole('status');expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:8000/api');expect(screen.getByText('Platform payment and delivery unavailable')).toBeInTheDocument();for(const name of ['Register free','View full API docs'])expect(screen.getByRole('link',{name}).querySelector('button')).toBeNull();expect(document.body.textContent).not.toMatch(/UCP|[\u4e00-\u9fff]/);
});
it('exposes selectable URL on clipboard failure and gates same-turn double clicks',async()=>{
  let reject!:(error:unknown)=>void;vi.mocked(navigator.clipboard.writeText).mockImplementation(()=>new Promise((_resolve,no)=>{reject=no;}));render(<MemoryRouter><ApiShowcasePage/></MemoryRouter>);const button=screen.getByRole('button',{name:'Copy',exact:true});fireEvent.click(button);fireEvent.click(button);expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);await act(async()=>reject(Error()));await screen.findByText('The link could not be copied. Select the URL above and copy it yourself.');expect(screen.getByText('http://localhost:8000/api')).toHaveClass('select-all');expect(button).toBeEnabled();
});
it.each(['en-US','zh-TW'])('docs preserve original endpoints with actual email contracts and clear base joining in %s',locale=>{
  localStorage.setItem('user-locale',locale);render(<MemoryRouter><ApiDocsPage/></MemoryRouter>);expect(screen.getByText('{ phoneNumber, password, email, name?, birthday? }')).toBeInTheDocument();expect(screen.getByText('{ token, newPassword }')).toBeInTheDocument();expect(screen.getByText('/auth/verify-email')).toBeInTheDocument();expect(screen.getByText('/auth/resend-verification')).toBeInTheDocument();expect(screen.getAllByText('/users/me/ai-prompt')).toHaveLength(2);expect(screen.getByText(/PAYMENT_VERIFICATION_REQUIRED/)).toBeInTheDocument();expect(document.body.textContent).not.toContain('/api/auth/login');expect(screen.getByRole('link',{name:locale==='en-US'?'← Back to Settings':'← 返回設定'}).querySelector('button')).toBeNull();if(locale==='en-US')expect(document.body.textContent).not.toMatch(/[\u4e00-\u9fff]/);
});
it('a departed showcase does not report a late clipboard completion',async()=>{
  let finish!:()=>void;vi.mocked(navigator.clipboard.writeText).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const page=render(<MemoryRouter><ApiShowcasePage/></MemoryRouter>);fireEvent.click(screen.getByRole('button',{name:'Copy',exact:true}));await waitFor(()=>expect(finish).toBeTypeOf('function'));page.unmount();await act(async()=>finish());expect(screen.queryByRole('status')).toBeNull();
});
