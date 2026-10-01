export interface Holiday { name: string; date: Date; calendarNotice?: string }

// Festival days, NOT substitute leave days or a legal entitlement calendar.
// DGPA 115/116 calendars: https://www.dgpa.gov.tw/information?pid=12685&uid=55
// https://www.dgpa.gov.tw/information?fid=9898&pid=12982&uid=30
// Unverified years must never reuse a previous year's lunar/solar-term dates.
const taiwanVariableDays: Record<number, readonly [string, number, number][]> = {
  2026: [['農曆新年 Lunar New Year', 2, 17], ['清明節 Tomb Sweeping', 4, 5], ['端午節 Dragon Boat', 6, 19], ['中秋節 Moon Festival', 9, 25]],
  2027: [['農曆新年 Lunar New Year', 2, 6], ['清明節 Tomb Sweeping', 4, 5], ['端午節 Dragon Boat', 6, 9], ['中秋節 Moon Festival', 9, 15]],
};

export function nextHoliday(locale: string, now: Date): Holiday {
  const year = now.getFullYear();
  const today = new Date(year, now.getMonth(), now.getDate()).getTime();
  const taiwan = locale.startsWith('zh-TW');
  let entries: readonly [string, number, number][];
  if (taiwan) {
    entries = [
      ['元旦 New Year', 1, 1], ['和平紀念日 Peace Day', 2, 28], ["兒童節 Children's Day", 4, 4],
      ['勞動節 Labor Day', 5, 1], ['國慶日 National Day', 10, 10], ...(taiwanVariableDays[year] ?? []),
    ];
  } else if (locale.startsWith('en-US')) {
    // OPM: Thanksgiving is the fourth Thursday of November, not always Nov 27.
    // https://www.opm.gov/faq/payleave/what-are-federal-holidays.ashx
    const thanksgiving = 1 + (4 - new Date(year, 10, 1).getDay() + 7) % 7 + 21;
    entries = [["New Year's Day", 1, 1], ["Valentine's Day", 2, 14], ['Independence Day', 7, 4], ['Halloween', 10, 31], ['Thanksgiving', 11, thanksgiving], ['Christmas', 12, 25]];
  } else entries = [["New Year's Day", 1, 1], ['Christmas', 12, 25]];
  const result = entries.map(([name, month, day]) => ({ name, date: new Date(year, month - 1, day) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime()).find(item => item.date.getTime() >= today)
    ?? { name: taiwan ? '元旦 New Year' : "New Year's Day", date: new Date(year + 1, 0, 1) };
  return taiwan && !taiwanVariableDays[year]
    ? { ...result, calendarNotice: '此年份僅列已核對的固定節日；農曆節日與清明日期待更新。' }
    : result;
}
