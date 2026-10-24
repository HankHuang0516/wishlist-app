const {foregroundPackage}=require('../../../mobile/scripts/android-foreground.cjs');
describe('native Android QA foreground ownership',()=>{
  test.each([
    ['mResumedActivity: ActivityRecord{bc19 u0 com.example.fixture/.MainActivity t9}', 'com.example.fixture'],
    ['topResumedActivity=ActivityRecord{bc19 u0 com.example.fixture/com.example.fixture.MainActivity t9}', 'com.example.fixture'],
    ['Hist #0: ActivityRecord{bc19 u0 com.example.fixture/.MainActivity t9}', null],
    ['mResumedActivity: ActivityRecord{bc19 u0 com.example.other/.MainActivity t9}', 'com.example.other'],
    ['topResumedActivity=ActivityRecord{a u0 com.example.fixture/.MainActivity t9}\nmResumedActivity: ActivityRecord{b u0 com.example.other/.MainActivity t10}', null],
    ['',null],
  ])('only admits a uniquely resumed package', (raw,expected)=>expect(foregroundPackage(raw)).toBe(expected));
});
