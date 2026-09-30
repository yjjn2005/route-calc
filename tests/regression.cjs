const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
let source=html.split('<script>')[1].split('</script>')[0];
source=source.replace('loadSet();setNow();renderHist();',`loadSet();setNow();renderHist(); globalThis.app={odsay,taxiCalc,carCost,nightRate,num,coordinate,validateSettings,readHist,hideSug,runSug,fetchJson,run,offlineRoutes,nearStations,geocode,walkMin,getState:()=>S};`);
const nodes={},storage={},timers=new Map();let tid=0,fetcher=()=>Promise.reject(new Error('offline'));
function node(id){return nodes[id]||(nodes[id]={value:'',hidden:true,textContent:'',innerHTML:'',disabled:false,style:{},dataset:{},children:[],classList:{toggle(){}},addEventListener(){},querySelectorAll(){return []},setAttribute(){},scrollIntoView(){}})}
for(const m of html.matchAll(/<(input|select)[^>]*id="([^"]+)"[^>]*>/g)){node(m[2]).value=(m[0].match(/value="([^"]*)"/)||[])[1]||''}
node('wspd').value='4.5';node('nearn').value='1';
const context={document:{getElementById:node,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},hidden:false},localStorage:{getItem:k=>storage[k]??null,setItem:(k,v)=>storage[k]=v},setTimeout:(f)=>{timers.set(++tid,f);return tid},clearTimeout:id=>timers.delete(id),setInterval(){},AbortController,fetch:(...a)=>fetcher(...a),Date,console,window:{}};
vm.createContext(context);vm.runInContext(source,context);const a=context.app;let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name)}
(async()=>{
 test('택시 통행료 5,000원 합산',()=>{let b=a.taxiCalc(10000,1800,new Date(2026,8,30,12));node('ttoll').value='5000';let t=a.taxiCalc(10000,1800,new Date(2026,8,30,12));assert.equal(t.total-b.total,5000)});
 test('심야할증에 통행료 미포함',()=>{let t=a.taxiCalc(10000,1800,new Date(2026,8,30,23));assert.equal(t.total,t.metered+5000)});
 test('심야 22/23/02/04시 경계',()=>{for(let [h,n] of [[22,1.2],[23,1.4],[2,1.2],[4,1]])assert.equal(a.nightRate(new Date(2026,8,30,h)),n)});
 test('자가용 연료·통행료·주차비 합산',()=>{node('toll').value='3000';node('park').value='2000';assert.equal(a.carCost(9000).total,6700)});
 test('0 연비 거부 및 방어값',()=>{node('kmpl').value='0';assert.ok(a.validateSettings());assert.ok(Number.isFinite(a.carCost(10000).total));node('kmpl').value='9'});
 test('음수 및 Infinity 설정 거부',()=>{for(let v of ['-1','Infinity','12oops','']){node('fuel').value=v;assert.ok(a.validateSettings())}node('fuel').value='1700'});
 test('0 통행료 및 쉼표 금액 허용',()=>{node('ttoll').value='0';node('fuel').value='1,700';assert.equal(a.validateSettings(),'')});
 test('정수 좌표 허용',()=>{assert.equal(a.coordinate('37,127').lat,37)});
 test('음수·소수 좌표 허용',()=>{assert.equal(a.coordinate('-37.2, 127.3').lng,127.3)});
 test('범위 밖·불완전 좌표 거부',()=>{for(let v of ['91,127','37,181','37,abc'])assert.throws(()=>a.coordinate(v))});
 test('일반 주소는 좌표로 오인하지 않음',()=>assert.equal(a.coordinate('서울역'),null));
 test('손상된 검색 기록 복구',()=>{for(let v of ['null','{}','bad','[null,{}, {"f":"서울역","t":"강남역"}]']){storage.rt_hist=v;let r=a.readHist();assert.ok(Array.isArray(r));assert.ok(r.every(x=>x.f&&x.t))}});
 test('검색 숨김 시 타이머 및 요청 무효화',()=>{node('from').value='서울역';a.runSug('from');a.hideSug('from');assert.equal(node('sug-from').hidden,true)});
 test('같은 장소 계산 차단',()=>{node('from').value=node('to').value='서울역';a.run();assert.match(node('status').textContent,/같습니다/)});
 test('중복 계산 차단',()=>{node('go').disabled=true;node('status').textContent='unchanged';a.run();assert.equal(node('status').textContent,'unchanged');node('go').disabled=false});
 await new Promise(r=>setImmediate(r));fetcher=()=>Promise.reject(new Error('network'));let before=timers.size;await assert.rejects(a.fetchJson('https://example.test'));test('네트워크 실패 타이머 정리',()=>assert.equal(timers.size,before));
 let resolveBody;fetcher=()=>Promise.resolve({ok:true,json:()=>new Promise(r=>resolveBody=r)});let request=a.fetchJson('https://example.test');await Promise.resolve();await Promise.resolve();test('응답 본문 처리까지 타임아웃 유지',()=>assert.equal(timers.size,before+1));resolveBody({});await request;test('본문 성공 후 타이머 정리',()=>assert.equal(timers.size,before));
 test('서울역–강남역 내장 경로 계산',()=>{let o={lat:37.5547,lng:126.9706},d={lat:37.4979,lng:127.0276};let ps=a.offlineRoutes(o,d,a.nearStations(o),a.nearStations(d));assert.ok(ps.length);assert.ok(ps[0].info.totalTime>0);assert.ok(ps[0].subPath.some(s=>s.trafficType===1))});
 node('odsay').value='test-only-placeholder';let calls=0;fetcher=()=>{calls++;return Promise.resolve({ok:true,json:()=>Promise.resolve({result:{path:[{info:{totalTime:10}}]}})})};
 let o={lat:37.5547,lng:126.9706},d={lat:37.4979,lng:127.0276};await a.odsay(o,d);await a.odsay(o,d);
 test('동일 경로 ODsay 중복 호출 캐시',()=>assert.equal(calls,1));
 fetcher=()=>{calls++;return Promise.resolve({ok:true,json:()=>Promise.resolve({error:{code:'429',message:'quota'}})})};
 await assert.rejects(a.odsay(o,{lat:37.5,lng:127}));let quotaCalls=calls;await assert.rejects(a.odsay(o,{lat:37.6,lng:127}));
 test('한도 초과 시 다른 경로도 재호출 중단',()=>assert.equal(calls,quotaCalls));
 fetcher=()=>Promise.reject(new Error('network'));
 node('from').value='37.5547,126.9706';node('to').value='37.4979,127.0276';a.run();
 for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));
 test('도로 API 실패에도 내장 대중교통 결과 유지',()=>{assert.equal(a.getState().dr.approx,true);assert.ok(a.getState().paths.length);assert.equal(node('result').hidden,false);assert.equal(node('go').disabled,false)});
 test('실제 도로 아닌 추정 경고 표시',()=>assert.match(node('geoWarn').innerHTML,/직선거리/));
 console.log(`${count} regression groups passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
