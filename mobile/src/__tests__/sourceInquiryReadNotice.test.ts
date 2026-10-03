import { describe, expect, it } from 'vitest';
import { sourceInquiryReadNotice } from '../sourceInquiryReadNotice';
const state = { busy:false, error:'', hasPending:false, hasRoom:false, status:'尚無詢問，可提出問題。' };
describe('source inquiry read and uncertain-write notice', () => {
  it.each([false, true])('preserves an unknown ASK result during refresh or failure, busy=%s', busy => {
    const result=sourceInquiryReadNotice({...state,busy,error:'network',hasPending:true});
    expect(result).toContain('結果尚未確認');
    expect(result).toContain('同一識別碼');
    expect(result).not.toContain('尚未送出');
  });
  it.each([false, true])('keeps a prior delivery receipt when updating an existing room, busy=%s', busy => {
    const result=sourceInquiryReadNotice({...state,busy,error:busy?'':'network',hasRoom:true,status:'已記錄人工代轉回執，等待原賣家答覆。'});
    expect(result).toContain('已記錄人工代轉回執');
    expect(result).not.toContain('尚未送出');
  });
  it('does not infer absence of an existing inquiry from a failed initial read',()=>{
    expect(sourceInquiryReadNotice({...state,error:'network'})).toContain('無法判定既有詢問狀態');
  });
  it('shows the authoritative last-read status when no operation is running',()=>{
    expect(sourceInquiryReadNotice({...state,hasRoom:true,status:'已取消'})).toBe('已取消');
  });
});
