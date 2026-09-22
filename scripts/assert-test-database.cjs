function assertTestDatabase(value) {
  if (!value) throw new Error('Explicit TEST_DATABASE_URL is required');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid test database configuration; details withheld'); }
  if (url.search || url.hash || !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/wishlist_marketplace_test_[a-z0-9_]+$/.test(url.pathname)) {
    throw new Error('Refusing non-local or non-isolated database before migrations');
  }
}
module.exports = { assertTestDatabase };
if (require.main === module) {
  try { assertTestDatabase(process.env.TEST_DATABASE_URL); console.log('Isolated local test database configuration verified'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
