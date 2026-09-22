export const iosColors = Object.freeze({
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceSecondary: '#F7F7FA',
  label: '#1C1C1E',
  secondaryLabel: '#636366',
  tertiaryLabel: '#8E8E93',
  separator: '#D1D1D6',
  tint: '#0066CC',
  tintPressed: '#0055AD',
  tintSoft: '#EAF3FF',
  success: '#34C759',
  warning: '#FF9500',
  danger: '#FF3B30',
  dangerSoft: '#FFF1F0',
  brand: '#173E36',
  brandSoft: '#E8F1EE',
  white: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.22)',
});

export const iosSpacing = Object.freeze({
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
});

export const iosRadius = Object.freeze({
  small: 10,
  control: 12,
  card: 18,
  large: 24,
  pill: 999,
});

export const iosType = Object.freeze({
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '800' as const, letterSpacing: 0.2 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const, letterSpacing: 0.1 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' as const },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
});

export const iosShadow = Object.freeze({
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.07,
  shadowRadius: 14,
  elevation: 2,
});

export const iosFloatingShadow = Object.freeze({
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 9 },
  shadowOpacity: 0.14,
  shadowRadius: 24,
  elevation: 8,
});

export const minimumTapSize = 44;
