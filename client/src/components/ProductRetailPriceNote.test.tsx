import {act,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import ProductRetailPriceNote from './ProductRetailPriceNote';
const {read}=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('../lib/marketplaceApi',()=>({publicApi:read}));
const id='12345678-1234-4234-8234-123456789abc',retail={price:1000,priceType:'RETAIL_REGULAR',sourceUrl:'https://www.example.com/product',sourceTitle:'同型號新品售價',sourcePeriod:null,checkedAt:'2026-10-25T00:00:00Z'};
const response=(patch:object={})=>({complete:true,items:[{kind:'listing',id,key:'listing:'+id,title:'商品 A',price:500,currency:'TWD',priceUnitVerified:true,photos:[],retail,...patch}],categories:[],counties:[],total:1,counts:{listing:1,source:0,external:0}});
beforeEach(()=>{localStorage.setItem('user-locale','zh-TW');read.mockReset();});
afterEach(()=>localStorage.clear());
it('checks the public product afresh and suppresses mismatched current title or price',async()=>{
 read.mockResolvedValue(response());const view=render(<ProductRetailPriceNote kind="listing" id={id} title="商品 A" price={500}/>);
 await screen.findByText('約參考原價 5 折');
 view.rerender(<ProductRetailPriceNote kind="listing" id={id} title="商品 A" price={600}/>);
 expect(screen.queryByText('約參考原價 5 折')).not.toBeInTheDocument();
 await waitFor(()=>expect(read).toHaveBeenCalledTimes(2));
 expect(screen.queryByText(/約參考原價/)).not.toBeInTheDocument();
});
it('ignores a late previous-product response and never retries failed optional evidence automatically',async()=>{
 let finish!:(value:unknown)=>void;read.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve)).mockRejectedValue(Error('unavailable'));
 const view=render(<ProductRetailPriceNote kind="listing" id={id} title="商品 A" price={500}/>);
 view.rerender(<ProductRetailPriceNote kind="listing" id={id} title="商品 B" price={500}/>);
 await act(async()=>finish(response()));
 expect(screen.queryByText(/約參考原價/)).not.toBeInTheDocument();expect(read).toHaveBeenCalledTimes(2);
 expect(read.mock.calls[0][1].signal.aborted).toBe(true);
});
