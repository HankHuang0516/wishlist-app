// Seed one seller-owned marketplace item through the real isolated HTTP API.
// Synthetic credentials and the resulting bearer token stay in this process;
// callers receive public fixture labels only, never authentication material.
const { randomUUID } = require('node:crypto');

const MARKETPLACE_FIXTURE = Object.freeze({
  title: 'Native QA Switch OLED',
  description: '合成原生驗收商品，僅存在隔離測試資料庫',
  brand: 'Nintendo',
  price: 7500,
  county: '台北市',
  district: '中山區',
  cardLabel: 'Native QA Switch OLED，NT$ 7,500，台北市中山區',
  buyerMessage: 'Native QA 買家詢問面交',
  meetupPlace: '台北車站大廳 QA 集合點',
});

function boundedJson(text) {
  if (typeof text !== 'string' || text.length < 2 || text.length > 256000) throw new Error('Unexpected isolated fixture response');
  return JSON.parse(text);
}

async function seedNativeMarketplace(qa) {
  const base = new URL(qa?.apiUrl || '');
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.pathname !== '/') throw new Error('Marketplace fixture requires isolated loopback API');
  const seller = qa?.actors?.seller;
  if (!Number.isSafeInteger(seller?.id) || typeof seller?.email !== 'string' || typeof seller?.password !== 'string') throw new Error('Marketplace fixture seller unavailable');
  let token;
  const request = async (route, status, method = 'GET', body) => {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(qa.apiUrl + '/api' + route, {
      method, headers, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (response.status !== status || response.headers.get('cache-control') !== 'private, no-store') throw new Error('Marketplace fixture request rejected');
    return boundedJson(await response.text());
  };
  const login = await request('/auth/login', 200, 'POST', { phoneNumber: seller.email, password: seller.password });
  if (login?.user?.id !== seller.id || typeof login?.token !== 'string' || login.token.length < 20) throw new Error('Marketplace fixture login invalid');
  token = login.token;
  const sharp = require('../../server/node_modules/sharp');
  const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#2C6658' } }).png().toBuffer();
  const form = new FormData();
  form.append('clientUploadId', randomUUID());
  form.append('image', new Blob([png], { type: 'image/png' }), 'native-qa-marketplace.png');
  const photo = await request('/listing-media', 201, 'POST', form);
  if (!/^[0-9a-f-]{36}$/.test(photo?.id || '')) throw new Error('Marketplace fixture media invalid');
  const listing = await request('/listings', 201, 'POST', {
    clientListingId: randomUUID(), title: MARKETPLACE_FIXTURE.title, description: MARKETPLACE_FIXTURE.description,
    category: 'electronics', brand: MARKETPLACE_FIXTURE.brand, condition: 'USED', price: MARKETPLACE_FIXTURE.price,
    deliveryMethods: ['MEETUP'], location: { county: MARKETPLACE_FIXTURE.county, district: MARKETPLACE_FIXTURE.district, latitude: 25.052349, longitude: 121.523456 },
    mediaIds: [photo.id], publish: true, consentToMap: true,
  });
  if (!/^[0-9a-f-]{36}$/.test(listing?.id || '') || listing.title !== MARKETPLACE_FIXTURE.title ||
      listing.owner?.id !== seller.id || listing.expiryMode !== 'DEFAULT_30_DAYS' ||
      new Date(listing.expiresAt) - new Date(listing.publishedAt) !== 30 * 86400000) throw new Error('Marketplace fixture listing invalid');
  token = undefined;
  return { listingId: listing.id, title: MARKETPLACE_FIXTURE.title, cardLabel: MARKETPLACE_FIXTURE.cardLabel };
}

module.exports = { MARKETPLACE_FIXTURE, seedNativeMarketplace };
