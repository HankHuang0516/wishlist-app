// Actual compiled Web, local API/DB and live MapLibre tiles. Synthetic data only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startNativeQa}=require('./native-qa.cjs'),{seedDiscoveryMapQa}=require('./seed-discovery-map-qa.cjs');
const root=path.resolve(__dirname,'../../client/dist'),database=process.env.TEST_DATABASE_URL;
require('../../scripts/assert-test-database.cjs').assertTestDatabase(database);assert.equal(database,process.env.DATABASE_URL);
const evidence=process.env.WEB_QA_ARTIFACT_DIR;assert(evidence?.startsWith('/Volumes/codex_2T/codex_project/Wishlist/QA/'));fs.mkdirSync(evidence,{recursive:false});
const puppeteer=require('/opt/homebrew/lib/node_modules/puppeteer');
let qa,fixture,browser,page,stage='startup';const reads=[],tiles=[],errors=[],reports=[],providerTransfers=[],apiFailures=[],network=[],pending=new Map();
(async()=>{try{
 qa=await startNativeQa(database,600,{visualHomeFixture:true});fixture=await seedDiscoveryMapQa(qa,database);
 const origin='https://wishlist-map-qa.invalid';browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run','--disable-background-networking','--enable-unsafe-swiftshader','--disable-http2']});
 page=await browser.newPage();page.on('request',r=>{if(r.url().startsWith('https://tiles.openfreemap.org/'))pending.set(r,{url:r.url(),started:Date.now()});});page.on('requestfinished',r=>pending.delete(r));page.on('requestfailed',r=>{network.push({url:r.url(),failure:r.failure()});pending.delete(r);});page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',async request=>{try{
  const u=new URL(request.url());if(['blob:','data:'].includes(u.protocol)){await request.continue();return;}
  if(u.origin!==origin){
   if(u.protocol==='https:'&&u.hostname==='tiles.openfreemap.org'&&request.method()==='GET'){
    // QA transport diagnostic: forward live provider bytes without replacing
    // style, tiles, glyphs or sprites. Preserve direct-browser failures separately.
    const upstream=await fetch(u.href,{redirect:'error',signal:AbortSignal.timeout(20000)}),bytes=Buffer.from(await upstream.arrayBuffer());
    providerTransfers.push({path:u.pathname,status:upstream.status,bytes:bytes.length,sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex')});
    await request.respond({status:upstream.status,contentType:upstream.headers.get('content-type')||'application/octet-stream',headers:{'Access-Control-Allow-Origin':'*'},body:bytes});return;
   }
   await request.abort();return;
  }
  if(u.pathname.startsWith('/api/')){
   const headers=request.headers(),upstream=await fetch(qa.apiUrl+u.pathname+u.search,{method:request.method(),headers:{...(headers.authorization?{Authorization:headers.authorization}:{}),...(headers['content-type']?{'Content-Type':headers['content-type']}:{})},body:request.postData(),redirect:'error',signal:AbortSignal.timeout(15000)});
   const bytes=Buffer.from(await upstream.arrayBuffer()),type=upstream.headers.get('content-type')||'application/json';
   // Model a same-origin HTTPS reverse proxy; rebase only this owned local
   // fixture's absolute image origin. No API data or status is stubbed.
   reads.push({method:request.method(),path:u.pathname,query:u.search,status:upstream.status});if(upstream.status>=400)apiFailures.push({path:u.pathname,status:upstream.status,elapsed:Date.now(),responseKeys:type.includes('json')?Object.keys(JSON.parse(bytes.toString())).sort():[],errorCode:type.includes('json')&&/^[A-Z_]+$/.test(JSON.parse(bytes.toString()).errorCode||'')?JSON.parse(bytes.toString()).errorCode:null});
   await request.respond({status:upstream.status,contentType:type,headers:{'Cache-Control':upstream.headers.get('cache-control')||'no-store',...(upstream.headers.get('retry-after')?{'Retry-After':upstream.headers.get('retry-after')}:{})},body:type.includes('json')?bytes.toString().replaceAll(qa.apiUrl,origin):bytes});return;
  }
  const candidate=path.resolve(root,'.'+u.pathname),file=candidate.startsWith(root+path.sep)&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(root,'index.html');
  await request.respond({status:200,contentType:({'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'})[path.extname(file)]||'text/html',body:fs.readFileSync(file)});
 }catch{try{await request.abort();}catch{}}});
 page.on('response',r=>{if(new URL(r.url()).hostname==='tiles.openfreemap.org')tiles.push({path:new URL(r.url()).pathname,status:r.status()});});
 await page.evaluateOnNewDocument(host=>{if(window===window.top&&location.origin===host&&!localStorage.getItem('user-locale'))localStorage.setItem('user-locale','zh-TW');},origin);
 await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});await page.waitForSelector('#identifier');await page.type('#identifier',qa.actors.buyer.email);await page.type('#password',qa.actors.buyer.password);await page.click('button[type="submit"]');await page.waitForFunction(()=>location.pathname==='/dashboard');
 async function click(selector){
  await page.$eval(selector,e=>e.scrollIntoView({block:'center',behavior:'instant'}));
  // Same boundary as the established real-browser pointer regression: wait
  // for a stable, reachable target, then issue exactly one genuine click.
  await page.evaluate(selector=>new Promise((resolve,reject)=>{let previous='',stable=0;const deadline=performance.now()+5000;const frame=()=>{const e=document.querySelector(selector);if(!e){reject(Error('Map control disappeared before input'));return;}const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2),bounds=JSON.stringify([r.x,r.y,r.width,r.height]);stable=hit&&e.contains(hit)&&bounds===previous?stable+1:0;previous=bounds;if(stable>=3){resolve();return;}if(performance.now()>=deadline){reject(Error('Map pointer target did not settle'));return;}requestAnimationFrame(frame);};requestAnimationFrame(frame);}),selector);
  await page.click(selector);
 }
 const discoveryReads=()=>reads.filter(r=>r.path==='/api/discovery').length;
 const capture=async name=>page.screenshot({path:path.join(evidence,name+'.png')});
 const byText=async(text)=>{for(const b of await page.$$('button')){if((await b.evaluate(e=>e.textContent)).trim()===text){await b.evaluate(e=>e.scrollIntoView({block:'center'}));await b.click();return;}}throw Error('Missing control '+text);};
 for(const scenario of [{width:1440,font:1,dark:false,reduced:false},{width:390,font:1,dark:false,reduced:false},{width:320,font:1.5,dark:true,reduced:true},{width:390,font:1,dark:false,reduced:true,locale:'en-US'}]){
  stage='scenario-entry-'+scenario.width+'-'+(scenario.locale||'zh-TW');const locale=scenario.locale||'zh-TW',en=locale==='en-US',prefix=en?'Select item: ':'選取商品：',close=en?'Collapse products':'收合商品';
  await page.evaluate(value=>localStorage.setItem('user-locale',value),locale);
  await page.setViewport({width:scenario.width,height:900});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:scenario.reduced?'reduce':'no-preference'},{name:'prefers-color-scheme',value:scenario.dark?'dark':'light'}]);
  await page.goto(origin+'/explore?mode=map&q='+encodeURIComponent('地圖驗收'),{waitUntil:'domcontentloaded'});try{await page.waitForSelector('.discovery-map-stack',{timeout:45000});}catch{await capture('stacks-'+scenario.width+'-actual-provider-timeout');const reload=await page.$('.discovery-map-error button');assert(reload,'A visible actual map error is required before explicit reload');assert((await reload.evaluate(e=>e.textContent)).includes('重新載入底圖')||(await reload.evaluate(e=>e.textContent)).includes('Reload basemap'));await reload.click();await page.waitForSelector('.discovery-map-stack',{timeout:45000});}
  if(scenario.font!==1)await page.evaluate(font=>document.documentElement.style.fontSize=(font*16)+'px',scenario.font);
  await page.$eval('.discovery-map-frame',e=>e.scrollIntoView({block:'center'}));await new Promise(r=>setTimeout(r,450));
  assert.equal(await page.$$('.discovery-map-thumbnail').then(x=>x.length),0,'No auto-expanded individual product');assert.equal(await page.$('.discovery-map-preview'),null);
  const stackKeys=await page.$$eval('.discovery-map-stack',es=>es.map(e=>e.dataset.stackKey)),count=await page.$$eval('.discovery-map-stack b',es=>es.reduce((sum,e)=>sum+Number(e.textContent),0));assert.equal(count,36);assert(stackKeys.length>0);
  await capture('stacks-'+scenario.width+'-'+locale+'-'+scenario.font+'-collapsed');const before=discoveryReads(),seen=new Set(),stackMembers=new Map();
  async function openStack(key){await click('.discovery-map-stack[data-stack-key='+JSON.stringify(key)+']');await page.waitForSelector('.discovery-map-thumbnail');await page.waitForFunction(()=>[...document.querySelectorAll('.discovery-map-thumbnail')].every(e=>e.getAnimations().length===0),{timeout:6000});}
  for(const key of stackKeys){stage='select-all-stack-'+key;
   await openStack(key);const members=await page.$$eval('.discovery-map-thumbnail',es=>es.map(e=>({key:e.dataset.productKey,title:e.getAttribute('aria-label')})));assert(members.length>0);stackMembers.set(key,members);
   assert.equal(await page.$$('.discovery-map-stack').then(x=>x.length),0,'Only the selected stack is expanded');
   for(const member of members){assert(!seen.has(member.key),'Each loaded member belongs to one stack');seen.add(member.key);const selector='.discovery-map-thumbnail[data-product-key='+JSON.stringify(member.key)+']';await click(selector);assert.equal(await page.$eval(selector,e=>e.getAttribute('aria-pressed')),'true');const size=await page.$eval(selector,e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));assert(size.w>=48&&size.h>=48);}
   await byText(close);await page.waitForSelector('.discovery-map-stack');assert.equal(await page.$('.discovery-map-preview'),null);assert.equal(await page.$$('.discovery-map-thumbnail').then(x=>x.length),0);
  }
  assert.equal(seen.size,36,'All36 individual selectors actually clicked across every stack');assert.equal(discoveryReads(),before,'Stack/selection/collapse never searches');
  // A blank tap collapses; a real canvas drag must not collapse first.
  stage='blank-vs-drag';const first=stackKeys[0];await openStack(first);await page.$eval('.discovery-map-frame',e=>e.scrollIntoView({block:'center'}));
  const host=await page.$('.discovery-map-canvas-scroll'),box=await host.boundingBox();assert(box);await page.mouse.move(box.x+box.width-8,box.y+box.height-24);await page.mouse.down();await page.mouse.move(box.x+box.width-8,box.y+box.height-100,{steps:8});await page.mouse.up();assert(await page.$('.discovery-map-thumbnail'),'Drag keeps the current expansion');
  const blank=await page.$eval('.discovery-map-canvas-scroll',host=>{const r=host.getBoundingClientRect();for(let y=r.bottom-12;y>r.top+12;y-=12)for(let x=r.right-10;x>r.left+10;x-=12){const e=document.elementFromPoint(x,y);if(e&&host.contains(e)&&!e.closest('button,a,input'))return {x,y};}return null;});assert(blank,'Actual hittable blank space required');
  await page.mouse.click(blank.x,blank.y);await page.waitForSelector('.discovery-map-stack');assert.equal(await page.$('.discovery-map-preview'),null);await capture('stacks-'+scenario.width+'-'+locale+'-blank-collapsed');
  // Explicit selection, original-price source and real wish persistence remain reachable.
  stage='real-wish-and-reference';const wishLabel=prefix+fixture.wishProductTitle,retailLabel=prefix+fixture.retailProductTitle;
  const wishKey=[...stackMembers].find(([,ms])=>ms.some(m=>m.title===wishLabel))?.[0],retailKey=[...stackMembers].find(([,ms])=>ms.some(m=>m.title===retailLabel))?.[0];assert(wishKey&&retailKey);
  await openStack(wishKey);await click('.discovery-map-thumbnail[aria-label='+JSON.stringify(wishLabel)+']');await click('.discovery-map-preview .product-wish-heart:not(:disabled)');await page.waitForSelector('.discovery-map-preview .product-wish-heart[aria-pressed="true"]');await click('.discovery-map-preview .product-wish-heart');await page.waitForSelector('.discovery-map-preview .product-wish-heart[aria-pressed="false"]:not(:disabled)');
  await byText(close);await page.waitForSelector('.discovery-map-stack');await openStack(retailKey);await click('.discovery-map-thumbnail[aria-label='+JSON.stringify(retailLabel)+']');await click('.discovery-map-preview .discovery-retail-trigger');await page.waitForSelector('[data-testid="retail-price-evidence"]');assert((await page.$eval('[data-testid="retail-price-evidence"]',e=>e.textContent)).includes('4,990'));assert.equal(await page.$eval('[data-testid="retail-price-evidence"] a',e=>new URL(e.href).hostname),'images.samsung.com');await click('[aria-label='+JSON.stringify(en?'Close price reference':'關閉原價參考')+']');
  await page.$eval('.discovery-map-frame',e=>e.scrollIntoView({block:'center'}));await capture('stacks-'+scenario.width+'-'+locale+'-'+scenario.font+'-expanded');
  if(!scenario.reduced){await page.keyboard.press('Escape');await page.waitForSelector('.discovery-map-stack');await new Promise(r=>setTimeout(r,100));assert.equal(await page.$eval('.discovery-map-stack:focus',e=>e.dataset.stackKey),retailKey);}
  stage='list-map-reentry';await click('.discovery-map-link');await page.waitForSelector('[data-testid="discovery-products"] article');assert.equal(new URL(page.url()).searchParams.get('q'),'地圖驗收');await click('.discovery-map-link');await page.waitForSelector('.discovery-map-stack');assert.equal(await page.$('.discovery-map-thumbnail'),null,'Returning to map starts collapsed even with a previous selection');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
  reports.push({...scenario,locale,stackCount:stackKeys.length,memberCount:count,actualIndividualClicks:seen.size,defaultCollapsed:true,onlyChosenStackExpands:true,dragPreserves:true,blankCollapse:true,explicitCollapse:true,realWishAddRemove:true,referenceSource:true,returnToMapCollapsed:true,extraSearchFromStackInteraction:0});
 }
 assert(tiles.some(t=>t.status===200),'Live map source must load');assert.deepEqual(errors,[]);assert.equal(await page.$('[aria-label="喜歡操作待核對"],[aria-label="Like operation needs checking"]'),null,'No unresolved like journal from the HTTPS test origin');
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,syntheticOnly:true,httpsReverseProxy:true,rebasedOwnedFixtureImageOrigin:true,fixtureKind:fixture.fixtureKind,photoCases:fixture.photoCases,productionWrites:0,providerTransfers,reports,tiles,errors},null,2));console.log(JSON.stringify({passed:true,evidence,reports}));
 }catch(e){if(page&&!page.isClosed()&&!/login/.test(page.url()))await page.screenshot({path:path.join(evidence,'failed.png')}).catch(()=>{});fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({stage,message:e.message,errors,tiles,reads,providerTransfers,apiFailures,network,pending:[...pending.values()]},null,2));throw e;}
 finally{if(browser)await browser.close();if(fixture)await fixture.cleanup();if(qa)fs.writeFileSync(path.join(evidence,'cleanup.json'),JSON.stringify(await qa.stop(),null,2));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
