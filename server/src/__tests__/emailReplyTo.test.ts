import {isReplyMailbox} from '../lib/emailAddress';
const mockSend = jest.fn();
jest.mock('resend',()=>({Resend:jest.fn().mockImplementation(()=>({emails:{send:mockSend}}))}));
let sendEmail: typeof import('../lib/emailService').sendEmail;
beforeAll(()=>{process.env.RESEND_API_KEY='test-only-placeholder';sendEmail=require('../lib/emailService').sendEmail;});
beforeEach(()=>{mockSend.mockReset();mockSend.mockResolvedValue({data:{id:'test-provider'},error:null});});
test('single validated mailbox becomes provider Reply-To',async()=>{
 await expect(sendEmail('owner@example.com','TEST','<p>test</p>','contact+pilot@example.com')).resolves.toMatchObject({success:true});
 expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({to:['owner@example.com'],replyTo:'contact+pilot@example.com'}));
});
test('existing callers omit Reply-To',async()=>{await sendEmail('owner@example.com','TEST','test');expect(mockSend.mock.calls[0][0]).not.toHaveProperty('replyTo');});
test.each(['contact@example.com\r\nBcc: other@example.com','a@example.com,other@example.com','Name <a@example.com>','a@localhost','a..b@example.com','a@-bad.example.com','a@example.com\n','not-email'])('invalid mailbox cannot reach provider: %s',async value=>{
 expect(isReplyMailbox(value)).toBe(false);await expect(sendEmail('owner@example.com','TEST','test',value)).resolves.toMatchObject({success:false});expect(mockSend).not.toHaveBeenCalled();
});
