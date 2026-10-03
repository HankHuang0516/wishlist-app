import fs from 'fs';
import path from 'path';
export function webQaBrowser(){
 let puppeteer:any;
 try{puppeteer=require('puppeteer');}catch(error){if(process.platform!=='darwin')throw error;puppeteer=require('/opt/homebrew/lib/node_modules/puppeteer');}
 const system=process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome';
 return {puppeteer,executablePath:fs.existsSync(system)?system:puppeteer.executablePath()};
}
export function webQaEvidence(name:string){
 if(!/^[a-z0-9-]+\.png$/.test(name))throw Error('Synthetic evidence filename required');
 const directory=process.env.WEB_QA_ARTIFACT_DIR??path.resolve(__dirname,'../../../../.qa-artifacts');fs.mkdirSync(directory,{recursive:true});return path.join(directory,name);
}
