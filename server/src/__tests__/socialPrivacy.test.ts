import { socialCard, socialCardSelect, socialSearchQuery, socialSearchWhere } from '../lib/socialPrivacy';
const row={id:1,name:'Public',nicknames:'Nick',phoneNumber:'synthetic-private',isPhoneVisible:false,avatarUrl:'https://example.invalid/private.jpg',isAvatarVisible:false,birthday:new Date('1993-05-16'),isBirthdayVisible:false};
describe('privacy-aware social projection',()=>{
    it('hides private phone/photo/birthday, never serializes credentials or consent',()=>{
        expect(socialCard(row)).toEqual({id:1,name:'Public',nicknames:'Nick',phoneNumber:null,avatarUrl:null,birthday:null});
        for(const key of ['password','apiKey','authVersion','email','marketingEmailsEnabled','realName','address']) expect(socialCardSelect).not.toHaveProperty(key);
        expect(socialCard({...row,isPhoneVisible:true,isAvatarVisible:true,isBirthdayVisible:true})).toMatchObject({phoneNumber:row.phoneNumber,avatarUrl:row.avatarUrl,birthday:row.birthday});
    });
    it('requires the matching visibility flag, and full email rather than email substring',()=>{
        const where=socialSearchWhere('a@example.invalid',19);
        expect(where).toMatchObject({id:{not:19}});
        expect(where.OR).toContainEqual({phoneNumber:{contains:'a@example.invalid'},isPhoneVisible:true});
        expect(where.OR).toContainEqual({realName:{contains:'a@example.invalid',mode:'insensitive'},isRealNameVisible:true});
        expect(where.OR).toContainEqual({email:{equals:'a@example.invalid',mode:'insensitive'},isEmailVisible:true});
        expect(socialSearchWhere('example',19).OR).toHaveLength(4);
    });
    it('bounds and validates query without coercion or malformed UTF-8',()=>{
        expect(socialSearchQuery(' 公開名稱 ')).toBe('公開名稱');
        for(const value of [null,{},[],1,'','  ','x'.repeat(101),'a\u0000b','\ud800']) expect(socialSearchQuery(value)).toBeNull();
        expect(socialSearchQuery('a & b+名字')).toBe('a & b+名字');
    });
});
