import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLazyPage } from './LazyPage';

beforeEach(() => {
  localStorage.setItem('user-locale', 'zh-TW');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

function Shell() {
  return <><label>Shell draft<input /></label><Link to="/other">Other page</Link><Link to="/page?view=next">Change query</Link><Outlet /></>;
}
function mount(Page: ReturnType<typeof createLazyPage>) {
  return render(<MemoryRouter initialEntries={['/page']}><Routes><Route element={<Shell />}><Route path="page" element={<Page />} /><Route path="other" element={<h1>Other feature</h1>} /><Route index element={<h1>Home</h1>} /></Route></Routes></MemoryRouter>);
}

describe('route resource recovery', () => {
  it('keeps the shell available while a page is loading', async () => {
    let finish!: (value: { default: () => React.ReactNode }) => void;
    const load = vi.fn(() => new Promise<{ default: () => React.ReactNode }>(resolve => { finish = resolve; }));
    mount(createLazyPage(load));
    expect(screen.getByRole('status')).toHaveTextContent('正在載入頁面');
    expect(screen.getByRole('link', { name: 'Other page' })).toBeInTheDocument();
    await act(async () => finish({ default: () => <h1>Loaded page</h1> }));
    await screen.findByRole('heading', { name: 'Loaded page' });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not retry automatically, disclose the import error, or unmount the shell; explicit retry creates a fresh lazy promise', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('secret://private-path/token'))
      .mockResolvedValue({ default: () => <h1>Recovered page</h1> });
    mount(createLazyPage(load));
    fireEvent.change(screen.getByLabelText('Shell draft'), { target: { value: 'keep this unsent text' } });
    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { name: '此頁暫時無法顯示' })).toHaveFocus();
    expect(document.body).not.toHaveTextContent('secret://');
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Shell draft')).toHaveValue('keep this unsent text');
    fireEvent.click(screen.getByRole('button', { name: '重試載入頁面' }));
    await screen.findByRole('heading', { name: 'Recovered page' });
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Shell draft')).toHaveValue('keep this unsent text');
  });

  it('keeps a repeated failure recoverable and leaves navigation functional', async () => {
    const load = vi.fn().mockRejectedValue(new Error('offline'));
    mount(createLazyPage(load));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: '重試載入頁面' }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '重新整理網站' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Other page' }));
    await screen.findByRole('heading', { name: 'Other feature' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('preserves page form state across parent rerenders and healthy query changes', async () => {
    function Form() { const location = useLocation(); return <><label>Page draft<input /></label><p>{location.search}</p></>; }
    const load = vi.fn().mockResolvedValue({ default: Form });
    mount(createLazyPage(load));
    await screen.findByLabelText('Page draft');
    fireEvent.change(screen.getByLabelText('Page draft'), { target: { value: 'local edit' } });
    fireEvent.click(screen.getByRole('link', { name: 'Change query' }));
    await screen.findByText('?view=next');
    expect(screen.getByLabelText('Page draft')).toHaveValue('local edit');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries a failed page on a new navigation without looping on the same location', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: () => <h1>Next location</h1> });
    mount(createLazyPage(load));
    await screen.findByRole('alert');
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('link', { name: 'Change query' }));
    await screen.findByRole('heading', { name: 'Next location' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('contains render failures without describing them as network errors and supports English', async () => {
    localStorage.setItem('user-locale', 'en-US');
    const load = vi.fn().mockResolvedValue({ default: () => { throw new Error('private render detail'); } });
    mount(createLazyPage(load));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('display problem');
    expect(alert).not.toHaveTextContent('connection');
    expect(alert).not.toHaveTextContent('private render detail');
    expect(screen.getByRole('button', { name: 'Retry loading page' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
