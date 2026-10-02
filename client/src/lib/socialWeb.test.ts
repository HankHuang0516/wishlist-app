import { describe,it,expect } from 'vitest';
import { parseSocialUsers,socialAvatar } from './socialWeb';
const user={id:2,name:'Public',nicknames:null,phoneNumber:null,avatarUrl:null,birthday:null,isFollowing:false,isMutual:false};
describe('strict social read contract',()=>{
    it('accepts hidden nullable fields and projects no credentials',()=>{
        expect(parseSocialUsers([{...user,password:'never-project',marketingEmailsEnabled:true}],'search')).toEqual([{id:2,name:'Public',nicknames:null,phoneNumber:null,avatarUrl:null,birthday:null,isFollowing:false}]);
        expect(parseSocialUsers([user],'following')[0]).toHaveProperty('isMutual',false);
    });
    it('rejects bad identities, duplicate rows, wrong status, non-array and malformed dates',()=>{
        for(const raw of [{},[user,user],[{...user,id:0}],[{...user,isFollowing:'false'}],[{...user,phoneNumber:{}}],[{...user,birthday:'1993-02-30T00:00:00.000Z'}],[{...user,name:'x'.repeat(51)}]]) expect(()=>parseSocialUsers(raw,'search')).toThrow();
        expect(()=>parseSocialUsers(Array.from({length:21},(_,i)=>({...user,id:i+1})),'search')).toThrow();
    });
    it('uses remote photo URL as-is and rejects unsafe or credential-bearing photos',()=>{
        expect(socialAvatar('https://live.staticflickr.com/test/photo.jpg')).toBe('https://live.staticflickr.com/test/photo.jpg');
        expect(socialAvatar('/uploads/synthetic.jpg')).toMatch(/\/uploads\/synthetic.jpg$/);
        for(const url of ['javascript:alert(1)','//evil.invalid/photo','http://evil.invalid/photo','https://user:secret@evil.invalid/photo','/uploads/../../file'])expect(()=>socialAvatar(url)).toThrow();
    });
});
