import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { AuthFlowError,authIssue,emailPayload,emailRequestAck,newPasswordPayload,recoveryToken,registrationAck,registrationPayload,resetAck,verificationAck } from './authFlowWeb';
beforeEach(()=>localStorage.setItem('user-locale','zh-TW'));
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});
const fields={name:' 合成名稱 ',phoneNumber:' 0912345678 ',email:' synthetic@example.invalid ',password:'Synthetic123!',confirmation:'Synthetic123!',birthday:''};
describe('web auth contracts matching APP',()=>{
  it('normalizes display, phone and email without changing password, and preserves optional valid birthday',()=>{
    expect(registrationPayload(fields)).toEqual({name:'合成名稱',phoneNumber:'0912345678',email:'synthetic@example.invalid',password:'Synthetic123!'});
    expect(registrationPayload({...fields,birthday:'2000-02-29'}).birthday).toBe('2000-02-29');
    expect(emailPayload(' synthetic@example.invalid ')).toEqual({email:'synthetic@example.invalid'});
  });
  it.each(['2000-02-30','2026-13-01','2999-01-01'])('rejects invalid/future birthday %s',birthday=>expect(()=>registrationPayload({...fields,birthday})).toThrow(AuthFlowError));
  it.each(['short1','NoNumbersHere','123456789','Synthetic123🙂','A1'+'a'.repeat(71),'A1\u0000abcdef'])('rejects weak/unsupported passwords without trimming %s',password=>expect(()=>newPasswordPayload(password,password)).toThrow(AuthFlowError));
  it('enforces confirmation, name and Taiwan phone constraints',()=>{
    expect(newPasswordPayload('A1'+'a'.repeat(70),'A1'+'a'.repeat(70))).toHaveLength(72);
    for(const patch of [{confirmation:'Different123'},{name:''},{name:'x'.repeat(51)},{phoneNumber:'1234567890'},{email:'not-email'}]) expect(()=>registrationPayload({...fields,...patch})).toThrow(AuthFlowError);
  });
  it('admits only raw codes or correct same-service links and mode',()=>{
    const token='a'.repeat(64),origin='https://wishlist.example';
    expect(recoveryToken(token,'verify',origin)).toBe(token);
    expect(recoveryToken(origin+'/reset-password?token='+token,'reset',origin)).toBe(token);
    expect(recoveryToken('weesh://reset-password?token='+token,'reset',origin)).toBe(token);
    expect(()=>recoveryToken('weesh://verify-email?token='+token,'reset',origin)).toThrow(AuthFlowError);
    expect(()=>recoveryToken('weesh://reset-password:9999?token='+token,'reset',origin)).toThrow(AuthFlowError);
    for(const link of ['https://evil.example/reset-password?token='+token,origin+'/verify-email?token='+token,origin+'/reset-password?token='+token+'&token='+token,origin+'/reset-password?token='+token+'#fragment',origin+'/reset-password?token='+token+'&next=private','A'.repeat(64)]) expect(()=>recoveryToken(link,'reset',origin)).toThrow(AuthFlowError);
  });
  it('requires exact registration evidence and ignores the unverified JWT',()=>{
    const ack={token:'unverified-fixture',user:{id:1,phoneNumber:'0912345678'},emailVerification:{required:true,sent:false,sentTo:'synthetic@example.invalid'}};
    expect(registrationAck(ack,'synthetic@example.invalid')).toEqual({sent:false});
    for(const value of [{}, {...ack,emailVerification:{...ack.emailVerification,sent:'true'}},{...ack,emailVerification:{...ack.emailVerification,sentTo:'other@example.invalid'}}])expect(()=>registrationAck(value,'synthetic@example.invalid')).toThrow(AuthFlowError);
  });
  it('requires verification identity and full password revocation evidence, rather than any 2xx object',()=>{
    expect(()=>verificationAck({message:'OK',user:{id:1,phoneNumber:'0912345678'}})).not.toThrow();
    expect(()=>verificationAck({message:'OK'})).toThrow(AuthFlowError);
    expect(()=>resetAck({changed:true,requiresLogin:true,personalApiKeysRevoked:true})).not.toThrow();
    expect(()=>resetAck({message:'OK',changed:true})).toThrow(AuthFlowError);
    for(const value of [null,[],{}, {message:''}])expect(()=>emailRequestAck(value)).toThrow(AuthFlowError);
  });
  it('never exposes arbitrary exception text and has English validation',()=>{
    expect(authIssue(new Error('secret-marker'))).not.toContain('secret-marker');
    localStorage.setItem('user-locale','en-US');expect(authIssue(new AuthFlowError('weak'))).toContain('8–72');
    vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('unavailable');});expect(authIssue(new AuthFlowError('expired'))).toContain('expired');
  });
});
