/* Kora X — free public football feeds, no API keys.
 * ESPN's public feeds are undocumented and can change. Google News RSS is used
 * for Arabic editorial coverage; it points readers to the original publishers.
 * OpenLigaDB is only a German-league fallback, never a global-data substitute.
 */
(function () {
  'use strict';
  var SL = {
    ksa:'ksa.1',eng:'eng.1',esp:'esp.1',ita:'ita.1',ger:'ger.1',fra:'fra.1',
    ned:'ned.1',por:'por.1',tur:'tur.1',bra:'bra.1',arg:'arg.1',usa:'usa.1',mex:'mex.1',jpn:'jpn.1',
    ucl:'uefa.champions',uel:'uefa.europa',lib:'conmebol.libertadores',wc:'fifa.world',afc:'caf.nations'
  };
  var LEAGUE_AR = {
    ksa:'دوري روشن السعودي',eng:'الدوري الإنجليزي الممتاز',esp:'الدوري الإسباني',
    ita:'الدوري الإيطالي',ger:'الدوري الألماني',fra:'الدوري الفرنسي',ned:'الدوري الهولندي',
    por:'الدوري البرتغالي',tur:'الدوري التركي',bra:'الدوري البرازيلي',arg:'الدوري الأرجنتيني',
    usa:'الدوري الأمريكي',mex:'الدوري المكسيكي',jpn:'الدوري الياباني',ucl:'دوري أبطال أوروبا',
    uel:'الدوري الأوروبي',lib:'كوبا ليبرتادوريس',wc:'كأس العالم',afc:'كأس أمم أفريقيا'
  };
  var SITE='https://site.api.espn.com/apis/';
  var CORE='https://sports.core.api.espn.com/v2/sports/soccer/leagues/';
  var cache=new Map(), pending=new Map(), playerPhotos=Object.create(null);
  var RSS_MAIN='(أخبار كرة القدم العالمية OR كرة القدم OR الدوري الإنجليزي OR دوري أبطال أوروبا OR الدوري الإسباني OR الدوري الإيطالي OR الدوري الألماني OR الدوري الفرنسي OR الدوري المصري OR دوري روشن OR كأس العالم OR كأس أمم أفريقيا OR كوبا ليبرتادوريس) when:7d';
  var RSS_TRANSFERS='(انتقالات كرة القدم OR سوق الانتقالات OR صفقة انتقال OR تجديد عقد لاعب OR إعارة لاعب) when:7d';
  function https(v){return typeof v==='string' && /^https:\/\//i.test(v);}
  function dedupeCacheKey(url){return url;}
  function fetchText(url, ttl, accept){
    var now=Date.now(), key=dedupeCacheKey(url), old=cache.get(key);
    if(old && now-old.time<ttl) return Promise.resolve(old.value);
    if(pending.has(key)) return pending.get(key);
    var task=(async function(){
      var ctl=typeof AbortController!=='undefined'?new AbortController():null;
      var timer=ctl?setTimeout(function(){ctl.abort();},12000):null;
      try{
        var res=await fetch(url,{method:'GET',headers:{Accept:accept||'application/json'},signal:ctl?ctl.signal:undefined,cache:'no-store'});
        if(!res.ok) throw new Error('HTTP '+res.status);
        var value=accept==='application/rss+xml'?await res.text():await res.json();
        cache.set(key,{time:Date.now(),value:value});
        try { if(typeof value!=='string'||value.length<120000){var store=JSON.parse(localStorage.getItem('kx_feed_cache')||'{}'); store[key]={time:Date.now(),value:value}; var entries=Object.keys(store); if(entries.length>8) entries.slice(0,entries.length-8).forEach(function(k){delete store[k];}); localStorage.setItem('kx_feed_cache',JSON.stringify(store));} } catch(_){ }
        return value;
      }catch(e){return old?old.value:null;}
      finally{if(timer)clearTimeout(timer);pending.delete(key);}
    })(); pending.set(key,task); return task;
  }
  try { var saved=JSON.parse(localStorage.getItem('kx_feed_cache')||'{}'); Object.keys(saved).forEach(function(k){var x=saved[k];if(x&&x.value&&Date.now()-x.time<72*60*60*1000)cache.set(k,x);}); } catch(_){ }
  async function fetchJSON(url,ttl){return fetchText(url,ttl,'application/json');}
  async function mapLimit(items,limit,worker){var out=new Array(items.length),cursor=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async function(){while(true){var i=cursor++;if(i>=items.length)return;try{out[i]=await worker(items[i]);}catch(_){out[i]=null;}}}));return out;}
  function numericStats(entry){var v=Object.create(null);(entry.stats||[]).forEach(function(s){if(s&&s.name)v[s.name]=s.value;});return v;}
  function val(s,names){for(var i=0;i<names.length;i++)if(s[names[i]]!==undefined&&s[names[i]]!==null)return Number(s[names[i]])||0;return 0;}
  function dateLabel(v){if(!v)return '';var d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'});}
  function cacheBustRss(kind){return kind==='transfers'?RSS_TRANSFERS:RSS_MAIN;}
  function rssUrl(query){return 'https://news.google.com/rss/search?q='+encodeURIComponent(query)+'&hl=ar&gl=EG&ceid=EG:ar';}
  function nativeRss(kind){return new Promise(function(resolve){
    if(!window.KXNative||typeof window.KXNative.fetchRss!=='function'){resolve(null);return;}
    var id='rss_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    var timer=setTimeout(function(){delete window.__kxRssWaiters[id];resolve(null);},14000);
    window.__kxRssWaiters=window.__kxRssWaiters||{};
    window.__kxRssWaiters[id]=function(xml){clearTimeout(timer);delete window.__kxRssWaiters[id];resolve(xml||null);};
    try{window.KXNative.fetchRss(kind,id);}catch(_){clearTimeout(timer);delete window.__kxRssWaiters[id];resolve(null);}
  });}
  window.__kxRssResult=function(id,xml){var fn=window.__kxRssWaiters&&window.__kxRssWaiters[id];if(fn)fn(xml);};
  function parseRss(xml,tag){
    if(!xml||typeof DOMParser==='undefined')return [];
    var doc=new DOMParser().parseFromString(xml,'text/xml');if(doc.querySelector('parsererror'))return [];
    var items=Array.from(doc.querySelectorAll('item')),seen=new Set(),rows=[];
    items.forEach(function(item){
      var title=(item.querySelector('title')?.textContent||'').trim();
      if(!title || !/[\u0600-\u06FF]/.test(title))return;
      var link=(item.querySelector('link')?.textContent||'').trim();
      var sourceNode=item.querySelector('source'),source=(sourceNode?.textContent||'Google News').trim();
      var desc=(item.querySelector('description')?.textContent||'').trim();
      var pub=(item.querySelector('pubDate')?.textContent||'').trim();
      var key=title.toLocaleLowerCase('ar').replace(/[\s\p{P}]+/gu,' ').trim();if(seen.has(key))return;seen.add(key);
      var img='';
      ['media:content','media:thumbnail','enclosure'].forEach(function(tagName){if(img)return;var el=item.getElementsByTagName(tagName)[0];if(el){var u=el.getAttribute('url');if(https(u))img=u;}});
      if(!img&&desc){var parsed=new DOMParser().parseFromString(desc,'text/html'),im=parsed.querySelector('img');if(im&&https(im.src))img=im.src;}
      rows.push({id:'rss-'+key,title:title,desc:desc.replace(/<[^>]*>/g,' ').slice(0,300),body:desc.replace(/<[^>]*>/g,' ').slice(0,300),img:img,time:dateLabel(pub),tag:tag||'أخبار عالمية',source:source,url:https(link)?link:''});
    });
    return rows.slice(0,30);
  }
  async function arabicNews(kind,leagueKey){
    var q=cacheBustRss(kind),storageKey='kx_arabic_rss_'+kind,stale=null;
    // Keep the main feed global instead of filtering it down to one competition.
    try{var saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&Array.isArray(saved.rows)&&Date.now()-saved.time<72*60*60*1000){stale=saved.rows;if(Date.now()-saved.time<5*60*1000)return saved.rows;}}catch(_){ }
    var xml=await nativeRss(kind);
    if(!xml){var raw=await fetchText(rssUrl(q),5*60*1000,'application/rss+xml');xml=typeof raw==='string'?raw:null;}
    var rows=parseRss(xml,kind==='transfers'?'سوق الانتقالات':'أخبار عالمية');
    if(rows.length){try{localStorage.setItem(storageKey,JSON.stringify({time:Date.now(),rows:rows}));}catch(_){ }return rows;}
    return stale||[];
  }
  async function standings(leagueKey){
    var slug=SL[leagueKey];if(!slug)return null;
    var data=await fetchJSON(SITE+'site/v2/sports/soccer/'+slug+'/standings',15*60*1000);
    var entries=[];
    if(data){(data.children||[data]).forEach(function(child){var a=child&&child.standings&&child.standings.entries;if(Array.isArray(a))entries=entries.concat(a);});if(!entries.length&&data.standings&&Array.isArray(data.standings.entries))entries=data.standings.entries;}
    var rows=entries.map(function(entry){var t=entry.team||{},name=t.displayName||t.name||t.shortDisplayName||'';if(!name)return null;var s=numericStats(entry),logo=(t.logos&&t.logos[0]&&t.logos[0].href)||t.logo||'';return{name:name,p:val(s,['gamesPlayed','appearances']),w:val(s,['wins']),d:val(s,['ties','draws']),l:val(s,['losses']),gf:val(s,['pointsFor','goalsFor']),ga:val(s,['pointsAgainst','goalsAgainst']),pts:val(s,['points']),form:s.streak||s.form||entry.form||'',logo:https(logo)?logo:'',teamId:t.id||'',league:leagueKey,source:'ESPN'};}).filter(Boolean);
    var unique=new Map();rows.forEach(function(x){unique.set(x.teamId||x.name,x);});rows=Array.from(unique.values());
    if(rows.length)return rows;
    // OpenLigaDB is deliberately limited to the German Bundesliga (not used as a global fallback).
    if(leagueKey==='ger'){
      var year=new Date().getFullYear(),month=new Date().getMonth()+1,season=month>=7?year:year-1;
      var od=await fetchJSON('https://api.openligadb.de/getbltable/bl1/'+season,20*60*1000);
      if(Array.isArray(od)){
        var fallback=od.map(function(x){var t=x.teamInfo||{};return{name:t.teamName||t.shortName||'',p:Number(x.matches)||0,w:Number(x.won)||0,d:Number(x.draw)||0,l:Number(x.lost)||0,gf:Number(x.goals)||0,ga:Number(x.opponentGoals)||0,pts:Number(x.points)||0,form:'',logo:https(t.teamIconUrl)?t.teamIconUrl:'',teamId:String(t.teamId||''),league:leagueKey,source:'OpenLigaDB'};}).filter(function(x){return x.name;});
        if(fallback.length)return fallback;
      }
    }
    return null;
  }
  async function news(leagueKey){
    var rows=await arabicNews('main',leagueKey);
    if(rows.length)return rows;
    // Do not silently substitute English-only ESPN headlines into Arabic news.
    return [];
  }
  async function transfers(){return arabicNews('transfers','');}
  async function matches(date){
    var d=String(date||'').replace(/-/g,'');if(!/^\d{8}$/.test(d))return [];
    var keys=Object.keys(SL),batches=await mapLimit(keys,4,async function(key){var data=await fetchJSON(SITE+'site/v2/sports/soccer/'+SL[key]+'/scoreboard?dates='+d,90*1000);if(!data||!Array.isArray(data.events))return[];return data.events.map(function(e){var c=e.competitions&&e.competitions[0],teams=c&&c.competitors;if(!Array.isArray(teams))return null;var h=teams.find(function(x){return x.homeAway==='home';}),a=teams.find(function(x){return x.homeAway==='away';});if(!h||!a||!h.team||!a.team)return null;var state=e.status&&e.status.type&&e.status.type.state,when=e.date||c.date||'';return{id:String(e.id||key+'-'+when),lg:key,h:h.team.displayName||h.team.name||'',a:a.team.displayName||a.team.name||'',hs:Number(h.score)||0,as:Number(a.score)||0,st:state==='in'?'live':state==='post'?'ft':'ns',mt:e.status&&e.status.displayClock||'',time:when?new Date(when).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'',dateTime:when,homeLogo:https(h.team.logo)?h.team.logo:'',awayLogo:https(a.team.logo)?a.team.logo:'',homeId:h.team.id||'',awayId:a.team.id||'',venue:c.venue&&c.venue.fullName||e.venue&&e.venue.displayName||''};}).filter(Boolean);});
    var found=new Map();batches.forEach(function(a){(a||[]).forEach(function(m){if(m&&m.id&&!found.has(m.id))found.set(m.id,m);});});return Array.from(found.values()).sort(function(a,b){var live=(a.st==='live'?-1:0)-(b.st==='live'?-1:0);if(live)return live;var ta=Date.parse(a.dateTime||'')||0,tb=Date.parse(b.dateTime||'')||0;return ta-tb;});
  }
  async function matchDetails(leagueKey,eventId){var slug=SL[leagueKey];if(!slug||!eventId)return null;var d=await fetchJSON(SITE+'site/v2/sports/soccer/'+slug+'/summary?event='+encodeURIComponent(eventId),2*60*1000);if(!d)return null;var c=d.header&&d.header.competitions&&d.header.competitions[0],events=[],groups=Array.isArray(d.keyEvents)?d.keyEvents:(Array.isArray(d.commentary)?d.commentary:[]);groups.forEach(function(x){var t=(x.type&& (x.type.text||x.type.name)||x.text||'').toLowerCase(),name=x.participants&&x.participants[0]&&x.participants[0].athlete&&x.participants[0].athlete.displayName||x.athlete&&x.athlete.displayName||x.text||'';events.push({minute:x.clock&&x.clock.displayValue||x.time||'',type:t,player:name,detail:x.text||''});});return{header:c||null,events:events,boxscore:d.boxscore||null,rosters:d.rosters||null,plays:d.plays||null,statistics:d.statistics||d.boxscore&&d.boxscore.teams||null};}
  async function resolveAthlete(v){if(!v)return null;if(typeof v==='string')return https(v)?fetchJSON(v,60*60*1000):null;if(v.$ref&&https(v.$ref))return fetchJSON(v.$ref,60*60*1000);return v;}
  async function scorers(leagueKey){var slug=SL[leagueKey];if(!slug)return null;var d=await fetchJSON(CORE+slug+'/leaders?limit=100',20*60*1000);if(!d)return null;var groups=Array.isArray(d.leaders)?d.leaders:Array.isArray(d.categories)?d.categories:[];var selected=groups.filter(function(g){return /goal|assist/i.test([g.name,g.displayName,g.abbreviation,g.shortDisplayName].join(' '));});var records=new Map();
    for(var i=0;i<selected.length;i++){var g=selected[i],kind=/assist/i.test([g.name,g.displayName,g.abbreviation].join(' '))?'assists':'goals',tops=await mapLimit((g.leaders||[]).slice(0,30),5,async function(x){var a=await resolveAthlete(x.athlete||x.participant);if(!a)return null;var name=a.fullName||a.displayName||a.name||'';if(!name)return null;var v=Number(x.value);if(!Number.isFinite(v))v=Number(String(x.displayValue||'').replace(/[^\d.]/g,''))||0;var team=a.team&&(a.team.displayName||a.team.name)||x.team&&(x.team.displayName||x.team.name)||'',photo=a.headshot&&(a.headshot.href||a.headshot)||a.image||'';return{name:name,team:team,value:v,photo:https(photo)?photo:''};});tops.filter(Boolean).forEach(function(x){var p=records.get(x.name)||{name:x.name,team:x.team,goals:0,assists:0,photo:x.photo};p[kind]=x.value;if(!p.team)p.team=x.team;if(!p.photo)p.photo=x.photo;records.set(x.name,p);});}
    var out=Array.from(records.values()).sort(function(a,b){return b.goals-a.goals||b.assists-a.assists;});out.forEach(function(p){if(p.photo)playerPhotos[p.name]=p.photo;});return out.length?out.slice(0,30):null;
  }
  window.KXCFG={demo:false,sounds:{goal:'sounds/goal.mp3',kickoff:'sounds/kickoff.mp3',ht:'sounds/ht.mp3',second:'sounds/second.mp3',ft:'sounds/ft.mp3',notif:'sounds/notif.mp3',news:'sounds/news.mp3',sub:'sounds/sub.mp3',card:'sounds/card.mp3',var:'sounds/var.mp3',penalty:'sounds/penalty.mp3',cheer:'sounds/cheer.mp3'},standings:standings,news:news,matches:matches,scorers:scorers,transfers:transfers,matchDetails:matchDetails,photo:function(n){return playerPhotos[n]||'';},sources:{primary:'ESPN public soccer feeds (unofficial; no API key)',germanFallback:'OpenLigaDB public REST API (no key; German Bundesliga only)',arabicNews:'Google News RSS Arabic edition (aggregated publishers; no key)',transfers:'Arabic Google News RSS search; press coverage, not verified transfer transactions'}};
})();
