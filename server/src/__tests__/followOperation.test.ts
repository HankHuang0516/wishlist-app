import { followUserId,followActionId,followInput,followHash } from '../lib/followOperation';
describe('strict follow operation identity and canonical digest',()=>{
    it.each(['1abc','0','01','-1','1.1','2147483648',{},true,null])('rejects malformed ID %p',id=>expect(()=>followUserId(id)).toThrow());
    it('validates exact body, self exclusion and immutable version',()=>{
        const body={targetUserId:2,wanted:true,expectedVersion:0};expect(followInput(body,1)).toEqual(body);
        for(const invalid of [{...body,targetUserId:'2'},{...body,targetUserId:1},{...body,wanted:'true'},{...body,expectedVersion:2147483647},{...body,other:true}])expect(()=>followInput(invalid,1)).toThrow();
        expect(followHash(body)).toMatch(/^[a-f0-9]{64}$/);expect(followHash(body)).not.toBe(followHash({...body,wanted:false}));
        expect(followActionId('11111111-1111-4111-8111-111111111111')).toBe('11111111-1111-4111-8111-111111111111');expect(()=>followActionId('bad')).toThrow();
    });
});
