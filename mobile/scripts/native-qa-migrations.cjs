// Fail closed before UI testing when an isolated QA database is behind source.
function assertNativeQaMigrations(expected, applied) {
  const names = values => Array.isArray(values) && values.every(value => typeof value === 'string' && /^\d{14}_[a-z0-9_]+$/.test(value));
  if (!names(expected) || !names(applied) || expected.length === 0 || new Set(expected).size !== expected.length ||
      new Set(applied).size !== applied.length || expected.length !== applied.length ||
      expected.some(name => !applied.includes(name))) throw new Error('NATIVE_QA_SCHEMA_MISMATCH');
}

module.exports = { assertNativeQaMigrations };
