// Real HTTP-only synthetic fixture for the approved-home-candidate review.
// Its database, actor credentials and media are owned by startNativeQa().
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const fixturePath = path.join(__dirname, '..', 'qa-fixtures', 'uiux-home-multiple-blue-mug-v2.json');
const photoPath = path.join(__dirname, '..', 'qa-fixtures', 'synthetic-used-blue-mug.png');
const expectedFixtureHash = 'b9f963f374e003bbc6037be02680aca476be24fd84f3109001cf8fd163c154f4';
const expectedPhotoHash = '4bf0d16e92bff216bdf0521ba878886b0a31c734d43ee9363dbc69dda6aa06f9';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function seedUiuxHomeQa(qa) {
  const base = new URL(qa?.apiUrl || '');
  if (base.href !== 'http://127.0.0.1:18889/' ||
      !['buyer', 'seller', 'seller2', 'seller3'].every(role =>
        Number.isSafeInteger(qa?.actors?.[role]?.id) && typeof qa.actors[role].password === 'string'))
    throw new Error('Expected the fixed-port isolated visual QA service with four synthetic actors');
  const fixtureBytes = fs.readFileSync(fixturePath), photoBytes = fs.readFileSync(photoPath);
  if (sha256(fixtureBytes) !== expectedFixtureHash || sha256(photoBytes) !== expectedPhotoHash)
    throw new Error('Visual QA fixture changed; re-review the candidate before seeding');
  const fixture = JSON.parse(fixtureBytes.toString('utf8'));
  if (fixture.fixtureId !== 'uiux-home-multiple-blue-mug-v2' || fixture.homeMatchGroups?.length !== 1 ||
      fixture.homeMatchGroups[0].listings?.length !== 3) throw new Error('Unexpected visual QA fixture shape');
  const actors = { 'synthetic-seller-1': qa.actors.seller, 'synthetic-seller-2': qa.actors.seller2,
    'synthetic-seller-3': qa.actors.seller3 };
  async function request(route, status, token, method = 'GET', body) {
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(qa.apiUrl + '/api' + route, {
      method, headers, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== status || response.headers.get('cache-control') !== 'private, no-store')
      throw new Error('Visual QA real API request rejected at ' + route + ' (HTTP ' + response.status + ')');
    const text = await response.text();
    if (text.length < 2 || text.length > 256_000) throw new Error('Visual QA API response size invalid');
    return JSON.parse(text);
  }
  async function login(actor) {
    const result = await request('/auth/login', 200, null, 'POST',
      { phoneNumber: actor.email, password: actor.password });
    if (result?.user?.id !== actor.id || typeof result.token !== 'string' || result.token.length < 20)
      throw new Error('Synthetic visual QA login failed');
    return result.token;
  }
  const listingIds = [], scores = [];
  for (const item of fixture.homeMatchGroups[0].listings) {
    const seller = actors[item.sellerKey];
    if (!seller || item.photo !== 'synthetic-used-blue-mug.png') throw new Error('Unexpected visual QA seller or photo');
    const token = await login(seller);
    const form = new FormData();
    form.append('clientUploadId', randomUUID());
    form.append('image', new Blob([photoBytes], { type: 'image/png' }), 'synthetic-used-blue-mug.png');
    const media = await request('/listing-media', 201, token, 'POST', form);
    if (!/^[0-9a-f-]{36}$/.test(media?.id || '')) throw new Error('Visual QA photo missing');
    const location = item.district === '板橋區' ? [25.012349, 121.462456] :
      item.district === '中山區' ? [25.052349, 121.523456] : [25.009349, 121.513456];
    const listing = await request('/listings', 201, token, 'POST', {
      clientListingId: randomUUID(), title: item.title,
      description: '合成二手深藍色陶瓷馬克杯；僅用於 Wishlist.ai 隔離視覺驗收，不是真實販售。',
      category: 'home', brand: '無品牌', condition: 'USED', price: item.priceTwd,
      deliveryMethods: ['MEETUP'], location: { county: item.county, district: item.district,
        latitude: location[0], longitude: location[1] }, mediaIds: [media.id], publish: true, consentToMap: true,
    });
    if (!/^[0-9a-f-]{36}$/.test(listing?.id || '') || listing.title !== item.title ||
        listing.owner?.id !== seller.id || Number(listing.price) !== item.priceTwd ||
        listing.status !== 'ACTIVE') throw new Error('Visual QA listing did not publish as expected');
    listingIds.push(listing.id);
  }
  const buyerToken = await login(qa.actors.buyer);
  const list = await request('/native-wishes/lists', 201, buyerToken, 'POST', {
    clientRequestId: randomUUID(), title: fixture.wishes[0].listTitle, isPublic: false,
  });
  if (!Number.isSafeInteger(list?.resource?.id)) throw new Error('Visual QA wish list missing');
  // Home defaults to the newest wish; insert orange first, blue second.
  for (const wish of [fixture.wishes[1], fixture.wishes[0]]) {
    const made = await request('/native-wishes/lists/' + list.resource.id + '/items', 201, buyerToken, 'POST', {
      clientRequestId: randomUUID(), name: wish.name, maxPrice: 60, priceCurrency: 'TWD',
    });
    if (!Number.isSafeInteger(made?.resource?.id) || made.resource.name !== wish.name)
      throw new Error('Visual QA wish missing');
    if (wish.key === fixture.selectedWishKey) {
      const matched = await request('/listings/matches?wishItemId=' + made.resource.id +
        '&bbox=117,20,123.8,26.6&limit=100', 200, buyerToken);
      if (!Array.isArray(matched?.items) || matched.items.length !== 3 ||
          new Set(matched.items.map(row => row.listing?.id)).size !== 3 ||
          matched.items.some((row, index) => row.listing?.id !== listingIds[index] ||
            row.listing?.title !== fixture.homeMatchGroups[0].listings[index].title ||
            Number(row.listing?.price) !== fixture.homeMatchGroups[0].listings[index].priceTwd ||
            row.score !== fixture.homeMatchGroups[0].listings[index].score))
        throw new Error('Visual QA home fixture does not yield three real matches: ' +
          JSON.stringify({ count: matched?.items?.length, titles: matched?.items?.map(row => row.listing?.title),
            scores: matched?.items?.map(row => row.score) }));
      scores.push(...matched.items.map(row => ({ listingId: row.listing.id, score: row.score })));
    }
  }
  const homeWishes = await request('/listings/match-wishes?limit=100', 200, buyerToken);
  if (!Array.isArray(homeWishes?.items) || homeWishes.items.length !== 2 ||
      homeWishes.items[0].name !== fixture.wishes[0].name ||
      homeWishes.items[1].name !== fixture.wishes[1].name)
    throw new Error('Visual QA home wish ordering differs from the candidate');
  return { listingIds, scores, wishListId: list.resource.id, photoSha256: expectedPhotoHash };
}

module.exports = { seedUiuxHomeQa };
