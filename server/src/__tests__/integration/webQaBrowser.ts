import fs from 'fs';
import path from 'path';
export function webQaBrowser(){
 let puppeteer:any;
 try{puppeteer=require('puppeteer');}catch(error){if(process.platform!=='darwin')throw error;puppeteer=require('/opt/homebrew/lib/node_modules/puppeteer');}
 const system=process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome';
 return {puppeteer,executablePath:fs.existsSync(system)?system:puppeteer.executablePath()};
}
/** Chrome switches every browser QA suite launches with.
 * Chrome keeps a page that was left by a full navigation frozen in its back/forward cache. When that page had called
 * indexedDB.open() for a database that did not exist yet and the creation had not finished, the creation stays pending
 * on the frozen page and every later open of that database waits behind it. These suites call page.goto() right after
 * signing in, the moment the app first creates its private store, so now and then the next page found the store stalled
 * for good. No suite exercises that cache, so QA runs without it; webQaBrowser.integration.ts keeps this true. */
export const webQaArgs=['--disable-background-networking','--disable-back-forward-cache'];
export function webQaEvidence(name:string){
 if(!/^[a-z0-9-]+\.png$/.test(name))throw Error('Synthetic evidence filename required');
 const directory=process.env.WEB_QA_ARTIFACT_DIR??path.resolve(__dirname,'../../../../.qa-artifacts');fs.mkdirSync(directory,{recursive:true});return path.join(directory,name);
}
