import {parsePartnerInquiry} from '../lib/partnerInquiry';
const body={organization:'TEST 商家',contactName:'測試窗口',contactEmail:'hankhuang0516@gmail.com',categories:['BOOKS'],updateMethod:'MANUAL',contactConsent:true};
test('accepts ordinary multiline cooperation details',()=>expect(parsePartnerInquiry({...body,message:'第一行\n第二行\r\n第三行'}).message).toBe('第一行\n第二行\r\n第三行'));
test('rejects other control characters and multiline contact fields',()=>{expect(()=>parsePartnerInquiry({...body,organization:'TEST\n商家'})).toThrow();expect(()=>parsePartnerInquiry({...body,message:'文字\u0000'})).toThrow();});

test.each(['a@example.com\r\nBcc: x@example.com','a@example.com,b@example.com','Name <a@example.com>'])('rejects unsafe contact mailbox: %s',email=>expect(()=>parsePartnerInquiry({...body,contactEmail:email})).toThrow());
