import { profilePatch, profileData, profileVersion, profileHash, profileActionId } from '../lib/profileUpdate';
describe('bounded canonical profile patch', () => {
    it('accepts only explicit boolean notification consent; no fake security or push fields', () => {
        for (const value of [true, false]) expect(profilePatch({marketingEmailsEnabled:value})).toEqual({marketingEmailsEnabled:value});
        for (const value of ['true', 1, null, [], {}]) expect(() => profilePatch({marketingEmailsEnabled:value})).toThrow();
        for (const value of [{securityEmailsEnabled:false},{pushEnabled:true}]) expect(() => profilePatch(value)).toThrow();
    });
    it('clears birthday explicitly and preserves booleans without coercion', () => {
        expect(profilePatch({ birthday:'',isBirthdayVisible:false })).toEqual({birthday:null,isBirthdayVisible:false});
        expect(profileData(profilePatch({birthday:''}))).toEqual({birthday:null,profileVersion:{increment:1}});
        expect(profilePatch({nicknames:[' 甲 ','乙']})).toEqual({nicknames:'甲,乙'});
    });
    it.each([[],{}, {isPremium:true},{apiKey:'x'}, {isBirthdayVisible:'false'}, {birthday:'2026-02-30'}, {birthday:'2099-01-01'}, {birthday:[]}, {name:{}}, {address:'x'.repeat(501)}, {nicknames:'a,b,c,d,e,f'}, {nicknames:['a,b']}, {email:'not-email'}, {avatarUrl:'javascript:alert(1)'},{avatarUrl:'//evil.invalid/image'}, {avatarUrl:'/uploads/../../file'}, {realName:'\u0000'}])('rejects unsafe shape without a write: %p', raw => {
        expect(() => profilePatch(raw)).toThrow();
    });
    it('keeps stable hashes across key order and rejects invalid revisions/operation identities', () => {
        expect(profileHash(0,profilePatch({realName:'甲',address:'乙'}))).toBe(profileHash(0,profilePatch({address:'乙',realName:'甲'})));
        for (const version of [-1,NaN,'0',2147483647,1.5]) expect(() => profileVersion(version)).toThrow();
        expect(profileActionId('A2659534-E449-4D7D-B370-BFA7931C1463')).toBe('a2659534-e449-4d7d-b370-bfa7931c1463');
        expect(() => profileActionId('x')).toThrow();
    });
});
