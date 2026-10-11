import fs from 'fs';
import path from 'path';
import vm from 'vm';

// Only exercise the runner's completion decision. Child commands are mocked;
// no npm install, credentials, network or deployment is performed here.
it.each([[],['--quick'],['--skip-build']])('cannot label skipped/partial checks release-ready %j', flags=>{
  const code=fs.readFileSync(path.resolve(__dirname,'../../../scripts/regression-test.js'),'utf8');
  const exits:number[]=[],logs:string[]=[];
  vm.runInNewContext(code,{__dirname:path.resolve(__dirname,'../../../scripts'),Date,
    process:{argv:['node','regression-test.js',...flags],exit:(n:number)=>exits.push(n)},
    console:{log:(...v:any[])=>logs.push(v.join(' ')),error:(...v:any[])=>logs.push(v.join(' '))},
    require:(name:string)=>name==='child_process'?{execSync:()=> 'mock-success',spawn:()=>{}}:name==='path'?path:undefined});
  expect(exits).toEqual([1]);expect(logs.join('\n')).toContain('HOLD:');
  expect(logs.join('\n')).not.toContain('Ready to deploy!');
});
