import {describe,it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import ChatQuery,{parseConsignmentResults} from './ChatQuery';
import {api} from '../lib/marketplaceApi';
vi.mock('../lib/marketplaceApi',()=>({api:vi.fn()}));
const id='12345678-1234-4234-8234-123456789012',product='12345678-1234-4234-8234-123456789013';
const data={scope:'OWN_ARCHIVED_AGENT_PROXY_INQUIRIES',truncated:false,items:[{kind:'ARCHIVED_AGENT_PROXY_INQUIRY',id,productId:product,archiveItemId:'FB1-2-01',title:'合成代售書',answer:'詢問待核',state:'WAITING_ROUTE',canonicalUrl:'https://example.invalid/source',events:[{messageId:product,conversationId:id,sequence:1,action:'ASK',text:'<script>不可執行</script>',at:'2026-10-03T00:00:00Z'}],meetup:{status:'UNKNOWN',reason:'未有雙方結構化確認'}}]};
beforeEach(()=>{vi.clearAllMocks();localStorage.setItem('user-locale','zh-TW');});
describe('consignment-only query UI',()=>{
 it('rejects native types and wrong conversation citations',()=>{expect(()=>parseConsignmentResults({...data,scope:'CURRENT_USER_MEMBER_ROOMS'})).toThrow();expect(()=>parseConsignmentResults({...data,items:[{...data.items[0],kind:'NATIVE_CHAT'}]})).toThrow();expect(()=>parseConsignmentResults({...data,items:[{...data.items[0],events:[{...data.items[0].events[0],conversationId:product}]}]})).toThrow();});
 it('renders exact IDs, escaped source quote and unknown meetup',async()=>{vi.mocked(api).mockResolvedValue(data);const view=render(<MemoryRouter><ChatQuery token="synthetic-token"/></MemoryRouter>);fireEvent.change(screen.getByLabelText('代售查詢問題'),{target:{value:'書在哪裡面交？'}});fireEvent.click(screen.getByText('查詢代售紀錄'));await screen.findByText('合成代售書');expect(screen.getByText(/面交：未知/)).toBeTruthy();expect(view.container.querySelector('script')).toBeNull();expect(screen.getByRole('link',{name:'原詢問：'+id}).getAttribute('href')).toBe('/chat?source='+product);});
 it('cannot show an old account response after identity remount',async()=>{let release!:(v:any)=>void;vi.mocked(api).mockReturnValueOnce(new Promise(r=>release=r));const view=render(<MemoryRouter><ChatQuery key="old" token="old-synthetic"/></MemoryRouter>);fireEvent.change(screen.getByLabelText('代售查詢問題'),{target:{value:'書'}});fireEvent.click(screen.getByText('查詢代售紀錄'));view.rerender(<MemoryRouter><ChatQuery key="new" token="new-synthetic"/></MemoryRouter>);release(data);await waitFor(()=>expect(screen.queryByText('合成代售書')).toBeNull());expect(screen.getByLabelText('代售查詢問題')).toHaveProperty('value','');});
 it('failed query does not claim an empty successful result',async()=>{vi.mocked(api).mockRejectedValue(Error('503'));render(<MemoryRouter><ChatQuery token="synthetic"/></MemoryRouter>);fireEvent.change(screen.getByLabelText('代售查詢問題'),{target:{value:'書'}});fireEvent.click(screen.getByText('查詢代售紀錄'));await screen.findByRole('alert');expect(screen.queryByText(/沒有找到你有權/)).toBeNull();});
 it('English summaries keep source names and identical quoted text literal, with original identities and Taiwan time',async()=>{
  localStorage.setItem('user-locale','en-US');
  const original='代理詢問紀錄可查閱；是否外送、在售與面交均需另核實。';
  const result={...data,items:[{...data.items[0],title:original,answer:original,events:[{...data.items[0].events[0],text:original},{...data.items[0].events[0],messageId:product,action:'CONSENT',text:null,at:'2026-10-03T00:00:01Z'}],meetup:{status:'UNKNOWN',reason:'來源詢問尚無結構化雙方確認面交紀錄。原訊息的提議、確認、改約或取消文字僅作引用，不自動視為有效約定。'}}]};
  result.items[0].events[1].messageId='12345678-1234-4234-8234-123456789014';
  vi.mocked(api).mockResolvedValue(result);const view=render(<MemoryRouter><ChatQuery token="synthetic"/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Consignment search'),{target:{value:'Item ID: '+product}});fireEvent.click(screen.getByRole('button',{name:'Search consignment records'}));
  await screen.findByText('The agent inquiry record is readable. Forwarding, item availability and meetup arrangements still need separate verification.');
  expect(screen.getAllByText(original)).toHaveLength(2);expect(screen.getByText(/Meetup: unknown/)).toHaveTextContent('no structured meetup record confirmed by both parties');
  expect(screen.getByRole('link',{name:'Original inquiry: '+id})).toHaveAttribute('href','/chat?source='+product);expect(screen.getByText('Consent to agent inquiry')).toBeInTheDocument();
  expect(view.container.querySelector('time')).toHaveAttribute('datetime',data.items[0].events[0].at);
  expect(view.container.querySelector('time')).toHaveTextContent(new Date(data.items[0].events[0].at).toLocaleString('en-US',{timeZone:'Asia/Taipei',hour12:false})+' (Taiwan time)');
  expect(JSON.parse(vi.mocked(api).mock.calls[0][2]!.body as string)).toEqual({query:'Item ID: '+product});
 });
 it('English incomplete and empty results remain distinct from failure and same-name records stay separate',async()=>{
  localStorage.setItem('user-locale','en-US');vi.mocked(api).mockResolvedValueOnce({...data,truncated:true,items:[data.items[0],{...data.items[0],id:product,productId:id,events:[]}]}).mockRejectedValueOnce(Error('503')).mockResolvedValueOnce({...data,items:[]});
  render(<MemoryRouter><ChatQuery token="synthetic"/></MemoryRouter>);fireEvent.change(screen.getByLabelText('Consignment search'),{target:{value:'二手書'}});fireEvent.click(screen.getByRole('button',{name:'Search consignment records'}));
  await screen.findByText(/Results exceed the search limit and are incomplete/);expect(screen.getByText(/appointments for items with the same name are not combined/)).toBeInTheDocument();expect(screen.getAllByRole('link',{name:/Original inquiry:/})).toHaveLength(2);
  fireEvent.click(screen.getByRole('button',{name:'Search consignment records'}));await screen.findByRole('alert');expect(screen.queryByText(/Results exceed/)).toBeNull();expect(screen.queryByText(/No eligible/)).toBeNull();expect(screen.queryByText(/appointments for items with the same name/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Consignment search'),{target:{value:'no matching source'}});fireEvent.click(screen.getByRole('button',{name:'Search consignment records'}));await screen.findByText(/No eligible consignment inquiries were found/);expect(screen.queryByText(/Results exceed/)).toBeNull();expect(screen.queryByRole('alert')).toBeNull();
 });
 it('English failed read exposes a retry without claiming an empty result or changing the submitted query',async()=>{
  localStorage.setItem('user-locale','en-US');vi.mocked(api).mockRejectedValueOnce(Error('private diagnostic')).mockResolvedValueOnce({...data,items:[]});render(<MemoryRouter><ChatQuery token="synthetic"/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Consignment search'),{target:{value:'二手書'}});fireEvent.click(screen.getByRole('button',{name:'Search consignment records'}));expect(await screen.findByRole('alert')).toHaveTextContent('The consignment search could not be completed. Retry; this does not mean there are no records.');expect(screen.queryByText(/No eligible/)).toBeNull();expect(screen.queryByText('private diagnostic')).toBeNull();expect(screen.getByLabelText('Consignment search')).toHaveValue('二手書');
  fireEvent.click(screen.getByRole('button',{name:'Search consignment records'}));await screen.findByText(/No eligible/);expect(vi.mocked(api).mock.calls.map(call=>JSON.parse(call[2]!.body as string))).toEqual([{query:'二手書'},{query:'二手書'}]);
 });
 it('changing render language during a read never issues another request or translates its original query',async()=>{
  let finish!:(value:any)=>void;vi.mocked(api).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));const view=render(<MemoryRouter><ChatQuery token="synthetic"/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('代售查詢問題'),{target:{value:'書在哪裡面交？'}});fireEvent.click(screen.getByRole('button',{name:'查詢代售紀錄'}));
  localStorage.setItem('user-locale','en-US');view.rerender(<MemoryRouter><ChatQuery token="synthetic"/></MemoryRouter>);expect(screen.getByRole('button',{name:'Searching…'})).toBeDisabled();expect(screen.getByLabelText('Consignment search')).toHaveValue('書在哪裡面交？');expect(api).toHaveBeenCalledTimes(1);
  finish(data);await screen.findByText('合成代售書');expect(screen.getByText('<script>不可執行</script>')).toBeInTheDocument();expect(api).toHaveBeenCalledTimes(1);expect(JSON.parse(vi.mocked(api).mock.calls[0][2]!.body as string)).toEqual({query:'書在哪裡面交？'});
 });
});
