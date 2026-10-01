import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(join(process.cwd(),'public/analytics-frame.js'),'utf8');
function fixture(privacy = {}) {
  let listener!: (event: any) => void;
  const parent = {}, scripts:any[] = [];
  const port = { onmessage:null as any, start:vi.fn(), close:vi.fn(), postMessage:vi.fn() };
  const window:any = {parent,addEventListener:(_type:string,handler:any)=>{listener=handler;}};
  const document = {createElement:()=>({}),head:{append:(value:any)=>scripts.push(value)}};
  runInNewContext(source,{window,document,navigator:privacy,location:{href:'https://wishlist.example/analytics-frame.html'},URL,Date});
  const connect = (overrides = {}) => listener({source:parent,origin:'https://wishlist.example',data:{kind:'wishlist-analytics-connect',version:1},ports:[port],...overrides});
  const send = (data:unknown) => port.onmessage?.({data});
  const calls = () => JSON.parse(JSON.stringify(window.dataLayer ?? [])).map((args:any)=>Object.values(args));
  return {window,scripts,port,connect,send,calls};
}
describe('actual sandbox bridge validates both ends', () => {
  it('ignores unknown sources/origins, extra handshake fields and standalone pages', () => {
    const f=fixture();f.connect({source:{}});f.connect({origin:'https://outside.invalid'});f.connect({data:{kind:'wishlist-analytics-connect',version:1,token:'private'}});
    expect(f.scripts).toHaveLength(0);f.window.parent=f.window;f.connect();expect(f.scripts).toHaveLength(0);
  });
  it('starts only once with safe metadata and carries allowed aggregate events', () => {
    const f=fixture();f.connect();f.connect();expect(f.scripts).toHaveLength(1);expect(f.port.postMessage).toHaveBeenCalledWith('ready');
    f.send({event:'page_view',path:'/reset-password'});f.send({event:'login',method:'email'});f.send({event:'share',contentType:'wishlist'});f.send({event:'add_to_wishlist',count:2});f.send({event:'view_item_list'});
    const events=f.calls().filter((args:any[])=>args[0]==='event');expect(events).toHaveLength(5);
    for(const [, ,params] of events){expect(params.page_location).toBe('https://wishlist.example/reset-password');expect(params.page_referrer).toBe('');expect(params.page_title).toBe('Wishlist.ai');}
    expect(f.calls()[1][2]).toMatchObject({send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
    expect(f.scripts[0].referrerPolicy).toBe('no-referrer');
  });
  it('rejects private paths, fields, arbitrary parameters and invalid counts before gtag', () => {
    const f=fixture();f.connect();const before=f.calls().length;
    for(const body of [{event:'page_view',path:'/reset-password?token=private'},{event:'page_view',path:'/wishlists/99'},{event:'login',method:'user@example.invalid'},{event:'share',contentType:'wishlist',itemId:'private'},{event:'view_item_list',title:'private'},{event:'add_to_wishlist',count:NaN},{event:'add_to_wishlist',count:101},{event:'private_custom',token:'private'}]) f.send(body);
    expect(f.calls()).toHaveLength(before);
  });
  it('does not initialize for Do Not Track or Global Privacy Control', () => {
    for(const privacy of [{doNotTrack:'1'},{globalPrivacyControl:true}]){const f=fixture(privacy);f.connect();expect(f.scripts).toHaveLength(0);}
  });
  it('bounds offline queue and stops safely on a failed provider script', () => {
    const f=fixture();f.connect();for(let i=0;i<100;i++)f.send({event:'page_view',path:'/settings'});
    expect(f.calls()).toHaveLength(50);f.scripts[0].onerror();f.send({event:'login',method:'email'});
    expect(f.calls()).toHaveLength(0);expect(f.port.close).toHaveBeenCalled();
  });
});
