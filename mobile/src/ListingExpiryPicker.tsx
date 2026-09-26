import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { taiwanDate } from './listingForm';
import { iosColors, iosRadius, iosSpacing, iosType, minimumTapSize } from './iosTheme';

export function ListingExpiryPicker({ value, minimumDateValue, onApply, onCancel }: {
  value: string; minimumDateValue?: string; onApply: (date: string) => void; onCancel: () => void;
}) {
  // Keep the calendar's browsing/selection state separate from the published
  // form. A parent render (including AI polling) must not reset its month.
  const [draft, setDraft] = useState(() => value ? new Date(`${value}T12:00:00+08:00`) : new Date());
  const [minimum] = useState(() => new Date(`${minimumDateValue ?? taiwanDate(new Date())}T00:00:00+08:00`));
  return <View style={s.container}>
    <DateTimePicker accessibilityLabel="失效日期" value={draft} minimumDate={minimum} mode="date"
      display={Platform.OS === 'ios' ? 'inline' : 'default'} timeZoneName="Asia/Taipei" locale="zh-TW"
      onValueChange={(_event, date) => {
        if (Platform.OS === 'android') onApply(taiwanDate(date));
        else setDraft(date);
      }} onDismiss={onCancel} />
    {Platform.OS === 'ios' && <View style={s.actions}>
      <Pressable accessibilityRole="button" onPress={onCancel} style={s.cancel}><Text style={s.cancelText}>取消</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => onApply(taiwanDate(draft))} style={s.apply}><Text style={s.applyText}>套用日期</Text></Pressable>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  container: { backgroundColor: iosColors.surface, borderRadius: iosRadius.card, padding: iosSpacing.sm },
  actions: { flexDirection: 'row', gap: iosSpacing.sm, justifyContent: 'flex-end', marginTop: iosSpacing.sm },
  cancel: { minHeight: minimumTapSize, paddingHorizontal: iosSpacing.md, justifyContent: 'center' },
  cancelText: { ...iosType.body, color: iosColors.tint },
  apply: { minHeight: minimumTapSize, paddingHorizontal: iosSpacing.md, borderRadius: iosRadius.control,
    backgroundColor: iosColors.tint, justifyContent: 'center' },
  applyText: { ...iosType.headline, color: iosColors.white },
});
