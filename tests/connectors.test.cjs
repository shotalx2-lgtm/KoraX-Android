const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const store = new Map();
const requestedUrls = [];
let forceGermanFallback = false;
const rss = `<?xml version="1.0"?><rss><channel><item><title>عنوان عربي للاختبار</title><link>https://example.com/story</link><description>ملخص عربي</description><pubDate>Thu, 26 Nov 2026 08:00:00 GMT</pubDate><source url="https://example.com">ناشر تجريبي</source></item></channel></rss>`;
const fixtureStandings = {children:[{standings:{entries:[{team:{id:'101',displayName:'Example FC',logo:'https://example.com/team.png'},stats:[{name:'gamesPlayed',value:10},{name:'wins',value:7},{name:'ties',value:2},{name:'losses',value:1},{name:'pointsFor',value:20},{name:'pointsAgainst',value:6},{name:'points',value:23}]}]}}]};
const fixtureScoreboard = {events:[{id:'9001',date:'2026-11-26T18:00:00Z',status:{type:{state:'in'},displayClock:'25\''},competitions:[{venue:{fullName:'Test Stadium'},competitors:[{homeAway:'home',score:'1',team:{id:'101',displayName:'Example FC',logo:'https://example.com/h.png'}},{homeAway:'away',score:'0',team:{id:'102',displayName:'Sample United',logo:'https://example.com/a.png'}}]}]}]};
const fixtureDetails = {header:{competitions:[{}]},keyEvents:[{clock:{displayValue:'25\''},type:{text:'Goal'},athlete:{displayName:'Test Player'},text:'Goal'}],statistics:{statistics:[{stats:[{name:'Possession',displayValue:'60%'}]}]},rosters:{teams:[{team:{displayName:'Example FC'},roster:[{starter:true,athlete:{displayName:'Test Player'},position:{name:'Forward'}}]}]}};
async function fakeFetch(input, opts={}) {
  const url=String(input);
  requestedUrls.push(url);
  let data={};
  if(url.includes('/standings') && url.includes('ger.1') && forceGermanFallback) data={children:[]};
  else if(url.includes('/standings')) data=fixtureStandings;
  else if(url.includes('getbltable/bl1/2026')) return {ok:true,status:200,json:async()=>[{teamInfo:{teamId:55,teamName:'Fallback Dortmund',teamIconUrl:'https://example.com/ger.png'},matches:9,won:6,draw:2,lost:1,goals:18,opponentGoals:7,points:20}]};
  else if(url.includes('/scoreboard') && url.includes('eng.1')) data=fixtureScoreboard;
  else if(url.includes('/summary?event=9001')) data=fixtureDetails;
  else if(url.includes('/leaders?limit=100')) data={leaders:[{name:'goals',leaders:[{athlete:{fullName:'Test Player',team:{displayName:'Example FC'},headshot:{href:'https://example.com/player.png'}},value:5}]}]};
  else if(url.includes('news.google.com/rss')) return {ok:true,status:200,text:async()=>rss,json:async()=>({})};
  return {ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)};
}
const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)};
class FakeDOMParser {
  parseFromString(xml) {
    const item = {
      querySelector(name) {
        const map = {title:'عنوان عربي للاختبار',link:'https://example.com/story',description:'ملخص عربي',pubDate:'Thu, 26 Nov 2026 08:00:00 GMT',source:'ناشر تجريبي'};
        if (name === 'parsererror') return null;
        return map[name] === undefined ? null : {textContent:map[name],getAttribute:()=>null};
      },
      getElementsByTagName(){return [];}
    };
    return {querySelector:()=>null,querySelectorAll:()=>xml.includes('<item>')?[item]:[]};
  }
}
const context={window:{},localStorage,fetch:fakeFetch,DOMParser:FakeDOMParser,AbortController,Map,Set,Date,Math,Number,String,Array,Object,Promise,Intl,URL,RegExp,JSON,Error,console,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(__dirname+'/../korax-app/config.js','utf8'),context);
(async()=>{
 const c=context.window.KXCFG;
 assert.strictEqual(c.demo,false,'Demo mode must stay disabled');
 const standings=await c.standings('eng');
 assert.strictEqual(standings[0].pts,23);
 assert.strictEqual(standings[0].source,'ESPN');
 assert(requestedUrls.some(u=>u==='https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/standings'), 'Standings must use the /apis/site/v2 ESPN route');
 const matches=await c.matches('2026-11-26');
 assert(!requestedUrls.some(u=>u.includes('/egy.1/')), 'Do not call an unverified Egyptian league slug');
 const m=matches.find(x=>x.id==='9001');
 assert(m,'Expected the real-shaped scoreboard record to map');
 assert.strictEqual(m.st,'live');
 assert.strictEqual(m.hs,1);
 const scorers=await c.scorers('eng');
 assert.strictEqual(scorers[0].goals,5);
 const details=await c.matchDetails('eng','9001');
 assert.strictEqual(details.events[0].player,'Test Player');
 const news=await c.news('eng');
 assert.strictEqual(news[0].title,'عنوان عربي للاختبار');
 assert.strictEqual(news[0].source,'ناشر تجريبي');
 assert.strictEqual(news[0].url,'https://example.com/story');
 forceGermanFallback=true;
 const german=await c.standings('ger');
 assert.strictEqual(german[0].source,'OpenLigaDB');
 assert.strictEqual(german[0].name,'Fallback Dortmund');
 const transfers=await c.transfers();
 assert.strictEqual(transfers[0].tag,'سوق الانتقالات');
 console.log('PASS: no-demo flag, verified-source standings, German OpenLigaDB fallback, supported scoreboard mapping, scorer mapping, match details, Arabic RSS parsing, transfer-news mapping, no unverified Egypt slug');
})().catch(e=>{console.error(e);process.exitCode=1;});
