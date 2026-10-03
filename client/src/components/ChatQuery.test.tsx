import {describe,it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import ChatQuery,{parseConsignmentResults} from './ChatQuery';
import {api} from '../lib/marketplaceApi';
vi.mock('../lib/marketplaceApi',()=>({api:vi.fn()}));
const id='12345678-1234-4234-8234-123456789012',product='12345678-1234-4234-8234-123456789013';
const data={scope:'OWN_ARCHIVED_AGENT_PROXY_INQUIRIES',truncated:false,items:[{kind:'ARCHIVED_AGENT_PROXY_INQUIRY',id,productId:product,archiveItemId:'FB1-2-01',title:'合成代售書',answer:'詢問待核',state:'WAITING_ROUTE',canonicalUrl:'https://example.invalid/source',events:[{messageId:product,conversationId:id,sequence:1,action:'ASK',text:'<script>不可執行</script>',at:'2026-10-03T00:00:00Z'}],meetup:{status:'UNKNOWN',reason:'未有雙方結構化確認'}}]};
beforeEach(()=>vi.clearAllMocks());
describe('consignment-only query UI',()=>{
 it('rejects native types and wrong conversation citations',()=>{expect(()=>parseConsignmentResults({...data,scope:'CURRENT_USER_MEMBER_ROOMS'})).toThrow();expect(()=>parseConsignmentResults({...data,items:[{...data.items[0],kind:'NATIVE_CHAT'}]})).toThrow();expect(()=>parseConsignmentResults({...data,items:[{...data.items[0],events:[{...data.items[0].events[0],conversationId:product}]}]})).toThrow();});
 it('renders exact IDs, escaped source quote and unknown meetup',async()=>{vi.mocked(api).mockResolvedValue(data);const view=render(<MemoryRouter><ChatQuery token="synthetic-token"/></MemoryRouter>);fireEvent.change(screen.getByLabelText('代售查詢問題'),{target:{value:'書在哪裡面交？'}});fireEvent.click(screen.getByText('查詢代售紀錄'));await screen.findByText('合成代售書');expect(screen.getByText(/面交：未知/)).toBeTruthy();expect(view.container.querySelector('script')).toBeNull();expect(screen.getByRole('link',{name:'原詢問：'+id}).getAttribute('href')).toBe('/chat?source='+product);});
 it('cannot show an old account response after identity remount',async()=>{let release!:(v:any)=>void;vi.mocked(api).mockReturnValueOnce(new Promise(r=>release=r));const view=render(<MemoryRouter><ChatQuery key="old" token="old-synthetic"/></MemoryRouter>);fireEvent.change(screen.getByLabelText('代售查詢問題'),{target:{value:'書'}});fireEvent.click(screen.getByText('查詢代售紀錄'));view.rerender(<MemoryRouter><ChatQuery key="new" token="new-synthetic"/></MemoryRouter>);release(data);await waitFor(()=>expect(screen.queryByText('合成代售書')).toBeNull());expect(screen.getByLabelText('代售查詢問題')).toHaveProperty('value','');});
 it('failed query does not claim an empty successful result',async()=>{vi.mocked(api).mockRejectedValue(Error('503'));render(<MemoryRouter><ChatQuery token="synthetic"/></MemoryRouter>);fireEvent.change(screen.getByLabelText('代售查詢問題'),{target:{value:'書'}});fireEvent.click(screen.getByText('查詢代售紀錄'));await screen.findByRole('alert');expect(screen.queryByText(/沒有找到你有權/)).toBeNull();});
});
