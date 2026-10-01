import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import DateField from './DateField';
function Form({ min, disabled = false }: { min?: string; disabled?: boolean }) {
  const [value, setValue] = useState('2026-11-20');
  return <DateField label="失效日期" value={value} onChange={setValue} min={min} disabled={disabled} />;
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-02T00:00:00Z')); });
afterEach(() => vi.useRealTimers());
const show = () => fireEvent.click(screen.getByRole('button', { name: '開啟「失效日期」日曆' }));
describe('stable web calendar date selection', () => {
  it('navigates across years and back without changing the form or resetting on a parent rerender', () => {
    const view = render(<Form />); show();
    fireEvent.click(screen.getByRole('button', { name: '下一個月' }));
    expect(screen.getByRole('heading', { name: '2026 年 12 月' })).toBeInTheDocument();
    view.rerender(<Form />); expect(screen.getByRole('heading', { name: '2026 年 12 月' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一個月' }));
    expect(screen.getByRole('heading', { name: '2027 年 1 月' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '上一個月' }));
    expect(screen.getByLabelText('失效日期')).toHaveValue('2026-11-20');
    fireEvent.click(screen.getByRole('button', { name: '選擇 2026-12-01' }));
    expect(screen.getByLabelText('失效日期')).toHaveValue('2026-12-01'); expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: '開啟「失效日期」日曆' })).toHaveFocus();
  });
  it('prevents selection before the extension minimum without replacing that date during navigation', () => {
    render(<Form min="2026-11-21" />); show();
    expect(screen.getByRole('button', { name: '上一個月' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '選擇 2026-11-20' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '選擇 2026-11-21' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '選擇 2026-11-21' }));
    expect(screen.getByLabelText('失效日期')).toHaveValue('2026-11-21');
  });
  it('has the real leap-year day and supports clearing back to the caller default', () => {
    render(<Form />); fireEvent.change(screen.getByLabelText('失效日期'), { target: { value: '2028-02-10' } }); show();
    expect(screen.queryByRole('button', { name: '選擇 2028-02-30' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '選擇 2028-02-29' }));
    expect(screen.getByLabelText('失效日期')).toHaveValue('2028-02-29'); show();
    fireEvent.click(screen.getByRole('button', { name: '清除日期' })); expect(screen.getByLabelText('失效日期')).toHaveValue('');
  });
  it('moves focus across a year boundary using arrows and cancels without applying a date', () => {
    render(<Form />); fireEvent.change(screen.getByLabelText('失效日期'), { target: { value: '2026-12-31' } }); show();
    fireEvent.keyDown(screen.getByRole('button', { name: '選擇 2026-12-31' }), { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: '2027 年 1 月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '選擇 2027-01-01' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByLabelText('失效日期')).toHaveValue('2026-12-31');
  });
  it('traps keyboard focus and preserves selection when dismissed via backdrop', () => {
    render(<Form />); show(); const dialog = screen.getByRole('dialog');
    const first = within(dialog).getByRole('button', { name: '上一個月' }), last = within(dialog).getByRole('button', { name: '關閉日曆' });
    first.focus(); fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' }); expect(first).toHaveFocus();
    fireEvent.mouseDown(dialog.parentElement!); expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByLabelText('失效日期')).toHaveValue('2026-11-20');
  });
  it('cannot open or select while disabled and closes if the parent locks during selection', () => {
    const view = render(<Form disabled />); expect(screen.getByLabelText('失效日期')).toBeDisabled(); show(); expect(screen.queryByRole('dialog')).toBeNull();
    view.rerender(<Form />); show(); view.rerender(<Form disabled />); expect(screen.queryByRole('dialog')).toBeNull();
  });
});
