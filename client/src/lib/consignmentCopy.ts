import { getDisplayLocale } from '../utils/localization';

const copy = {
  title: ['查詢代售詢問與面交', 'Search consignment inquiries and meetups'],
  explanation: ['例如「二手書在哪裡面交？」或「商品 ID：…」。僅查詢已歸檔且有 Agent 代理詢問同意的來源商品；自刊商品排除。不發訊、不將聊天傳給外部模型。', 'Enter the original item name or a source item ID. Only archived source items with consent for agent inquiries are searched; self-listed items are excluded. This search sends no messages and shares no chats with external models.'],
  query: ['代售查詢問題', 'Consignment search'],
  search: ['查詢代售紀錄', 'Search consignment records'],
  searching: ['查詢中…', 'Searching…'],
  failed: ['代售查詢未完成，請重試；不能當作沒有紀錄。', 'The consignment search could not be completed. Retry; this does not mean there are no records.'],
  empty: ['沒有找到你有權讀取的合格代售詢問。可改用來源商品 ID 查詢；自刊商品不在範圍內。', 'No eligible consignment inquiries were found within your access. Try the source item ID; self-listed items are outside this search.'],
  truncated: ['結果超過安全查詢範圍，尚未完整；請用名稱或商品 ID 縮小範圍。', 'Results exceed the search limit and are incomplete. Narrow the search with an item name or ID.'],
  multiple: ['多個結果分別列出，請核對商品 ID，不合併同名商品的約定。', 'Results are listed separately. Check each item ID; appointments for items with the same name are not combined.'],
  product: ['商品 ID：', 'Item ID: '],
  archive: ['歸檔：', 'Archive: '],
  unknownMeetup: ['面交：未知。', 'Meetup: unknown. '],
  originalInquiry: ['原詢問：', 'Original inquiry: '],
  citations: ['原訊息引用', 'Original message citations'],
  consent: ['同意代理詢問', 'Consent to agent inquiry'],
  cancel: ['取消代理詢問', 'Cancel agent inquiry'],
  inquiry: ['詢問 ', 'Inquiry '],
  message: ['訊息 ', 'Message '],
  taiwanTime: ['（台灣時間）', ' (Taiwan time)'],
} as const;

export function consignmentText(key: keyof typeof copy): string {
  return copy[key][getDisplayLocale().startsWith('zh') ? 0 : 1];
}

// Translate only known server summaries, never an item name or quoted message.
const summaries: Record<string, string> = {
  '代理詢問已取消或要求取消；這不是面交取消或已成交的證明。': 'The agent inquiry was cancelled or cancellation was requested. This does not prove that a meetup was cancelled or a sale completed.',
  '代理詢問紀錄可查閱；是否外送、在售與面交均需另核實。': 'The agent inquiry record is readable. Forwarding, item availability and meetup arrangements still need separate verification.',
  '來源詢問尚無結構化雙方確認面交紀錄。原訊息的提議、確認、改約或取消文字僅作引用，不自動視為有效約定。': 'This source inquiry has no structured meetup record confirmed by both parties. Proposals, confirmations, rescheduling and cancellation in quoted messages do not automatically establish a valid appointment.',
};

export function consignmentSummary(value: string): string {
  return getDisplayLocale().startsWith('zh') ? value : summaries[value] ?? value;
}
