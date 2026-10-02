import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe,expect,it,vi } from 'vitest';
const script=readFileSync(resolve('public/registerSW.js'),'utf8');
function fixture(readyState='complete',worker=true) {
  const events=new EventTarget(),reload=vi.fn(),save=vi.fn(),clear=vi.fn(),update=vi.fn().mockResolvedValue(undefined);
  const register=vi.fn().mockResolvedValue({update});
  const navigator=worker?{serviceWorker:{register}}:{};
  const context={navigator,document:{readyState},window:{addEventListener:events.addEventListener.bind(events),location:{reload}},localStorage:{setItem:save,clear}};
  return {context,events,reload,save,clear,register,update};
}
describe('cached HTML update compatibility entry',()=>{
  it('registers and prepares the current worker when an old script loads after the load event',async()=>{
    const value=fixture();runInNewContext(script,value.context);
    await vi.waitFor(()=>expect(value.update).toHaveBeenCalledTimes(1));
    expect(value.register).toHaveBeenCalledWith('/sw.js',{scope:'/',updateViaCache:'none'});
    expect(value.reload).not.toHaveBeenCalled();expect(value.save).not.toHaveBeenCalled();expect(value.clear).not.toHaveBeenCalled();
  });
  it('waits for the pending load event exactly once without reloading forms',async()=>{
    const value=fixture('loading');runInNewContext(script,value.context);expect(value.register).not.toHaveBeenCalled();
    value.events.dispatchEvent(new Event('load'));value.events.dispatchEvent(new Event('load'));
    await vi.waitFor(()=>expect(value.update).toHaveBeenCalledTimes(1));expect(value.register).toHaveBeenCalledTimes(1);expect(value.reload).not.toHaveBeenCalled();
  });
  it('keeps an old page usable when worker access is unavailable',()=>{
    const value=fixture('complete',false);expect(()=>runInNewContext(script,value.context)).not.toThrow();
    expect(value.register).not.toHaveBeenCalled();expect(value.reload).not.toHaveBeenCalled();expect(value.clear).not.toHaveBeenCalled();
  });
  it('handles denied worker access without touching input or recovery data',()=>{
    const value=fixture();Object.defineProperty(value.context.navigator,'serviceWorker',{get(){throw Error('synthetic denied worker');}});
    expect(()=>runInNewContext(script,value.context)).not.toThrow();expect(value.reload).not.toHaveBeenCalled();expect(value.save).not.toHaveBeenCalled();expect(value.clear).not.toHaveBeenCalled();
  });
  it('handles a failed registration without claiming an update or automatically reloading',async()=>{
    const value=fixture();value.register.mockRejectedValue(Error('synthetic offline'));runInNewContext(script,value.context);
    await vi.waitFor(()=>expect(value.register).toHaveBeenCalledTimes(1));await Promise.resolve();await Promise.resolve();
    expect(value.update).not.toHaveBeenCalled();expect(value.reload).not.toHaveBeenCalled();expect(value.clear).not.toHaveBeenCalled();
  });
});
