// Seed one seller-owned marketplace item through the real isolated HTTP API.
// Synthetic credentials and the resulting bearer token stay in this process;
// callers receive public fixture labels only, never authentication material.
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MARKETPLACE_FIXTURE = Object.freeze({
  title: 'Native QA Switch OLED',
  description: '合成原生驗收商品，僅存在隔離測試資料庫',
  brand: 'Nintendo',
  price: 7500,
  county: '台北市',
  district: '中山區',
  cardLabel: 'Native QA Switch OLED，NT$ 7,500，台北市中山區',
  buyerMessage: 'NativeQAChatSmoke',
  meetupPlace: 'TaipeiStationQA',
});
const VISUAL_MARKETPLACE_FIXTURE = Object.freeze({
  title: '深藍色陶瓷馬克杯',
  description: '深藍色陶瓷馬克杯。外觀有明顯使用痕跡，杯身表面有細紋與刮傷，功能正常，適合日常使用。',
  category: 'home', brand: '無品牌', price: 50, county: '新北市', district: '板橋區',
  latitude: 25.012349, longitude: 121.462456,
  cardLabel: '深藍色陶瓷馬克杯，NT$ 50，新北市板橋區',
  photo: path.join(__dirname, '..', 'qa-fixtures', 'synthetic-used-blue-mug.png'),
});
const CHAT_VISUAL_MESSAGES = Object.freeze([
  Object.freeze({ role: 'seller', text: '您好，這台目前還在。' }),
  Object.freeze({ role: 'buyer', text: '請問配件都齊全嗎？' }),
  Object.freeze({ role: 'seller', text: '原廠配件都在，功能正常。' }),
  Object.freeze({ role: 'buyer', text: '週末可以在台北面交嗎？' }),
  Object.freeze({ role: 'seller', text: '週日下午可以，請先提出預約。' }),
]);

function boundedJson(text) {
  if (typeof text !== 'string' || text.length < 2 || text.length > 256000) throw new Error('Unexpected isolated fixture response');
  return JSON.parse(text);
}

async function seedNativeMarketplace(qa, ownerRole = 'seller', preset = 'switch', { seedChatForVisualQa = false } = {}) {
  const base = new URL(qa?.apiUrl || '');
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.pathname !== '/') throw new Error('Marketplace fixture requires isolated loopback API');
  if (!['seller', 'buyer'].includes(ownerRole)) throw new Error('Marketplace fixture owner unavailable');
  if (!['switch', 'visual-mug'].includes(preset)) throw new Error('Marketplace fixture preset unavailable');
  if (typeof seedChatForVisualQa !== 'boolean' || (seedChatForVisualQa && (ownerRole !== 'seller' || preset !== 'switch')))
    throw new Error('Visual chat fixture requires the isolated seller-owned switch listing');
  const fixture = preset === 'visual-mug' ? VISUAL_MARKETPLACE_FIXTURE : MARKETPLACE_FIXTURE;
  const owner = qa?.actors?.[ownerRole];
  if (!Number.isSafeInteger(owner?.id) || typeof owner?.email !== 'string' || typeof owner?.password !== 'string') throw new Error('Marketplace fixture owner unavailable');
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
  const login = await request('/auth/login', 200, 'POST', { phoneNumber: owner.email, password: owner.password });
  if (login?.user?.id !== owner.id || typeof login?.token !== 'string' || login.token.length < 20) throw new Error('Marketplace fixture login invalid');
  token = login.token;
  const sellerToken = seedChatForVisualQa ? token : null;
  const sharp = require('../../server/node_modules/sharp');
  const png = preset === 'visual-mug' ? fs.readFileSync(fixture.photo) :
    await sharp({ create: { width: 320, height: 240, channels: 3, background: '#2C6658' } }).png().toBuffer();
  if (preset === 'visual-mug') {
    const image = await sharp(png).metadata();
    if (image.format !== 'png' || image.width !== 1086 || image.height !== 1448 || png.length > 3_000_000)
      throw new Error('Visual fixture image changed');
  }
  const form = new FormData();
  form.append('clientUploadId', randomUUID());
  form.append('image', new Blob([png], { type: 'image/png' }), 'native-qa-marketplace.png');
  const photo = await request('/listing-media', 201, 'POST', form);
  if (!/^[0-9a-f-]{36}$/.test(photo?.id || '')) throw new Error('Marketplace fixture media invalid');
  const listing = await request('/listings', 201, 'POST', {
    clientListingId: randomUUID(), title: fixture.title, description: fixture.description,
    category: fixture.category ?? 'electronics', brand: fixture.brand, condition: 'USED', price: fixture.price,
    deliveryMethods: ['MEETUP'], location: { county: fixture.county, district: fixture.district,
      latitude: fixture.latitude ?? 25.052349, longitude: fixture.longitude ?? 121.523456 },
    mediaIds: [photo.id], publish: true, consentToMap: true,
  });
  if (!/^[0-9a-f-]{36}$/.test(listing?.id || '') || listing.title !== fixture.title ||
      listing.owner?.id !== owner.id || listing.expiryMode !== 'DEFAULT_30_DAYS' ||
      new Date(listing.expiresAt) - new Date(listing.publishedAt) !== 30 * 86400000) throw new Error('Marketplace fixture listing invalid');
  if (seedChatForVisualQa) {
    const buyer = qa?.actors?.buyer;
    if (!Number.isSafeInteger(buyer?.id) || typeof buyer.email !== 'string' || typeof buyer.password !== 'string')
      throw new Error('Visual chat buyer unavailable');
    token = undefined;
    const buyerLogin = await request('/auth/login', 200, 'POST', { phoneNumber: buyer.email, password: buyer.password });
    if (buyerLogin?.user?.id !== buyer.id || typeof buyerLogin?.token !== 'string' || buyerLogin.token.length < 20)
      throw new Error('Visual chat buyer login invalid');
    const buyerToken = buyerLogin.token;
    token = buyerToken;
    const room = await request('/chat/conversations', 201, 'POST', { listingId: listing.id });
    if (!/^[0-9a-f-]{36}$/.test(room?.id || '') || room.buyerUserId !== buyer.id || room.sellerUserId !== owner.id)
      throw new Error('Visual chat room invalid');
    for (const [index, message] of CHAT_VISUAL_MESSAGES.entries()) {
      token = message.role === 'seller' ? sellerToken : buyerToken;
      const sent = await request('/chat/conversations/' + room.id + '/messages', 201, 'POST',
        { clientMessageId: randomUUID(), text: message.text });
      if (sent?.conversationId !== room.id || sent.senderUserId !== (message.role === 'seller' ? owner.id : buyer.id) ||
          sent.sequence !== index + 1 || sent.text !== message.text) throw new Error('Visual chat message invalid');
    }
    token = buyerToken;
    const page = await request('/chat/conversations/' + room.id + '/messages?limit=10', 200);
    if (!Array.isArray(page?.items) || page.items.length !== CHAT_VISUAL_MESSAGES.length ||
        page.items.some((message, index) => message.sequence !== index + 1 || message.text !== CHAT_VISUAL_MESSAGES[index].text))
      throw new Error('Visual chat history invalid');
  }
  token = undefined;
  return { listingId: listing.id, title: fixture.title, cardLabel: fixture.cardLabel, preset, chatSeeded: seedChatForVisualQa };
}

module.exports = { MARKETPLACE_FIXTURE, VISUAL_MARKETPLACE_FIXTURE, CHAT_VISUAL_MESSAGES, seedNativeMarketplace };
