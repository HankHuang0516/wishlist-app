import { describe, expect, it } from 'vitest';
import { iosColors, iosRadius, iosSpacing, minimumTapSize } from '../iosTheme';

function luminance(hex: string) {
  const values = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const high = Math.max(luminance(a), luminance(b));
  const low = Math.min(luminance(a), luminance(b));
  return (high + 0.05) / (low + 0.05);
}

describe('iOS visual system', () => {
  it('keeps primary text above WCAG AA contrast on grouped and card surfaces', () => {
    expect(contrast(iosColors.label, iosColors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(iosColors.label, iosColors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps primary action text legible and touch targets at least 44 points', () => {
    expect(contrast(iosColors.white, iosColors.tint)).toBeGreaterThanOrEqual(4.5);
    expect(minimumTapSize).toBeGreaterThanOrEqual(44);
  });

  it('uses a consistent spacing and corner-radius scale', () => {
    expect(Object.values(iosSpacing)).toEqual([...Object.values(iosSpacing)].sort((a, b) => a - b));
    expect(iosRadius.control).toBeLessThan(iosRadius.card);
    expect(iosRadius.card).toBeLessThan(iosRadius.large);
  });
});
