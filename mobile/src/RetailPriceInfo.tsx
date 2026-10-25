import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaModal } from './SafeAreaModal';
import { iosColors, iosType } from './iosTheme';
import { retailLabel, retailRatio, type RetailReference } from './retailReference';

export function RetailPriceInfo({ price, currency, unitVerified, reference }: {
  price: number | null; currency: string | null; unitVerified: boolean; reference?: RetailReference;
}) {
  const [open, setOpen] = useState(false), [issue, setIssue] = useState('');
  const visible = useRef(false);
  useEffect(() => { visible.current = false; setOpen(false); setIssue(''); }, [reference?.sourceUrl, reference?.checkedAt, reference?.price, price, currency, unitVerified]);
  useEffect(() => () => { visible.current = false; }, []);
  const ratio = retailRatio(price, currency, unitVerified, reference);
  if (ratio === undefined || !reference) return null;
  const close = () => { visible.current = false; setOpen(false); setIssue(''); };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${retailLabel(ratio)}，查看參考原價與來源`}
      style={s.badge} onPress={event => { event.stopPropagation(); visible.current = true; setIssue(''); setOpen(true); }}>
      <Text style={s.badgeText}>{retailLabel(ratio)}</Text><Ionicons name="information-circle-outline" size={18} color={iosColors.tint}/>
    </Pressable>
    <SafeAreaModal visible={open} animationType="slide" onRequestClose={close}>
      <View style={s.header}><Text accessibilityRole="header" style={s.title}>參考原價與來源</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="關閉原價參考" style={s.close} onPress={close}><Ionicons name="close" size={26} color={iosColors.label}/></Pressable></View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.label}>{retailLabel(ratio)}</Text>
        <Text style={s.text}>商品價格：NT$ {price!.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}</Text>
        <Text style={s.price}>參考原價：NT$ {reference.price.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}</Text>
        <Text style={s.text}>{reference.priceType === 'MANUFACTURER_MSRP' ? '原廠建議售價' : '新品一般售價'}</Text>
        {reference.sourceProductTitle && <Text style={s.text}>參考型號／規格：{reference.sourceProductTitle}</Text>}
        <Text style={s.label}>參考來源</Text><Text style={s.text}>{reference.sourceTitle}</Text>
        <Pressable accessibilityRole="link" style={s.link} onPress={() => {
          void Linking.openURL(reference.sourceUrl).catch(() => { if (visible.current) setIssue('暫時無法開啟來源，請稍後再試。'); });
        }}><Text style={s.linkText}>查看原價來源 · {new URL(reference.sourceUrl).hostname}</Text><Ionicons name="open-outline" size={18} color={iosColors.tint}/></Pressable>
        {reference.sourcePeriod && <Text style={s.text}>原價資料期間：{reference.sourcePeriod}</Text>}
        <Text style={s.text}>來源查核：{new Date(reference.checkedAt).toLocaleDateString('zh-TW')}</Text>
        <Text style={s.note}>以同型號／規格的參考原價比較。原價可能為上市建議售價，不代表目前最低新品價格，也不保證商品品況、庫存或成交。</Text>
        {!!issue && <Text accessibilityRole="alert" style={s.issue}>{issue}</Text>}
      </ScrollView>
    </SafeAreaModal>
  </>;
}
const s = StyleSheet.create({
  badge: { minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badgeText: { ...iosType.footnote, color: iosColors.tint, fontWeight: '600' },
  header: { paddingHorizontal: 20, minHeight: 64, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: iosColors.separator },
  title: { ...iosType.title2, color: iosColors.label, flex: 1 }, close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 16 }, label: { ...iosType.headline, color: iosColors.label }, text: { ...iosType.body, color: iosColors.secondaryLabel },
  price: { ...iosType.title2, color: iosColors.label }, link: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  linkText: { ...iosType.body, color: iosColors.tint, textDecorationLine: 'underline', flexShrink: 1 },
  note: { ...iosType.footnote, color: iosColors.secondaryLabel }, issue: { ...iosType.body, color: iosColors.danger },
});
