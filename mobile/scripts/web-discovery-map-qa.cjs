// Actual compiled Web, local API/DB and live MapLibre tiles. Synthetic data only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startNativeQa}=require('./native-qa.cjs'),{seedDiscoveryMapQa}=require('./seed-discovery-map-qa.cjs');
const root=path.resolve(__dirname,'../../client/dist'),database=process.env.TEST_DATABASE_URL;
require('../../scripts/assert-test-database.cjs').assertTestDatabase(database);assert.equal(database,process.env.DATABASE_URL);
const evidence=process.env.WEB_QA_ARTIFACT_DIR;assert(evidence?.startsWith('/Volumes/codex_2T/codex_project/Wishlist/QA/'));fs.mkdirSync(evidence,{recursive:false});
const puppeteer=require('/opt/homebrew/lib/node_modules/puppeteer');
let qa,fixture,browser,page;const reads=[],tiles=[],errors=[],reports=[];
(async()=>{try{
 qa=await startNativeQa(database,600,{visualHomeFixture:true});fixture=await seedDiscoveryMapQa(qa,database);
 const origin='https://wishlist-map-qa.invalid';browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--disable-background-networking','--enable-unsafe-swiftshader']});
 page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',async request=>{try{
  const u=new URL(request.url());if(['blob:','data:'].includes(u.protocol)){await request.continue();return;}
  if(u.origin!==origin){if(u.protocol==='https:'&&['tiles.openfreemap.org','openfreemap.org','demotiles.maplibre.org'].includes(u.hostname)){await request.continue();return;}await request.abort();return;}
  if(u.pathname.startsWith('/api/')){
   const headers=request.headers(),upstream=await fetch(qa.apiUrl+u.pathname+u.search,{method:request.method(),headers:{...(headers.authorization?{Authorization:headers.authorization}:{}),...(headers['content-type']?{'Content-Type':headers['content-type']}:{})},body:request.postData(),redirect:'error',signal:AbortSignal.timeout(15000)});
   const bytes=Buffer.from(await upstream.arrayBuffer()),type=upstream.headers.get('content-type')||'application/json';
   // Model a same-origin HTTPS reverse proxy; rebase only this owned local
   // fixture's absolute image origin. No API data or status is stubbed.
   reads.push({method:request.method(),path:u.pathname,query:u.search,status:upstream.status});
   await request.respond({status:upstream.status,contentType:type,headers:{'Cache-Control':upstream.headers.get('cache-control')||'no-store',...(upstream.headers.get('retry-after')?{'Retry-After':upstream.headers.get('retry-after')}:{})},body:type.includes('json')?bytes.toString().replaceAll(qa.apiUrl,origin):bytes});return;
  }
  const candidate=path.resolve(root,'.'+u.pathname),file=candidate.startsWith(root+path.sep)&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(root,'index.html');
  await request.respond({status:200,contentType:({'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'})[path.extname(file)]||'text/html',body:fs.readFileSync(file)});
 }catch{try{await request.abort();}catch{}}});
 page.on('response',r=>{if(new URL(r.url()).hostname==='tiles.openfreemap.org')tiles.push({path:new URL(r.url()).pathname,status:r.status()});});
 await page.evaluateOnNewDocument(host=>{if(window===window.top&&location.origin===host)localStorage.setItem('user-locale','zh-TW');},origin);
 await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.waitForSelector('#identifier');await page.type('#identifier',qa.actors.buyer.email);await page.type('#password',qa.actors.buyer.password);await page.click('button[type="submit"]');await page.waitForFunction(()=>location.pathname==='/dashboard');
 async function click(selector){await page.$eval(selector,e=>e.scrollIntoView({block:'center'}));await page.click(selector);}
 const discoveryReads=()=>reads.filter(r=>r.path==='/api/discovery').length;
 const capture=async name=>page.screenshot({path:path.join(evidence,name+'.png')});
 for(const scenario of [{width:1440,font:1,dark:false,reduced:false},{width:390,font:1,dark:false,reduced:false},{width:320,font:1.5,dark:true,reduced:true}]){
  await page.setViewport({width:scenario.width,height:900});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:scenario.reduced?'reduce':'no-preference'},{name:'prefers-color-scheme',value:scenario.dark?'dark':'light'}]);
  await page.goto(origin+'/explore?mode=map&q='+encodeURIComponent('地圖驗收'),{waitUntil:'domcontentloaded'});await page.waitForSelector('.discovery-map-thumbnail');await page.waitForFunction(()=>document.querySelectorAll('.discovery-map-thumbnail').length===36);
  if(scenario.font!==1)await page.evaluate(font=>document.documentElement.style.fontSize=(font*16)+'px',scenario.font);
  await page.$eval('.discovery-map-frame',e=>e.scrollIntoView({block:'center'}));
  // Map readiness must come from the real renderer and live style/tiles.
  await page.waitForFunction(()=>document.querySelector('.discovery-map-controls button')?.disabled===false,{timeout:45000});
  await new Promise(r=>setTimeout(r,1000));
  assert.equal(await page.$$eval('.discovery-map-thumbnail',es=>new Set(es.map(e=>e.dataset.productKey)).size),36);
  const before=discoveryReads();
  for(const title of fixture.titles){const selector='.discovery-map-thumbnail[aria-label='+JSON.stringify('選取商品：'+title)+']';await click(selector);assert.equal(await page.$eval(selector,e=>e.getAttribute('aria-pressed')),'true');const box=await page.$eval(selector,e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));assert(box.w>=48&&box.h>=48);}
  assert.equal(discoveryReads(),before,'Selection and canvas scrolling must not search');
  assert(await page.$('.discovery-map-leader'),'Original-coordinate connection must be visible');
  await page.$eval('.discovery-map-frame',e=>e.scrollIntoView({block:'center'}));await capture('map-'+scenario.width+'-'+scenario.font+'-selected');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
  await click('.discovery-map-preview .product-wish-heart:not(:disabled)');await page.waitForSelector('.discovery-map-preview .product-wish-heart[aria-pressed="true"]');
  await capture('map-'+scenario.width+'-wish-saved');await click('.discovery-map-preview .product-wish-heart');await page.waitForSelector('.discovery-map-preview .product-wish-heart[aria-pressed="false"]:not(:disabled)');
  await click('.discovery-map-link');await page.waitForSelector('[data-testid="discovery-products"] article');assert.equal(new URL(page.url()).searchParams.get('q'),'地圖驗收');
  await click('.discovery-map-link');await page.waitForSelector('.discovery-map-thumbnail.selected');assert.equal(await page.$eval('.discovery-map-thumbnail.selected',e=>e.getAttribute('aria-label')),'選取商品：'+fixture.wishProductTitle);
  await click('.discovery-map-thumbnail[aria-label='+JSON.stringify('選取商品：'+fixture.retailProductTitle)+']');await click('.discovery-map-preview .discovery-retail-trigger');await page.waitForSelector('[data-testid="retail-price-evidence"]');
  assert((await page.$eval('[data-testid="retail-price-evidence"]',e=>e.textContent)).includes('4,990'));assert.equal(await page.$eval('[data-testid="retail-price-evidence"] a',e=>new URL(e.href).hostname),'images.samsung.com');await capture('map-'+scenario.width+'-price-source');await click('[aria-label="關閉原價參考"]');
  reports.push({...scenario,selectors:36,allActualClicks:true,selectionSurvivesModeSwitch:true,priceModal:true,extraSearchFromSelection:0});
 }
 assert(tiles.some(t=>t.status===200),'Live map source must load');assert.deepEqual(errors,[]);assert.equal(await page.$('[aria-label="喜歡操作待核對"]'),null,'No unresolved like journal from the HTTPS test origin');
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,syntheticOnly:true,httpsReverseProxy:true,rebasedOwnedFixtureImageOrigin:true,fixtureKind:fixture.fixtureKind,photoCases:fixture.photoCases,productionWrites:0,reports,tiles,errors},null,2));console.log(JSON.stringify({passed:true,evidence,reports}));
 }catch(e){if(page&&!page.isClosed()&&!/login/.test(page.url()))await page.screenshot({path:path.join(evidence,'failed.png')}).catch(()=>{});fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({message:e.message,errors,tiles,reads},null,2));throw e;}
 finally{if(browser)await browser.close();if(fixture)await fixture.cleanup();if(qa)fs.writeFileSync(path.join(evidence,'cleanup.json'),JSON.stringify(await qa.stop(),null,2));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
