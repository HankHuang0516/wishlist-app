import { describe, expect, it } from 'vitest';

const { nativeQaFailureCode } = require('../../scripts/native-qa-failure.cjs');

describe('sanitized native QA failure receipts', () => {
  it('preserves only a known fixture stage', () => {
    expect(nativeQaFailureCode(new Error('QA failed at schema-preflight; values withheld')))
      .toBe('QA_FIXTURE_SCHEMA_PREFLIGHT');
    expect(nativeQaFailureCode(new Error('QA failed at synthetic-seed; unexpected environment names: API_KEY2; values withheld')))
      .toBe('QA_FIXTURE_SYNTHETIC_SEED');
  });
  it('maps bounded lifecycle errors without revealing raw text', () => {
    expect(nativeQaFailureCode(new Error('QA startup timed out; details withheld')))
      .toBe('QA_FIXTURE_STARTUP_TIMEOUT');
    expect(nativeQaFailureCode(new Error('QA process unavailable; details withheld')))
      .toBe('QA_FIXTURE_PROCESS_UNAVAILABLE');
  });
  it('rejects unrecognized stages and any secret-bearing exception', () => {
    expect(nativeQaFailureCode(new Error('QA failed at private-key; values withheld')))
      .toBe('QA_ASSERTION_FAILED');
    expect(nativeQaFailureCode(new Error('database key=example-secret')))
      .toBe('QA_ASSERTION_FAILED');
    expect(nativeQaFailureCode(new Error('QA_SECRET_EXAMPLE')))
      .toBe('QA_ASSERTION_FAILED');
    expect(nativeQaFailureCode({ message: 'QA failed at schema-preflight; values withheld' }))
      .toBe('QA_ASSERTION_FAILED');
  });
  it('keeps only known smoke assertions and bounded HTTP statuses', () => {
    expect(nativeQaFailureCode(new Error('QA_NATIVE_PRICE_MISSING'))).toBe('QA_NATIVE_PRICE_MISSING');
    expect(nativeQaFailureCode(new Error('QA_HTTP_503'))).toBe('QA_HTTP_503');
    expect(nativeQaFailureCode(new Error('QA_AI_CLAIM_409'))).toBe('QA_AI_CLAIM_409');
    expect(nativeQaFailureCode(new Error('QA_HTTP_SECRET'))).toBe('QA_ASSERTION_FAILED');
  });
});
