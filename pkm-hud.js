(function(){
/* ===== 分阶段更新核心（IndexedDB，参照小手机脚本）===== */
var WIN=(function(){try{if(window.parent&&window.parent!==window&&window.parent.document&&window.parent.document.body){return window.parent;}}catch(e){}return window;})();
var document=WIN.document;
/* ★★★ 发布新版只需改下面这一块：版本号 + 更新公告 ★★★ */
var PK_VER='1.9.3';
/*PK_NOTICE_BEGIN
优化
PK_NOTICE_END*/
var PK_UPDATE_URL='https://raw.githubusercontent.com/xianjiu0926/pkm-hud/main/pkm-hud.js';
function pkVerCompare(a,b){
  function p(v){var m=String(v==null?'':v).match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/);return m?[Number(m[1]),Number(m[2]),Number(m[3]),m[4]||'']:null;}
  var x=p(a),y=p(b);
  if(!x||!y)return 0;
  for(var i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1;}
  if(x[3]===y[3])return 0;
  if(!x[3])return 1;
  if(!y[3])return -1;
  var xs=x[3].split('.'),ys=y[3].split('.');
  for(var j=0;j<Math.max(xs.length,ys.length);j++){
    if(xs[j]===undefined)return -1;
    if(ys[j]===undefined)return 1;
    var xn=/^\d+$/.test(xs[j]),yn=/^\d+$/.test(ys[j]);
    if(xn&&yn){if(Number(xs[j])!==Number(ys[j]))return Number(xs[j])>Number(ys[j])?1:-1;}
    else if(xs[j]!==ys[j])return xs[j]>ys[j]?1:-1;
  }
  return 0;
}
var PK_RUNTIME_DB='pk_hud_runtime_v1';
var PK_RUNTIME_STORE='slots';
var PK_RUNTIME_OPEN_TIMEOUT=6500;
var PK_RUNTIME_TX_TIMEOUT=6500;
var pkDbPromise=null;
function pkSha256Text(text){
  try{
    var c=WIN.crypto||window.crypto;if(!c||!c.subtle)return Promise.resolve('');
    return c.subtle.digest('SHA-256',new TextEncoder().encode(String(text||''))).then(function(d){return Array.prototype.map.call(new Uint8Array(d),function(x){return x.toString(16).padStart(2,'0');}).join('');}).catch(function(){return '';});
  }catch(e){return Promise.resolve('');}
}
function pkWithTimeout(promise,ms,label,onTimeout){
  return new Promise(function(resolve,reject){
    var done=false,t=WIN.setTimeout(function(){if(done)return;done=true;try{if(onTimeout)onTimeout();}catch(e){}reject(new Error(label||'操作超时'));},Math.max(250,Number(ms)||5000));
    Promise.resolve(promise).then(function(v){if(done)return;done=true;WIN.clearTimeout(t);resolve(v);},function(e){if(done)return;done=true;WIN.clearTimeout(t);reject(e);});
  });
}
function pkDbOpen(){
  if(pkDbPromise)return pkDbPromise;
  pkDbPromise=new Promise(function(resolve,reject){
    var done=false,tm=0,req=null;
    function fail(e){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);pkDbPromise=null;reject(e instanceof Error?e:new Error(String(e||'IndexedDB 打开失败')));}
    try{
      var idb=WIN.indexedDB||window.indexedDB;
      if(!idb){fail(new Error('IndexedDB 不可用'));return;}
      tm=WIN.setTimeout(function(){fail(new Error('HUD IndexedDB 打开超时；可能有旧标签页占用数据库'));},PK_RUNTIME_OPEN_TIMEOUT);
      req=idb.open(PK_RUNTIME_DB,1);
      req.onupgradeneeded=function(){try{if(!req.result.objectStoreNames.contains(PK_RUNTIME_STORE))req.result.createObjectStore(PK_RUNTIME_STORE);}catch(e){fail(e);}};
      req.onblocked=function(){fail(new Error('HUD IndexedDB 被其它旧页面阻塞，请关闭旧页面后重试'));};
      req.onsuccess=function(){if(done){try{req.result.close();}catch(e){}return;}done=true;if(tm)WIN.clearTimeout(tm);try{req.result.onversionchange=function(){try{req.result.close();}catch(e){}pkDbPromise=null;};}catch(e){}resolve(req.result);};
      req.onerror=function(){fail(req.error||new Error('IndexedDB 打开失败'));};
    }catch(e){fail(e);}
  });
  return pkDbPromise;
}
function pkSlotRead(key){
  return pkDbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var done=false,tx=null,tm=0;
      function fin(ok,v){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);ok?resolve(v):reject(v);}
      try{
        tx=db.transaction(PK_RUNTIME_STORE,'readonly');
        tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}fin(false,new Error('HUD IndexedDB 读取超时'));},PK_RUNTIME_TX_TIMEOUT);
        var r=tx.objectStore(PK_RUNTIME_STORE).get(key);
        r.onsuccess=function(){fin(true,r.result||null);};
        r.onerror=function(){fin(false,r.error||new Error('IndexedDB 读取失败'));};
        tx.onabort=function(){if(!done)fin(false,tx.error||new Error('IndexedDB 读取中止'));};
      }catch(e){fin(false,e);}
    });
  });
}
function pkSlotWrite(entries){
  return pkDbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var done=false,tx=null,tm=0;
      function fin(ok,v){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);ok?resolve(v):reject(v);}
      try{
        tx=db.transaction(PK_RUNTIME_STORE,'readwrite');
        tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}fin(false,new Error('HUD IndexedDB 写入超时'));},PK_RUNTIME_TX_TIMEOUT);
        var st=tx.objectStore(PK_RUNTIME_STORE);
        for(var i=0;i<entries.length;i++){if(entries[i][1]===null)st.delete(entries[i][0]);else st.put(entries[i][1],entries[i][0]);}
        tx.oncomplete=function(){fin(true,true);};
        tx.onerror=function(){fin(false,tx.error||new Error('IndexedDB 写入失败'));};
        tx.onabort=function(){if(!done)fin(false,tx.error||new Error('IndexedDB 写入中止'));};
      }catch(e){fin(false,e);}
    });
  });
}
function pkInstallRecord(ver,content){
  return pkSha256Text(content).then(function(contentSha){
    var rec={id:PK_RUNTIME_DB,version:ver,content:content,contentSha:contentSha||'',health:'pending',installedAt:Date.now()};
    return pkDbOpen().then(function(db){
      return new Promise(function(resolve,reject){
        var done=false,tx=null,tm=0;
        function fin(ok,v){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);ok?resolve(v):reject(v);}
        try{
          tx=db.transaction(PK_RUNTIME_STORE,'readwrite');
          tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}fin(false,new Error('HUD 更新包写入超时'));},PK_RUNTIME_TX_TIMEOUT);
          var st=tx.objectStore(PK_RUNTIME_STORE),r=st.get('active');
          r.onsuccess=function(){try{if(r.result)st.put(r.result,'previous');else st.delete('previous');st.put(rec,'active');}catch(e){fin(false,e);}};
          r.onerror=function(){fin(false,r.error||new Error('读取旧版本失败'));};
          tx.oncomplete=function(){fin(true,true);};
          tx.onerror=function(){fin(false,tx.error||new Error('存储不足，未安装'));};
          tx.onabort=function(){if(!done)fin(false,tx.error||new Error('更新写入中止'));};
        }catch(e){fin(false,e);}
      });
    });
  });
}
function pkRollbackRecord(){
  return pkSlotRead('previous').then(function(prev){return pkSlotWrite([['active',prev||null],['previous',null]]).then(function(){return prev?prev.version:'内置版';});});
}
function pkMarkHealthy(ver){
  return pkSlotRead('active').then(function(a){if(!a||a.version!==ver)return false;a.health='healthy';a.healthyAt=Date.now();return pkSlotWrite([['active',a]]).then(function(){return true;});});
}
function pkRollbackPending(ver){
  return pkSlotRead('active').then(function(a){if(!a||a.version!==ver||a.health==='healthy')return false;return pkRollbackRecord().then(function(){return true;});});
}
async function pkValidRecord(r){
  if(!(r&&r.id===PK_RUNTIME_DB&&typeof r.content==='string'&&r.content.indexOf('PK_VER')>=0&&r.content.indexOf('pkm-hud-btn')>=0))return false;
  if(r.contentSha){var h=await pkSha256Text(r.content);if(!h||h!==String(r.contentSha))return false;}
  try{new Function(r.content);}catch(e){return false;}
  return true;
}
function runPkmHud(boot){
/* ===== v1.8.0 统一生命周期 / 诊断 / 网络 / 缓存基础层 ===== */
var HUD_SCOPE_KEY='__pkmHudScope_v180';
try{var __oldScope=WIN[HUD_SCOPE_KEY];if(__oldScope&&typeof __oldScope.destroy==='function')__oldScope.destroy();}catch(e){}
function createHudScope(){
  var timers=new Set(),intervals=new Set(),cleanups=[],observers=new Set(),controllers=new Set(),dead=false;
  return {
    setTimeout:function(fn,ms){if(dead)return 0;var args=[].slice.call(arguments,2),id=WIN.setTimeout(function(){timers.delete(id);if(!dead)try{fn.apply(null,args);}catch(e){hudDiagError('timer',e);}},ms);timers.add(id);return id;},
    clearTimeout:function(id){try{WIN.clearTimeout(id);}catch(e){}timers.delete(id);},
    setInterval:function(fn,ms){if(dead)return 0;var args=[].slice.call(arguments,2),id=WIN.setInterval(function(){if(!dead)try{fn.apply(null,args);}catch(e){hudDiagError('interval',e);}},ms);intervals.add(id);return id;},
    clearInterval:function(id){try{WIN.clearInterval(id);}catch(e){}intervals.delete(id);},
    listen:function(target,type,fn,opt){if(!target||typeof target.addEventListener!=='function')return fn;target.addEventListener(type,fn,opt);cleanups.push(function(){try{target.removeEventListener(type,fn,opt);}catch(e){}});return fn;},
    emitter:function(src,type,fn){if(!src||typeof src.on!=='function')return fn;try{src.on(type,fn);cleanups.push(function(){try{if(typeof src.off==='function')src.off(type,fn);else if(typeof src.removeListener==='function')src.removeListener(type,fn);else if(typeof src.removeEventListener==='function')src.removeEventListener(type,fn);}catch(e){}});}catch(e){hudDiagError('eventSource bind',e);}return fn;},
    observe:function(ob){if(ob)observers.add(ob);return ob;},
    controller:function(c){if(c)controllers.add(c);return c;},
    uncontroller:function(c){controllers.delete(c);},
    cleanup:function(fn){if(typeof fn==='function')cleanups.push(fn);},
    destroy:function(){if(dead)return;dead=true;timers.forEach(function(id){try{WIN.clearTimeout(id);}catch(e){}});intervals.forEach(function(id){try{WIN.clearInterval(id);}catch(e){}});observers.forEach(function(o){try{o.disconnect();}catch(e){}});controllers.forEach(function(c){try{c.abort();}catch(e){}});for(var i=cleanups.length-1;i>=0;i--)try{cleanups[i]();}catch(e){}timers.clear();intervals.clear();observers.clear();controllers.clear();cleanups.length=0;},
    get destroyed(){return dead;},get timerCount(){return timers.size;},get intervalCount(){return intervals.size;},get observerCount(){return observers.size;},get controllerCount(){return controllers.size;}
  };
}
var hudDiag={startedAt:Date.now(),errors:[],events:[],counters:Object.create(null),activeRequests:0,maxActiveRequests:0};
function hudDiagInc(k,n){hudDiag.counters[k]=(Number(hudDiag.counters[k])||0)+(n==null?1:Number(n)||0);return hudDiag.counters[k];}
function hudDiagEvent(type,detail){hudDiag.events.push({at:Date.now(),type:String(type||'event'),detail:String(detail||'').slice(0,600)});if(hudDiag.events.length>60)hudDiag.events.splice(0,hudDiag.events.length-60);}
function hudDiagError(area,e){var row={at:Date.now(),area:String(area||'unknown'),name:String(e&&e.name||'Error'),message:String(e&&e.message||e||'').slice(0,900)};hudDiag.errors.push(row);if(hudDiag.errors.length>60)hudDiag.errors.splice(0,hudDiag.errors.length-60);hudDiagInc('errors');return row;}
var hudScope=createHudScope();
try{WIN[HUD_SCOPE_KEY]=hudScope;}catch(e){}
hudScope.cleanup(function(){try{if(WIN[HUD_SCOPE_KEY]===hudScope)delete WIN[HUD_SCOPE_KEY];}catch(e){}});
function hudNewAbortController(){
  try{var C=WIN.AbortController||(typeof AbortController!=='undefined'?AbortController:null);if(C)return new C();}catch(e){}
  return {signal:null,abort:function(){}};
}
function hudFetch(url,opt){
  opt=opt&&typeof opt==='object'?Object.assign({},opt):{};
  var timeout=Math.max(1000,Math.min(120000,Number(opt.timeout)||30000)),outerSignal=opt.signal;delete opt.timeout;
  var ctl=hudScope.controller(hudNewAbortController()),done=false,tm=0,timedOut=false;
  if(outerSignal){if(outerSignal.aborted){try{ctl.abort();}catch(e){}}else try{outerSignal.addEventListener('abort',function(){try{ctl.abort();}catch(e){}},{once:true});}catch(e){}}
  if(ctl.signal)opt.signal=ctl.signal;else delete opt.signal;
  hudDiagInc('fetch');hudDiag.activeRequests++;hudDiag.maxActiveRequests=Math.max(hudDiag.maxActiveRequests,hudDiag.activeRequests);
  var req=WIN.fetch(url,opt);
  var guarded;if(ctl.signal){tm=WIN.setTimeout(function(){if(done)return;timedOut=true;try{ctl.abort();}catch(e){}},timeout);guarded=req;}
  else{guarded=Promise.race([req,new Promise(function(_,rej){tm=WIN.setTimeout(function(){if(done)return;timedOut=true;var e=new Error('请求超时');e.name='TimeoutError';rej(e);},timeout);})]);}
  return guarded.catch(function(e){if(timedOut&&e&&e.name==='AbortError'){try{e.message='请求超时';}catch(_){} }hudDiagError('fetch '+String(url).slice(0,180),e);throw e;}).finally(function(){done=true;if(tm)WIN.clearTimeout(tm);hudScope.uncontroller(ctl);hudDiag.activeRequests=Math.max(0,hudDiag.activeRequests-1);});
}

/* 可重建百科/sprite 缓存迁入 IndexedDB；设置仍留 localStorage。 */
var HUD_CACHE_DB='pk_hud_cache_v2',HUD_CACHE_STORE='kv',HUD_CACHE_TTL=90*24*60*60*1000,HUD_CACHE_MAX_ENTRIES=2500,hudCacheDbP=null,hudCacheMem=Object.create(null),hudCacheReady=false,hudCacheLastTouch=Object.create(null);
function hudIsCacheKey(k){k=String(k||'');return /^(?:pk_sprite_|pk_slug_|pk_ndex_|pk_mv_|pk_pm_|pk_ab_|pk_fid_|pk_item_|pk_itemimg_|pk_ps_|pk_psf_)/.test(k)||['pk_dexlist','pk_itemlist','pk_abilist'].indexOf(k)>=0;}
function hudCacheDb(){if(hudCacheDbP)return hudCacheDbP;hudCacheDbP=new Promise(function(res,rej){try{var idb=WIN.indexedDB||window.indexedDB;if(!idb)throw new Error('IndexedDB 不可用');var rq=idb.open(HUD_CACHE_DB,1),done=false,tm=WIN.setTimeout(function(){if(done)return;done=true;hudCacheDbP=null;rej(new Error('HUD cache IndexedDB 打开超时'));},5000);rq.onupgradeneeded=function(){if(!rq.result.objectStoreNames.contains(HUD_CACHE_STORE))rq.result.createObjectStore(HUD_CACHE_STORE,{keyPath:'k'});};rq.onblocked=function(){if(done)return;done=true;WIN.clearTimeout(tm);hudCacheDbP=null;rej(new Error('HUD cache IndexedDB 被阻塞'));};rq.onsuccess=function(){if(done){try{rq.result.close();}catch(e){}return;}done=true;WIN.clearTimeout(tm);var db=rq.result;db.onversionchange=function(){try{db.close();}catch(e){}hudCacheDbP=null;};res(db);};rq.onerror=function(){if(done)return;done=true;WIN.clearTimeout(tm);hudCacheDbP=null;rej(rq.error||new Error('HUD cache IndexedDB 打开失败'));};}catch(e){hudCacheDbP=null;rej(e);}});return hudCacheDbP;}
function hudCachePut(k,v){var now=Date.now();hudCacheMem[k]=v;hudCacheLastTouch[k]=now;return hudCacheDb().then(function(db){return new Promise(function(res,rej){var tx=db.transaction(HUD_CACHE_STORE,'readwrite');tx.objectStore(HUD_CACHE_STORE).put({k:k,v:v,t:now});var tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}rej(new Error('cache 写入超时'));},5000);tx.oncomplete=function(){WIN.clearTimeout(tm);res(true);};tx.onerror=tx.onabort=function(){WIN.clearTimeout(tm);rej(tx.error||new Error('cache 写入失败'));};});}).catch(function(e){hudDiagError('cache put',e);return false;});}
function hudCacheTouch(k){var now=Date.now(),last=Number(hudCacheLastTouch[k]||0);if(!Object.prototype.hasOwnProperty.call(hudCacheMem,k)||now-last<6*60*60*1000)return;hudCacheLastTouch[k]=now;hudCachePut(k,hudCacheMem[k]);}
function hudCachePutMany(rows){rows=(rows||[]).filter(function(r){return r&&r.length>=2&&r[0]!=null;});if(!rows.length)return Promise.resolve(true);var now=Date.now();rows.forEach(function(r){hudCacheMem[r[0]]=r[1];hudCacheLastTouch[r[0]]=now;});return hudCacheDb().then(function(db){return new Promise(function(res,rej){var tx=null,done=false,tm=0;function fin(ok,v){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);ok?res(v):rej(v);}try{tx=db.transaction(HUD_CACHE_STORE,'readwrite');var st=tx.objectStore(HUD_CACHE_STORE);rows.forEach(function(r){st.put({k:r[0],v:r[1],t:now});});tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}fin(false,new Error('cache 批量写入超时'));},8000);tx.oncomplete=function(){fin(true,true);};tx.onerror=function(){fin(false,tx.error||new Error('cache 批量写入失败'));};tx.onabort=function(){if(!done)fin(false,tx.error||new Error('cache 批量写入中止'));};}catch(e){fin(false,e);}});}).catch(function(e){hudDiagError('cache putMany',e);return false;});}
function hudCacheDeleteKeys(keys){keys=(keys||[]).filter(Boolean);keys.forEach(function(k){delete hudCacheMem[k];delete hudCacheLastTouch[k];});if(!keys.length)return Promise.resolve(true);return hudCacheDb().then(function(db){return new Promise(function(res,rej){var tx=null,done=false,tm=0;function fin(ok,v){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);ok?res(v):rej(v);}try{tx=db.transaction(HUD_CACHE_STORE,'readwrite');var st=tx.objectStore(HUD_CACHE_STORE);keys.forEach(function(k){st.delete(k);});tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}fin(false,new Error('cache delete timeout'));},5000);tx.oncomplete=function(){fin(true,true);};tx.onerror=function(){fin(false,tx.error||new Error('cache delete failed'));};tx.onabort=function(){if(!done)fin(false,tx.error||new Error('cache delete aborted'));};}catch(e){fin(false,e);}});}).catch(function(e){hudDiagError('cache delete',e);return false;});}
function hudCacheDeletePrefixes(prefixes){
  prefixes=prefixes||[];Object.keys(hudCacheMem).forEach(function(k){if(prefixes.some(function(p){return k.indexOf(p)===0;})){delete hudCacheMem[k];delete hudCacheLastTouch[k];}});
  return hudCacheDb().then(function(db){return new Promise(function(res,rej){var tx=null,done=false,tm=0;function fin(ok,v){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);ok?res(v):rej(v);}try{tx=db.transaction(HUD_CACHE_STORE,'readwrite');var st=tx.objectStore(HUD_CACHE_STORE),rq=st.openCursor();tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}fin(false,new Error('cache clear timeout'));},6000);rq.onsuccess=function(){var c=rq.result;if(!c)return;var k=String(c.key||'');if(prefixes.some(function(p){return k.indexOf(p)===0;}))c.delete();c.continue();};rq.onerror=function(){fin(false,rq.error||new Error('cache clear failed'));};tx.oncomplete=function(){fin(true,true);};tx.onerror=function(){fin(false,tx.error||new Error('cache clear tx failed'));};tx.onabort=function(){if(!done)fin(false,tx.error||new Error('cache clear aborted'));};}catch(e){fin(false,e);}});}).catch(function(e){hudDiagError('cache clear',e);return false;});
}

var hudCacheInitPromise=null;
function hudCacheInit(){
  if(hudCacheInitPromise)return hudCacheInitPromise;
  /* 先迁移旧 localStorage，保证本次会话同步可读；确认 IDB 保存后才删旧副本。 */
  try{
    var legacy=[];
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);if(!hudIsCacheKey(k))continue;
      var raw=localStorage.getItem(k),v=raw;try{v=JSON.parse(raw);}catch(e){}
      hudCacheMem[k]=v;legacy.push([k,v]);
    }
    if(legacy.length)hudCachePutMany(legacy).then(function(ok){if(ok)legacy.forEach(function(x){try{localStorage.removeItem(x[0]);}catch(e){}});});
  }catch(e){hudDiagError('cache legacy migrate',e);}
  hudCacheInitPromise=hudCacheDb().then(function(db){return new Promise(function(res,rej){
    var tx=null,done=false,tm=0;
    function fin(ok,v){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);ok?res(v):rej(v);}
    try{
      tx=db.transaction(HUD_CACHE_STORE,'readonly');var rq=tx.objectStore(HUD_CACHE_STORE).getAll();
      tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}fin(false,new Error('HUD cache 预加载超时'));},5000);
      rq.onsuccess=function(){var rows=(rq.result||[]),now=Date.now(),remove=[];rows.sort(function(a,b){return Number(b&&b.t||0)-Number(a&&a.t||0);});var kept=0;rows.forEach(function(r){if(!r||r.k==null)return;var t=Number(r.t||now),expired=(now-t)>HUD_CACHE_TTL;if(expired||kept>=HUD_CACHE_MAX_ENTRIES){remove.push(String(r.k));return;}kept++;hudCacheLastTouch[r.k]=t;if(hudCacheMem[r.k]===undefined)hudCacheMem[r.k]=r.v;});hudCacheReady=true;hudDiagInc('cachePruned',remove.length);fin(true,true);if(remove.length)hudScope.setTimeout(function(){hudCacheDeleteKeys(remove);},0);};
      rq.onerror=function(){fin(false,rq.error||new Error('HUD cache 预加载失败'));};
      tx.onabort=function(){if(!done)fin(false,tx.error||new Error('HUD cache 预加载中止'));};
    }catch(e){fin(false,e);}
  });}).catch(function(e){hudDiagError('cache preload',e);return false;});
  return hudCacheInitPromise;
}
hudCacheInitPromise=hudCacheInit();
hudScope.cleanup(function(){try{var q=hudCacheDbP;if(q&&typeof q.then==='function')q.then(function(db){try{db.close();}catch(e){}}).catch(function(){});}catch(e){}hudCacheDbP=null;});

/* 与 Phone Suite 共用 pk_diy_assets_v1，DIY 本地图不再常驻 localStorage DataURL。 */
var HUD_DIY_ASSET_DB='pk_diy_assets_v1',HUD_DIY_ASSET_STORE='assets',HUD_DIY_SCHEME='pkidb://',hudDiyAssetDbP=null,hudDiyBlobByRef=Object.create(null),hudDiyRefByBlob=Object.create(null),hudDiyResolvePending=Object.create(null),hudVisualRefreshTimer=0;
function hudDiyAssetDb(){if(hudDiyAssetDbP)return hudDiyAssetDbP;hudDiyAssetDbP=new Promise(function(res,rej){try{var idb=WIN.indexedDB||window.indexedDB;if(!idb)throw new Error('IndexedDB 不可用');var rq=idb.open(HUD_DIY_ASSET_DB,1),done=false,tm=WIN.setTimeout(function(){if(done)return;done=true;hudDiyAssetDbP=null;rej(new Error('DIY 图片库打开超时'));},6000);rq.onupgradeneeded=function(){if(!rq.result.objectStoreNames.contains(HUD_DIY_ASSET_STORE)){var st=rq.result.createObjectStore(HUD_DIY_ASSET_STORE,{keyPath:'id'});try{st.createIndex('created_at','created_at',{unique:false});}catch(e){}}};rq.onblocked=function(){if(done)return;done=true;WIN.clearTimeout(tm);hudDiyAssetDbP=null;rej(new Error('DIY 图片库被阻塞'));};rq.onsuccess=function(){if(done){try{rq.result.close();}catch(e){}return;}done=true;WIN.clearTimeout(tm);var db=rq.result;db.onversionchange=function(){try{db.close();}catch(e){}hudDiyAssetDbP=null;};res(db);};rq.onerror=function(){if(done)return;done=true;WIN.clearTimeout(tm);hudDiyAssetDbP=null;rej(rq.error||new Error('DIY 图片库打开失败'));};}catch(e){hudDiyAssetDbP=null;rej(e);}});return hudDiyAssetDbP;}
function hudBlobHash(blob){try{var c=WIN.crypto||crypto;if(!c||!c.subtle)return Promise.resolve('asset_'+Date.now()+'_'+Math.random().toString(36).slice(2));return blob.arrayBuffer().then(function(ab){return c.subtle.digest('SHA-256',ab);}).then(function(d){return 'sha256_'+Array.prototype.slice.call(new Uint8Array(d),0,16).map(function(x){return x.toString(16).padStart(2,'0');}).join('');});}catch(e){return Promise.resolve('asset_'+Date.now()+'_'+Math.random().toString(36).slice(2));}}
function hudDataUrlBlob(v){var m=String(v||'').match(/^data:(image\/[^;,]+);base64,(.*)$/s);if(!m)throw new Error('不是图片 DataURL');var bin=atob(m[2].replace(/\s+/g,'')),a=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:m[1]||'image/png'});}
function hudDiyAssetStoreBlob(blob){if(!blob||!/^image\//i.test(String(blob.type||'')))return Promise.reject(new Error('仅支持图片'));return hudBlobHash(blob).then(function(id){return hudDiyAssetDb().then(function(db){return new Promise(function(res,rej){var tx=db.transaction(HUD_DIY_ASSET_STORE,'readwrite');tx.objectStore(HUD_DIY_ASSET_STORE).put({id:id,blob:blob,type:blob.type||'image/png',size:Number(blob.size||0),created_at:Date.now()});var tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}rej(new Error('DIY 图片写入超时'));},7000);tx.oncomplete=function(){WIN.clearTimeout(tm);var ref=HUD_DIY_SCHEME+id;try{var old=hudDiyBlobByRef[ref];if(old)URL.revokeObjectURL(old);var u=URL.createObjectURL(blob);hudDiyBlobByRef[ref]=u;hudDiyRefByBlob[u]=ref;}catch(e){}res(ref);};tx.onerror=tx.onabort=function(){WIN.clearTimeout(tm);rej(tx.error||new Error('DIY 图片写入失败'));};});});});}
function hudDiyAssetGet(ref){var id=String(ref||'').indexOf(HUD_DIY_SCHEME)===0?String(ref).slice(HUD_DIY_SCHEME.length):'';if(!id)return Promise.resolve(null);return hudDiyAssetDb().then(function(db){return new Promise(function(res,rej){var tx=db.transaction(HUD_DIY_ASSET_STORE,'readonly'),rq=tx.objectStore(HUD_DIY_ASSET_STORE).get(id);var tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}rej(new Error('DIY 图片读取超时'));},6000);rq.onsuccess=function(){WIN.clearTimeout(tm);res(rq.result||null);};rq.onerror=function(){WIN.clearTimeout(tm);rej(rq.error||new Error('DIY 图片读取失败'));};});});}
function hudScheduleVisualRefresh(){if(hudVisualRefreshTimer)return;hudVisualRefreshTimer=hudScope.setTimeout(function(){hudVisualRefreshTimer=0;try{pkmHudRenderCurrent();}catch(e){}try{if(overlay)hudResolvePkidbImages(overlay);}catch(e){}try{if(pageOverlay)hudResolvePkidbImages(pageOverlay);}catch(e){}},80);}
function hudDiyAssetResolve(ref){ref=String(ref||'');if(ref.indexOf(HUD_DIY_SCHEME)!==0)return Promise.resolve(ref);if(hudDiyBlobByRef[ref])return Promise.resolve(hudDiyBlobByRef[ref]);if(hudDiyResolvePending[ref])return hudDiyResolvePending[ref];hudDiyResolvePending[ref]=hudDiyAssetGet(ref).then(function(rec){if(!rec||!rec.blob)return '';var u=URL.createObjectURL(rec.blob);hudDiyBlobByRef[ref]=u;hudDiyRefByBlob[u]=ref;hudScheduleVisualRefresh();return u;}).catch(function(e){hudDiagError('DIY asset resolve',e);return '';}).finally(function(){delete hudDiyResolvePending[ref];});return hudDiyResolvePending[ref];}
function hudDiyAssetResolveSync(ref){ref=String(ref||'');if(ref.indexOf(HUD_DIY_SCHEME)!==0)return ref;if(hudDiyBlobByRef[ref])return hudDiyBlobByRef[ref];hudDiyAssetResolve(ref);return '';}
/* v1.8.10：Phone Suite / 创意工坊 DIY 图片持久化正式桥。
 * HUD 内部的 blob: URL 只属于当前运行时 realm，不能作为交换/云仓/DIY 包的永久数据。
 * canonicalizeImageRef() 先把 HUD 自己生成的 blob: O(1) 还原为 pkidb://；
 * persistImageValue() 仅在确有必要时把 data:/blob: 转存到共用 pk_diy_assets_v1。 */
function hudDiyAssetCanonicalRef(value){
  var v=String(value||'').trim();
  if(!v)return '';
  if(v.indexOf(HUD_DIY_SCHEME)===0)return v;
  if(/^blob:/i.test(v)&&hudDiyRefByBlob[v])return String(hudDiyRefByBlob[v]||'');
  return v;
}
async function hudDiyAssetPersistValue(value){
  var v=hudDiyAssetCanonicalRef(value);if(!v)return '';
  if(v.indexOf(HUD_DIY_SCHEME)===0){
    var rec=await hudDiyAssetGet(v);
    if(!rec||!rec.blob)throw new Error('HUD 本地图片引用已丢失');
    return v;
  }
  if(/^data:image\//i.test(v))return await hudDiyAssetStoreBlob(hudDataUrlBlob(v));
  if(/^blob:/i.test(v)){
    var known=hudDiyRefByBlob[v];
    if(known){
      var knownRec=await hudDiyAssetGet(known);
      if(knownRec&&knownRec.blob)return known;
    }
    /* blob URL 必须在创建它的 realm 读取。优先当前 HUD iframe，再尝试 WIN；
       Phone Suite 自己也会跨同源窗口枚举，这里保持小而确定的兜底。 */
    var wins=[];
    try{wins.push(window);}catch(e){}
    try{if(WIN&&wins.indexOf(WIN)<0)wins.push(WIN);}catch(e){}
    var last=null;
    for(var i=0;i<wins.length;i++){
      var w=wins[i];
      try{
        if(!w||typeof w.fetch!=='function')continue;
        var r=await w.fetch(v,{credentials:'omit',referrerPolicy:'no-referrer'});
        if(!r.ok)throw new Error('HTTP '+r.status);
        var b=await r.blob();
        if(!/^image\//i.test(String(b.type||'')))throw new Error('blob 不是图片');
        return await hudDiyAssetStoreBlob(b);
      }catch(e){last=e;}
    }
    throw last||new Error('HUD blob 已失效');
  }
  /* https: 等远程地址保持原值，交给 Phone Suite 自己决定是否需要持久化。 */
  return v;
}
function hudDiyAssetToDataUrl(ref){ref=String(ref||'');if(/^data:image\//i.test(ref))return Promise.resolve(ref);if(ref.indexOf(HUD_DIY_SCHEME)!==0)return Promise.resolve(ref);return hudDiyAssetGet(ref).then(function(rec){if(!rec||!rec.blob)throw new Error('本地 DIY 图片引用已丢失');return new Promise(function(res,rej){var rd=new FileReader();rd.onload=function(){res(String(rd.result||''));};rd.onerror=function(){rej(new Error('DIY 图片读取失败'));};rd.readAsDataURL(rec.blob);});});}
function hudDiyImgAttrs(ref){ref=String(ref||'').trim();if(ref.indexOf(HUD_DIY_SCHEME)===0){var u=hudDiyAssetResolveSync(ref);return (u?'src="'+esc(u)+'" ':'src="" ')+'data-pkidb="'+esc(ref)+'"';}return 'src="'+esc(ref)+'"';}
function hudResolvePkidbImages(root){try{var list=(root||document).querySelectorAll('img[data-pkidb]');for(var i=0;i<list.length;i++)(function(el){var ref=el.getAttribute('data-pkidb');hudDiyAssetResolve(ref).then(function(u){if(u&&el&&el.isConnected)el.src=u;});})(list[i]);}catch(e){hudDiagError('DIY hydrate DOM',e);}}
hudScope.cleanup(function(){try{var q=hudDiyAssetDbP;if(q&&typeof q.then==='function')q.then(function(db){try{db.close();}catch(e){}}).catch(function(){});}catch(e){}hudDiyAssetDbP=null;Object.keys(hudDiyBlobByRef).forEach(function(r){try{URL.revokeObjectURL(hudDiyBlobByRef[r]);}catch(e){}});hudDiyBlobByRef={};hudDiyRefByBlob={};});
var css='#pkm-hud-win,#pkm-hud-inline{--frame:#7d95b5;--text:#c6d1e4;--dim:#8ba0b8;--hp:#32CD32;--male:#00BFFF;--female:#FF4500}'+
':where(#pkm-hud-win,#pkm-hud-inline) *{box-sizing:border-box;margin:0;padding:0}:where(#pkm-hud-btn){box-sizing:border-box}'+
'#pkm-hud-win,#pkm-hud-inline{font-family:"Segoe UI","Helvetica Neue","PingFang SC","Microsoft YaHei",monospace;color:var(--text)}'+
'.hud{--hud-pad:clamp(10px,3vw,14px);max-width:600px;margin:16px auto;padding:var(--hud-pad);border-radius:10px;position:relative;background-color:#0f1626;box-shadow:0 8px 24px rgba(0,0,0,.6);display:flex;flex-direction:column;overflow:hidden}'+
'.hud::before{content:"";position:absolute;top:0;left:0;right:0;bottom:0;border-radius:inherit;z-index:0;pointer-events:none;background-image:repeating-linear-gradient(0deg,rgba(150,180,220,.14) 0 2px,transparent 2px 10px,rgba(255,255,255,.05) 10px 11px,transparent 11px 20px,rgba(255,255,255,.05) 20px 21px,transparent 21px 30px,rgba(255,255,255,.05) 30px 31px,transparent 31px 40px,rgba(255,255,255,.05) 40px 41px,transparent 41px 50px),repeating-linear-gradient(90deg,rgba(150,180,220,.14) 0 2px,transparent 2px 10px,rgba(255,255,255,.05) 10px 11px,transparent 11px 20px,rgba(255,255,255,.05) 20px 21px,transparent 21px 30px,rgba(255,255,255,.05) 30px 31px,transparent 31px 40px,rgba(255,255,255,.05) 40px 41px,transparent 41px 50px)}'+
'.hud-inner{position:relative;z-index:1;flex:0 0 auto;height:560px;overflow:hidden}'+'@media(max-width:430px){.hud-inner{height:470px}}'+
'.tab-panel{display:none;height:100%;max-height:none;overflow-y:auto;overflow-x:hidden;padding-right:4px;overscroll-behavior:contain;-webkit-overscroll-behavior:contain}'+
'.tab-panel.active{display:block}'+
'.tab-panel::-webkit-scrollbar{width:5px}'+
'.tab-panel::-webkit-scrollbar-thumb{background:rgba(170,204,255,.4);border-radius:3px}'+
'.tab-bar{position:relative;z-index:2;flex:0 0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}'+
'.tab-btn{padding:6px 0;font-family:inherit;font-size:.78rem;font-weight:800;text-align:center;border:1px solid var(--frame);background:rgba(170,204,255,.12);color:var(--text);border-radius:4px;cursor:pointer}'+
'.tab-btn.active{background:rgba(43,74,111,.8);color:#fff}'+
'.menu-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:clamp(8px,2vw,12px)}'+
'.menu-item{position:relative;background:rgba(43,74,111,.35);border:1px solid var(--frame);border-radius:0;cursor:pointer;transition:background .15s,transform .08s}'+
'.menu-item:hover{background:rgba(170,204,255,.10)}'+
'.menu-item:active{transform:translateY(2px)}'+
'.menu-item-inner{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 6px;min-height:60px}'+
'.menu-icon-wrap{display:flex;align-items:center;justify-content:center;height:30px}'+
'.menu-icon{width:30px;height:30px;object-fit:contain;image-rendering:pixelated}'+
'.menu-emoji{font-size:1.35rem;line-height:1}'+
'.menu-label{font-size:.78rem;font-weight:800;color:var(--text);text-shadow:1px 1px 0 #000}'+
'.menu-badge{display:inline-block;margin-left:4px;padding:0 4px;border-radius:8px;background:#e05050;color:#fff;font-size:.6rem;font-weight:800;line-height:14px;vertical-align:top}'+
'.card-bg-svg{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}'+
'.page-overlay{position:absolute;inset:0;background:rgba(10,16,30,.45);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:none;align-items:center;justify-content:center;z-index:500;padding:12px}'+
'.page-overlay.open{display:flex}'+
'.page{position:relative;width:100%;max-width:600px;max-height:100%;overflow-y:auto;background-color:#0f1626;border:2px solid var(--frame);border-radius:10px;box-shadow:0 0 14px rgba(170,204,255,.5)}'+
'.page-overlay.popout{position:fixed;inset:0;z-index:2147483601;padding:10px;align-items:center;align-items:safe center;justify-content:center}'+
'.page-overlay.popout.map-focus{z-index:2147483647;background:radial-gradient(circle at 50% 46%,rgba(19,35,58,.20) 0,rgba(7,12,24,.64) 58%,rgba(4,8,18,.78) 100%);backdrop-filter:blur(12px) saturate(.74) brightness(.66);-webkit-backdrop-filter:blur(12px) saturate(.74) brightness(.66);isolation:isolate;overscroll-behavior:contain}'+
'.page-overlay.popout.map-focus:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(12,22,38,.10),rgba(3,7,16,.22));z-index:0}'+
'.page-overlay.popout.map-focus .page{position:relative;z-index:1;filter:none;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 18px 60px rgba(0,0,0,.58),0 0 0 1px rgba(124,196,248,.10)}'+
'.hud.page-child-open>:not(.page-overlay),.hud.modal-child-open>:not(.overlay){pointer-events:none!important}'+
'.page-overlay.popout .page{box-sizing:border-box;max-width:min(94vw,900px);max-height:86vh;overflow:hidden}'+
'.page-overlay.popout .page-body{max-height:calc(86vh - 44px);overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}'+
'.page-overlay.popout .page::before{background-image:none}'+
'.page::before{content:"";position:absolute;top:0;left:0;right:0;bottom:0;border-radius:8px;z-index:0;pointer-events:none;background-image:repeating-linear-gradient(0deg,rgba(150,180,220,.14) 0 2px,transparent 2px 10px,rgba(255,255,255,.05) 10px 11px,transparent 11px 20px,rgba(255,255,255,.05) 20px 21px,transparent 21px 30px,rgba(255,255,255,.05) 30px 31px,transparent 31px 40px,rgba(255,255,255,.05) 40px 41px,transparent 41px 50px),repeating-linear-gradient(90deg,rgba(150,180,220,.14) 0 2px,transparent 2px 10px,rgba(255,255,255,.05) 10px 11px,transparent 11px 20px,rgba(255,255,255,.05) 20px 21px,transparent 21px 30px,rgba(255,255,255,.05) 30px 31px,transparent 31px 40px,rgba(255,255,255,.05) 40px 41px,transparent 41px 50px)}'+
'.page-head{position:relative;z-index:2;display:flex;align-items:center;justify-content:flex-end;padding:4px 10px;border-bottom:1px solid rgba(170,204,255,.3);background:rgba(43,74,111,.7);position:sticky;top:0}'+
'.page-close{background:none;border:none;color:var(--text);font-size:1.3rem;cursor:pointer;opacity:.8}'+
'.page-close:hover{opacity:1}'+
'.page-body{position:relative;z-index:1;padding:14px}'+
'.grid{display:flex;gap:clamp(6px,2vw,12px);align-items:flex-start}'+
'.col{flex:1 1 0;display:flex;flex-direction:column;gap:clamp(8px,2vw,12px);min-width:0}'+
'.col+.col{margin-top:clamp(8px,3.5vw,18px)}'+
'.card-frame,.empty-frame{position:relative;background:transparent;filter:drop-shadow(0 0 6px rgba(125,149,181,.15))}'+
'.card-frame{cursor:pointer;transition:transform .12s ease,filter .12s ease}'+
'.card-frame:hover{transform:translateY(-2px);filter:drop-shadow(0 0 10px rgba(125,149,181,.3))}'+
'.empty-frame{filter:none}'+
'.card-inner,.empty-inner{position:relative;z-index:1;min-height:clamp(52px,13.5vw,68px)}'+
'.card-inner{display:flex;flex-direction:column;gap:clamp(2px,.6vw,4px);padding:clamp(4px,1vw,6px) clamp(10px,2.2vw,14px)}'+
'.empty-inner{display:flex;align-items:center;justify-content:center}'+
'.empty-txt{color:var(--dim);font-size:clamp(.68rem,2.6vw,.78rem);letter-spacing:2px;opacity:.7}'+
'.pk-top{display:flex;align-items:center;gap:clamp(5px,1.5vw,8px);flex:1;min-height:0}'+
'.pk-side{display:flex;flex-direction:column;align-items:flex-start;flex-shrink:0;padding:0}'+
'.pk-img{width:clamp(26px,8vw,34px);height:clamp(26px,8vw,34px);background-size:contain;background-repeat:no-repeat;background-position:center;image-rendering:pixelated;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}'+
'.pk-img.no-img{display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:1rem;filter:none}'+
'.pk-img.fainted{filter:grayscale(1) brightness(.6) drop-shadow(0 2px 3px rgba(0,0,0,.5))}'+
'.pk-info{flex:1;display:flex;flex-direction:column;justify-content:center;gap:clamp(1px,.4vw,2px);min-width:0}'+
'.name-row{display:flex;justify-content:space-between;align-items:center;gap:6px}'+
'.pk-name{font-weight:800;font-size:clamp(.74rem,2.8vw,.88rem);color:var(--text);text-shadow:1px 1px 0 #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.shiny{color:#ffe066;text-shadow:0 0 4px rgba(255,224,102,.8);margin-left:3px}'+
'.gender-sym{font-weight:800;font-size:clamp(.85rem,3vw,.95rem);line-height:1;flex-shrink:0}'+
'.gender-sym.m{color:var(--male);text-shadow:0 0 5px rgba(0,191,255,.9)}'+
'.gender-sym.f{color:var(--female);text-shadow:0 0 5px rgba(255,69,0,.9)}'+
'.bar-row{display:flex;align-items:center;gap:clamp(3px,1vw,5px)}'+
'.bar-stack{flex:1;display:flex;flex-direction:column;gap:1px;min-width:0}'+
'.hp-label{font-size:clamp(.56rem,2vw,.62rem);font-weight:800;color:var(--text);opacity:.9;letter-spacing:1px;flex-shrink:0;text-shadow:0 0 2px rgba(0,0,0,.6)}'+
'.hp-bar{width:100%;height:clamp(3px,1vw,5px);background:rgba(0,0,0,.72);border-radius:999px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.6)}'+
'.hp-fill{height:100%;border-radius:999px;transition:width .35s}'+
'.hp-fill.hp-high{background:linear-gradient(180deg,#4ade80,#32CD32);box-shadow:0 0 4px rgba(50,205,50,.7)}'+
'.hp-fill.hp-mid{background:linear-gradient(180deg,#facc15,#eab308);box-shadow:0 0 4px rgba(250,204,21,.7)}'+
'.hp-fill.hp-low{background:linear-gradient(180deg,#f87171,#ef4444);box-shadow:0 0 4px rgba(239,68,68,.7)}'+
'.exp-bar{width:100%;height:clamp(2px,.55vw,3px);background:rgba(0,0,0,.72);border-radius:999px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.6)}'+
'.exp-fill{height:100%;border-radius:999px;background:linear-gradient(180deg,#7cc4f8,#4a9dd8);box-shadow:0 0 3px rgba(124,196,248,.6);transition:width .35s}'+
'.bottom-row{display:flex;justify-content:space-between;align-items:center;width:100%;padding:0 clamp(2px,.6vw,4px)}'+
'.pk-level,.hp-num{font-size:clamp(.66rem,2.5vw,.78rem);font-weight:800;color:var(--text);text-shadow:1px 1px 0 #000;line-height:1}'+
'.hp-num{text-align:right}'+
'.info-frame{position:relative;z-index:1;background:transparent;filter:drop-shadow(0 0 6px rgba(125,149,181,.15));margin-bottom:clamp(10px,2.5vw,14px)}'+
'.info-inner{position:relative;z-index:1;padding:clamp(10px,2.5vw,14px) clamp(12px,3vw,16px) clamp(10px,2.5vw,14px) clamp(8px,2.5vw,12px)}'+
'.info-title{font-weight:800;font-size:clamp(.8rem,3vw,.95rem);color:var(--text);margin-bottom:8px;margin-left:clamp(12px,3.5vw,18px);letter-spacing:1px;text-shadow:1px 1px 0 #000}'+
'.info-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dashed rgba(170,204,255,.25);font-size:clamp(.78rem,2.6vw,.88rem);color:var(--text)}'+
'.info-row:last-child{border-bottom:none}'+
'.info-row .k{color:var(--dim);flex-shrink:0;font-weight:600}'+
'.info-row .v{text-align:right;word-break:break-word}'+'.cmd-panel{border:1px solid var(--frame);border-radius:6px;background:rgba(43,74,111,.22);margin-bottom:10px;padding:0 10px 8px}'+'.cmd-panel>summary{cursor:pointer;font-size:.82rem;font-weight:800;padding:7px 0;list-style:none}'+'.cmd-panel>summary::-webkit-details-marker{display:none}'+'.cmd-note{font-size:.7rem;color:var(--dim);line-height:1.5;padding-bottom:6px}'+'.cmd-row{display:flex;gap:6px;align-items:center;padding:3px 0}'+'.cmd-btn{flex:1;min-width:0;text-align:left;padding:6px 10px;font-family:inherit;font-size:.8rem;color:var(--text);background:rgba(43,74,111,.6);border:1px solid var(--frame);border-radius:4px;cursor:pointer}'+'.cmd-btn:hover{filter:brightness(1.2)}'+'.cmd-tip{flex:0 0 30px;padding:6px 0;font-family:inherit;font-size:.8rem;font-weight:800;color:var(--dim);background:rgba(170,204,255,.12);border:1px solid var(--frame);border-radius:4px;cursor:pointer}'+
'.info-row.cmd{justify-content:space-between;gap:10px;padding-right:clamp(10px,2.5vw,14px)}'+
'.info-row.cmd .v{text-align:right}'+
'.info-row.block{flex-direction:column;align-items:flex-start;gap:2px}'+
'.info-row.block .v{text-align:left;word-break:break-word}'+
'.trainer-frame .info-row{padding-left:clamp(6px,1.5vw,10px)}'+
'.heart{color:#f05060;font-size:.95rem;margin-left:2px}'+
'#badge-cycle{cursor:pointer;border-radius:4px;padding:0 4px}'+
'#badge-cycle:hover{background:rgba(170,204,255,.14)}'+
'.badge-line{display:flex;align-items:center;gap:6px;width:100%;margin-top:3px;padding-left:10px}'+
'#badge-entry .v{width:100%}'+
'.badge-region{font-size:.72rem;color:var(--dim);flex-shrink:0}'+
'.badge-cnt{display:none}'+
'.badge-row{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto}'+
'.badge-cell{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center}'+
'.badge-cell img{width:22px;height:22px;object-fit:contain}'+
'.badge-cell.off img{filter:grayscale(1) brightness(.45);opacity:.45}'+
'.badge-more{font-size:.7rem;color:var(--dim)}'+
'.badge-tabs{display:flex;gap:4px;overflow-x:auto;padding-bottom:6px;margin-bottom:8px}'+
'.badge-tab{flex:0 0 auto;padding:2px 12px;font-family:inherit;font-size:.72rem;border:1px solid var(--frame);background:rgba(170,204,255,.12);color:var(--text);border-radius:4px;cursor:pointer}'+
'.badge-tab.active{background:rgba(43,74,111,.8);color:#fff}'+
'.badge-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}'+
'.badge-item{display:flex;flex-direction:column;align-items:center;gap:2px}'+
'.badge-item img{width:44px;height:44px;object-fit:contain}'+
'.badge-item.off img{filter:grayscale(1) brightness(.45);opacity:.4}'+
'.badge-name{font-size:.66rem;color:var(--text);text-align:center;line-height:1.3}'+
'.badge-item.off .badge-name{color:var(--dim)}'+
'.heart.empty{color:#888;opacity:.35}'+
'.nearby-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px dashed rgba(170,204,255,.25);font-size:.85rem;border-radius:6px;cursor:pointer;transition:background .12s}'+
'.nearby-item:hover{background:rgba(170,204,255,.08)}'+
'.nearby-item:last-child{border-bottom:none}'+
'.nearby-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}'+
'.nearby-name{font-weight:800;font-size:.85rem;color:var(--text)}'+
'.nearby-sub{font-size:.75rem;color:var(--dim)}'+
'.nearby-frame{margin-top:clamp(10px,2.5vw,14px)}'+
'.nearby-scroll{display:flex;gap:clamp(6px,2vw,10px);overflow-x:auto;padding-bottom:6px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}'+
'.nearby-scroll::-webkit-scrollbar{height:4px}'+
'.nearby-scroll::-webkit-scrollbar-thumb{background:rgba(170,204,255,.4);border-radius:3px}'+
'.nearby-card{position:relative;flex:0 0 46%;background:transparent;filter:drop-shadow(0 0 6px rgba(125,149,181,.15));cursor:pointer;scroll-snap-align:start;transition:transform .12s ease,filter .12s ease}'+
'.nearby-card:hover{transform:translateY(-2px);filter:drop-shadow(0 0 10px rgba(125,149,181,.3))}'+
'.nearby-card-inner{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 8px;min-height:64px}'+
'.nearby-card .pk-img{width:32px;height:32px}'+
'.nearby-card-name-row{display:flex;align-items:center;justify-content:center;gap:4px;width:100%}'+
'.nearby-card-name{font-weight:800;font-size:.78rem;color:var(--text);text-align:center;text-shadow:1px 1px 0 #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.nearby-card-count{font-size:.72rem;color:var(--dim)}'+
'.tag{display:inline-block;font-size:.65rem;padding:0 4px;border-radius:3px;margin-left:4px;color:#fff;background:rgba(170,204,255,.35)}'+
'.tag.shiny{background:#f0d848;color:#333}'+
'.tag.boss{background:#c03028}'+
'.ailment{display:inline-block;font-size:.62rem;padding:0 4px;border-radius:3px;margin-left:4px;color:#fff;font-weight:800;background:rgba(170,204,255,.35)}'+
'.ailment.par{background:#f8d830;color:#333}'+
'.ailment.psn{background:#a040a0}'+
'.ailment.brn{background:#f08030}'+
'.ailment.slp{background:#6890f0}'+
'.ailment.frz{background:#98d8d8;color:#123}'+
'.ailment.cnf{background:#f85888}'+
'.ailment.fnt{background:#6b7280;color:#fff}'+
'.gender-side{display:inline-flex;align-items:center;gap:3px;flex-shrink:0}'+
'.types{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}'+
'.type-chip{color:#fff;padding:1px 8px;border-radius:8px;font-size:.72rem;font-weight:800;line-height:1.4;text-shadow:0 1px 1px rgba(0,0,0,.3)}'+
'.task-item{padding:5px 0;font-size:.85rem;border-bottom:1px dashed rgba(170,204,255,.25);color:var(--text)}'+
'.task-item:last-child{border-bottom:none}'+
'.task-tag{display:inline-block;font-size:.68rem;padding:0 5px;border-radius:3px;color:#fff;margin-bottom:3px}'+
'.task-tag.main{background:#e05050}'+
'.task-tag.legend{background:#d8b830}'+
'.task-tag.random{background:#999}'+
'.task-text{line-height:1.55;color:#dce9ff;word-break:break-word}'+
'.event-item{padding:2px 0;border-bottom:none}'+
'.event-type{font-weight:800;font-size:.82rem;color:var(--text)}'+
'.event-item p{font-size:.8rem;color:#dce9ff;font-weight:400;letter-spacing:.2px;margin-top:1px;line-height:1.45}'+
'.world-frame .info-inner{padding-top:5px;padding-bottom:5px}'+
'.world-frame .info-title{margin-bottom:3px}'+
'.bt-item{padding:5px 0;border-bottom:1px dashed rgba(170,204,255,.25)}'+
'.bt-item:last-child{border-bottom:none}'+
'.bt-tag{font-weight:800;font-size:.82rem;color:var(--text);margin-bottom:3px}'+
'.bt-text{font-size:.8rem;color:#dce9ff;line-height:1.55;word-break:break-word;white-space:pre-wrap}'+
'.rel-item{display:flex;align-items:center;gap:6px;padding:5px 0;font-size:.82rem;color:var(--text)}'+
'.rel-name{width:60px;text-align:left;flex-shrink:0;color:var(--dim);font-weight:600}'+
'.rel-bar{flex:1;height:8px;background:rgba(0,0,0,.4);border-radius:4px;overflow:hidden}'+
'.rel-fill{height:100%;background:#f08888;border-radius:4px}'+
'.rel-val{width:30px;text-align:right;flex-shrink:0;color:var(--dim)}'+
'.empty{text-align:center;padding:10px 0;color:var(--dim);letter-spacing:2px;font-size:.82rem}'+
'.bag-tabs{display:flex;gap:4px;margin-bottom:5px;justify-content:flex-end}'+
'.bag-tab{flex:0 0 auto;padding:2px 14px;font-family:inherit;font-size:.72rem;text-align:center;border:1px solid var(--frame);background:rgba(170,204,255,.12);color:var(--text);border-radius:4px;cursor:pointer}'+
'.bag-tab.active{background:rgba(43,74,111,.8);color:#fff}'+
'.bag-list{display:flex;flex-direction:column;gap:6px;max-height:min(280px,46vh);overflow-y:auto;padding-right:4px}'+
'.item-entry{display:flex;align-items:center;gap:8px;padding:6px 0;padding-right:clamp(8px,2vw,12px);border-bottom:1px dashed rgba(170,204,255,.25)}'+
'.fold-inner .item-entry:last-child{padding-right:clamp(8px,2vw,12px)}'+
'.item-entry:last-child{border-bottom:none}'+
'.item-icon-wrap{width:28px;height:28px;flex-shrink:0;display:flex;align-items:center;justify-content:center}'+
'.item-icon{width:28px;height:28px;object-fit:contain;flex-shrink:0}'+
'.item-icon.placeholder{display:flex;align-items:center;justify-content:center;color:var(--dim);background:rgba(170,204,255,.12);border-radius:4px;width:28px;height:28px}'+
'.item-name{flex:1;font-size:.85rem;color:var(--text)}'+
'.item-count{font-size:.85rem;color:var(--dim)}'+
'.box-select{background:rgba(43,74,111,.7);color:#fff;border:1px solid var(--frame);border-radius:4px;padding:1px 14px;font-family:inherit;font-size:.75rem;margin-bottom:5px;width:auto;min-width:120px;text-align:center;text-align-last:center;float:right}'+
'.box-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:280px;overflow-y:auto;padding-right:4px;clear:both}'+
'.box-cell{display:flex;flex-direction:column;align-items:center;padding:6px;cursor:pointer;border-radius:6px;transition:background .12s}'+
'.box-cell:hover{background:rgba(170,204,255,.08)}'+
'.box-icon{width:48px;height:48px}'+
'.box-name{font-size:.65rem;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60px;margin-top:2px;color:var(--text)}'+
'.btn-small{padding:4px 10px;font-family:inherit;font-size:.78rem;border:1px solid var(--frame);background:rgba(43,74,111,.7);color:#fff;border-radius:4px;cursor:pointer;flex-shrink:0}'+
'.btn-small:hover{filter:brightness(1.15)}'+
'.overlay{position:absolute;inset:0;background:rgba(10,16,30,.45);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:none;align-items:center;justify-content:center;z-index:1000;padding:12px}'+
'.overlay.open{display:flex}'+
'.modal{max-width:420px;width:100%;border:2px solid var(--frame);border-radius:8px;background-color:#0f1626;box-shadow:0 0 14px rgba(170,204,255,.5);overflow:hidden;max-height:100%;overflow-y:auto}'+
'.modal-head{display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid rgba(170,204,255,.3);background:rgba(43,74,111,.7)}'+
'.modal-name{font-weight:800;font-size:1.05rem;color:var(--text)}'+
'.modal-sub{font-size:.78rem;color:var(--dim);margin-top:2px}'+
'.close{margin-left:auto;background:none;border:none;color:var(--text);font-size:1.2rem;cursor:pointer;opacity:.8}'+
'.close:hover{opacity:1}'+
'.modal-body{padding:10px 14px 14px}'+
'.pkm-big{position:relative;display:flex;align-items:center;justify-content:center;min-height:130px;padding:6px 0;border-bottom:1px dashed rgba(170,204,255,.25)}'+
'.pkm-big-img{width:120px;height:120px;object-fit:contain;filter:drop-shadow(0 3px 8px rgba(0,0,0,.6));cursor:pointer}'+
'.pkm-shiny-tag{position:absolute;top:6px;right:10px;font-size:.68rem;font-weight:800;color:#ffe066;text-shadow:0 0 6px rgba(255,224,102,.8);pointer-events:none}'+
'.pkm-shiny-tag.off{color:#8ba0b8;text-shadow:none}'+
'.abi-link{text-decoration:underline;text-underline-offset:2px;cursor:pointer}'+
'.abi-link:hover{color:#7cc4f8}'+
'.pkm-forms{display:flex;flex-wrap:wrap;gap:6px;padding:6px 0;border-bottom:1px dashed rgba(170,204,255,.25)}'+
'.pkm-form-btn.active{background:rgba(43,74,111,.9);border-color:#7cc4f8}'+
'.row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px dashed rgba(170,204,255,.25);font-size:.85rem;color:var(--text)}'+
'.row:last-child{border-bottom:none}'+
'.row .k{color:var(--dim);flex-shrink:0}'+
'.row .v{text-align:right}'+
'.row.block{flex-direction:column;align-items:flex-start;gap:2px}'+
'.row.block .v{text-align:left;word-break:break-word}'+
'.ball-icon{width:26px;height:26px;vertical-align:middle;image-rendering:pixelated;margin-right:2px}'+
'.moves{display:grid;grid-template-columns:1fr 1fr;gap:6px;flex:1;min-width:0}'+
'.move-cell{border:1px solid;border-radius:6px;padding:4px 6px;display:flex;flex-direction:column;gap:2px}'+
'.move-name{font-weight:800;font-size:.8rem;color:var(--text)}'+
'.move-meta{display:flex;align-items:center;gap:4px;font-size:.68rem;color:var(--dim)}'+
'.move-type{display:inline-block;color:#fff;padding:0 5px;border-radius:8px;font-size:.66rem;line-height:1.4}'+
'.move-cat{color:var(--dim)}'+
'.ivs{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}'+
'.iv{background:rgba(50,205,50,.14);border:1px solid rgba(50,205,50,.4);border-radius:6px;padding:1px 6px;font-size:.72rem}'+
'.dim{color:var(--dim)}'+
'.action-pkm{display:flex;align-items:center;gap:10px;margin-bottom:12px}'+
'.action-img{width:64px;height:64px}'+
'.action-info{flex:1;min-width:0}'+
'.action-btns{display:flex;flex-direction:column;gap:8px}'+
'.act-btn{display:block;width:100%;padding:9px;font-family:inherit;font-size:.9rem;font-weight:800;cursor:pointer;border-radius:6px;border:2px solid var(--frame);background:rgba(43,74,111,.7);color:#fff;transition:filter .15s,transform .08s}'+
'.act-btn:hover{filter:brightness(1.15)}'+
'.act-btn:active{transform:translateY(1px)}'+
'.trainer-frame .info-inner{padding-top:6px;padding-bottom:4px}'+
'.trainer-frame .info-title{margin-bottom:3px}'+
'.trainer-frame .info-row{padding-top:1px;padding-bottom:1px;border-bottom:none}'+
'.ball-wrap{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}'+
'.env-strip{display:flex;flex-direction:column;gap:4px;padding:6px 10px;margin-bottom:10px;border:1px solid var(--frame);border-radius:6px;background:rgba(25,40,65,.5);font-size:.72rem;color:var(--text)}'+
'.env-strip .env-line{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;min-width:0}'+
'.env-strip .env-item{min-width:0;word-break:break-word;line-height:1.45}'+
'.battle-list .bt-item{padding-left:clamp(8px,2vw,12px)}'+
'.battle-list .bt-text{padding-left:clamp(6px,1.5vw,10px)}'+
'.pk-lv-wrap{display:inline-flex;align-items:center;gap:5px;font-size:clamp(.66rem,2.5vw,.78rem)}'+
'.dex-search{margin-bottom:6px;padding-left:clamp(6px,2vw,12px)}'+
'.dex-search input{width:100%;max-width:260px;padding:5px 10px;font-family:inherit;font-size:.8rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text)}'+
'.dex-search input:focus{outline:none;border-color:#7cc4f8}'+
'.dex-cell.dex-hit{box-shadow:0 0 0 2px #7cc4f8;border-color:#7cc4f8}'+
'.dex-count{font-size:.8rem;color:var(--dim);margin-bottom:8px;padding-left:clamp(6px,2vw,12px)}'+
'.pokedex{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:6px;max-height:440px;overflow-y:auto;padding-left:clamp(6px,2vw,12px);padding-right:4px;min-width:0}'+
'.info-inner:has(.pokedex) .info-title{position:sticky;top:0;z-index:6}'+
'.dex-cell{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:6px;border:1px solid var(--frame);background:rgba(43,74,111,.25);min-width:0;overflow:hidden;cursor:pointer}'+
'.dex-cell:hover{filter:brightness(1.2)}'+
'.dex-cell[data-noclick]{cursor:default}'+
'.dex-cell.caught{background:rgba(50,205,50,.12);border-color:rgba(50,205,50,.6)}'+
'.dex-cell.seen{background:rgba(170,204,255,.08);border-color:rgba(170,204,255,.35)}'+
'.dex-cell.unknown{background:rgba(0,0,0,.25);border-color:rgba(255,255,255,.08)}'+
'.dex-no{font-size:.6rem;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}'+
'.dex-name{font-size:.72rem;font-weight:800;text-align:center;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}'+
'.dex-cell.unknown .dex-name{color:rgba(150,170,190,.5)}'+
'.dex-types{font-size:.6rem;color:var(--dim);white-space:nowrap;overflow:hidden;max-width:100%;text-overflow:ellipsis}'+
'.dex-cell.unknown .dex-types{visibility:hidden}'+
'.item-badge{height:1em;width:auto;image-rendering:pixelated;object-fit:contain;flex-shrink:0;transform:scale(1.5);transform-origin:center}'+
'.info-title{margin-left:8%}'+
'.info-row.cmd,.info-row:last-child,.task-item:last-child,.event-item:last-child,.item-entry:last-child{padding-right:7%}'+
'.card-inner{padding-left:8%;padding-right:7%}'+
'.bottom-row{padding:0}'+
'.empty-inner{padding-left:8%}'+
'.nearby-card-inner{padding-left:10%;padding-right:8%}'+
'.dex-search,.dex-count,.pokedex{padding-left:8%}'+
'.battle-list .bt-item{padding-left:8%}'+
'.battle-list .bt-text{padding-left:0}'+
'.grid{margin-bottom:clamp(12px,3vw,18px)}'+
'.nearby-frame{margin-top:clamp(12px,3vw,18px)}'+
'.badge-tabs{padding-left:9%;padding-right:4%;scrollbar-width:none}'+
'.badge-tabs::-webkit-scrollbar{display:none}'+
'.set-title{font-weight:800;font-size:.85rem;color:var(--text);margin-bottom:8px}'+
'.set-opts{display:flex;flex-direction:column;gap:7px;margin-bottom:10px}'+
'.set-opt{display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--text);cursor:pointer}'+
'.set-opt input{margin:0;accent-color:#7cc4f8}'+
'.nearby-names{display:flex;flex-wrap:wrap;gap:6px}'+
'.nearby-name-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--frame);background:rgba(43,74,111,.35);border-radius:4px;cursor:pointer;font-size:.8rem;color:var(--text);transition:background .12s}'+
'.nearby-name-chip:hover{background:rgba(170,204,255,.12)}'+
'.nearby-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;width:100%;max-height:62vh;overflow-y:auto;overflow-x:hidden;padding-right:4px}'+
'.nearby-grid .box-cell{min-width:0;overflow:hidden}'+
'.nearby-grid .box-icon{width:clamp(38px,10vw,64px);height:clamp(38px,10vw,64px);max-width:100%}'+
'.nearby-grid .box-name{max-width:100%;width:100%}'+
'.nearby-page{overflow-x:hidden}'+
'.nearby-page .page-body{padding:10px 6px 12px}'+
'.nearby-wrap{width:100%;max-width:100%;min-width:0;overflow:hidden}'+
'.nearby-title{font-weight:800;font-size:clamp(.8rem,3vw,.95rem);color:var(--text);margin:2px 0 10px;letter-spacing:1px;text-shadow:1px 1px 0 #000}'+
'.detail-modal{max-width:560px;position:relative}'+
'.detail-modal .modal-body{padding-bottom:64px}'+
'.dt-nav{position:absolute;bottom:0;width:42px;height:42px;border:0;background:rgba(43,74,111,.92);color:#fff;font-size:1.05rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:4}'+
'.dt-nav.right{right:0;border-left:2px solid var(--frame);border-top:2px solid var(--frame)}'+
'.dt-nav.left{left:0;border-right:2px solid var(--frame);border-top:2px solid var(--frame)}'+
'.dt-page{display:none}'+
'.dt-page.active{display:block}'+
'.dt-grid{display:flex;gap:10px;align-items:stretch}'+
'.dt-left{flex:1 1 55%;min-width:0;display:flex;flex-direction:column;justify-content:center}'+
'.dt-right{flex:0 0 40%;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:6px;text-align:center}'+
'.dt-hex-list{display:flex;flex-direction:column;gap:0;align-items:stretch}'+
'.dt-hex-wrap{background:#7d95b5;clip-path:polygon(12% 0,88% 0,100% 50%,88% 100%,12% 100%,0 50%);padding:1px;filter:drop-shadow(0 0 4px rgba(125,149,181,.35))}'+
'.dt-hex{display:flex;align-items:center;justify-content:flex-start;gap:8px;padding:10px 22px 10px 26px;background:rgba(43,74,111,.65);cursor:pointer;font-family:inherit;color:var(--text);clip-path:polygon(12% 0,88% 0,100% 50%,88% 100%,12% 100%,0 50%);transition:filter .12s}'+
'.dt-hex .move-type{width:34px;min-width:34px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:4px;font-size:.68rem;font-weight:800;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.3);box-sizing:border-box}'+
'.dt-hex:hover{filter:brightness(1.15)}'+
'.dt-hex-name{flex:1;text-align:left;font-weight:800;font-size:.85rem;color:var(--text);white-space:nowrap}'+
'.dt-top{width:100%;display:flex;align-items:center;gap:2px;justify-content:center}'+
'.dt-ball{width:24px;height:24px}'+
'.dt-name{font-weight:800;font-size:clamp(.95rem,3.2vw,1.15rem);color:var(--text);text-shadow:1px 1px 0 #000;white-space:nowrap}'+
'.dt-lv{font-size:clamp(.95rem,3.2vw,1.15rem);color:var(--dim);margin-top:0;text-align:center}'+
'.dt-big{width:96px;height:96px;background-size:contain;background-repeat:no-repeat;background-position:center;image-rendering:pixelated}'+
'.dt-sprite{display:flex;justify-content:center;align-items:center;margin:8px 0}'+
'.dt-hold{margin-top:0;font-size:.8rem;color:var(--text);text-align:center}'+'.trainer-frame{border:1px solid var(--frame);border-radius:10px;background:rgba(43,74,111,.28);overflow:hidden;filter:none}'+'.trainer-frame .info-inner{padding:8px 12px}'+'.trainer-frame .info-title{margin-left:0;display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 4px}'+'.trainer-frame .info-row{padding-left:0}'+'.trainer-frame .info-row.cmd,.trainer-frame .info-row:last-child{padding-right:0}'+'.tr-env{font-size:.72rem;font-weight:400;letter-spacing:0;text-shadow:none;color:var(--dim);display:inline-flex;flex-wrap:wrap;gap:2px 8px}'+'.battle-frame{border:1px solid var(--frame);border-radius:10px;background:rgba(43,74,111,.22);overflow:hidden;filter:none}'+'.battle-frame .info-inner{padding:8px 12px}'+'.battle-frame .info-title{margin-left:0}'+'.plain-frame{border:1px solid var(--frame);border-radius:10px;background:rgba(43,74,111,.22);overflow:hidden;filter:none}'+'.plain-frame .info-inner{padding:8px 12px}'+'.plain-frame .info-title{margin-left:0}'+'.plain-frame .info-row{padding-left:0}'+'.plain-frame .info-row.cmd,.plain-frame .info-row:last-child,.plain-frame .task-item:last-child,.plain-frame .event-item:last-child{padding-right:0}'+
'@media(orientation:landscape){.dt-top{justify-content:center}}'+'.nb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px;padding-left:8%;padding-right:7%}'+'.nb-cell{display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 2px;border:1px solid rgba(125,149,181,.45);border-radius:6px;background:rgba(43,74,111,.28);cursor:pointer;min-width:0;transition:filter .12s,transform .1s}'+'.nb-cell:hover{filter:brightness(1.2);transform:translateY(-2px)}'+'.nb-icon{width:clamp(38px,11vw,52px);height:clamp(38px,11vw,52px)}'+'.nb-name{font-size:.7rem;font-weight:800;text-align:center;line-height:1.2;max-width:100%;word-break:break-all}'+'.nb-cnt{font-size:.66rem;color:var(--dim)}'+'.nb-toggle{float:right;font-size:.7rem;font-weight:400;color:var(--dim);cursor:pointer;margin-right:2%}'+'.nb-toggle:hover{color:#7cc4f8}'+'.fold-box{border:1px solid var(--frame);border-radius:6px;margin-bottom:10px;background:rgba(25,40,65,.35);overflow:hidden}'+'.fold-head{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;font-size:.82rem;font-weight:800;cursor:pointer;background:rgba(43,74,111,.5)}'+'.fold-head:hover{background:rgba(170,204,255,.14)}'+'.fold-arrow{font-size:.8rem;opacity:.8}'+'.fold-inner{padding:8px 12px 10px}'+'.bt-scene{font-size:.78rem;line-height:1.5;color:#dce9ff;padding:6px 10px;margin-bottom:8px;border-left:3px solid var(--frame);background:rgba(43,74,111,.3);border-radius:0 6px 6px 0;word-break:break-word}'+'.bt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:10px}'+'.bt-card{position:relative;min-width:0;padding:7px 9px;border:1px solid var(--frame);border-left:4px solid var(--frame);border-radius:6px;background:linear-gradient(160deg,rgba(43,74,111,.55),rgba(15,22,38,.75));box-shadow:0 2px 6px rgba(0,0,0,.45)}'+'.bt-card.self{border-left-color:#4ade80;box-shadow:0 0 8px rgba(74,222,128,.18)}'+'.bt-card.ally{border-left-color:#7cc4f8}'+'.bt-card.foe{border-left-color:#f05060;background:linear-gradient(160deg,rgba(120,40,48,.5),rgba(20,14,20,.75))}'+'.bt-card.neu{border-left-color:#8ba0b8}'+'.bt-head{display:flex;align-items:baseline;justify-content:space-between;gap:6px}'+'.bt-pk{font-weight:800;font-size:.85rem;color:var(--text);text-shadow:1px 1px 0 #000;word-break:break-all}'+'.bt-lv{font-size:.72rem;color:var(--dim);flex-shrink:0}'+'.bt-tr{font-size:.68rem;color:var(--dim);margin-top:1px}'+'.bt-hp{display:flex;align-items:center;gap:5px;margin:4px 0 3px}'+'.bt-hp .hp-bar{flex:1}'+'.bt-hpn{font-size:.66rem;color:var(--text);flex-shrink:0}'+'.bt-line{font-size:.7rem;line-height:1.45;color:#dce9ff;margin-top:2px;word-break:break-word}'+'.bt-k{color:var(--dim);margin-right:4px}'+'.st-up{color:#4ade80}'+'.st-dn{color:#f87171}'+'.ailment.bad{background:#c03028;color:#fff}'+'.bt-side{border:1px dashed rgba(170,204,255,.35);border-radius:6px;margin-bottom:8px;overflow:hidden}'+'.bt-side-h{padding:4px 10px;font-size:.76rem;font-weight:800;background:rgba(43,74,111,.5)}'+'.bt-side-b{padding:5px 10px;font-size:.74rem;line-height:1.5;color:#dce9ff;word-break:break-word}'+'.detail-modal.one .modal-body{padding-bottom:14px}'+'.dt-sep{height:1px;background:rgba(170,204,255,.28);margin:10px 0}'+'.dt-more-btn{display:block;width:100%;margin-top:6px;padding:5px 10px;font-family:inherit;font-size:.74rem;font-weight:800;color:#7cc4f8;background:rgba(43,74,111,.45);border:1px dashed rgba(124,196,248,.5);border-radius:4px;cursor:pointer}'+
'.dt-more-btn:hover{background:rgba(124,196,248,.18)}'+
'.dt-move-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:8px}'+
'.dt-move-cell{display:flex;align-items:center;gap:6px;min-width:0;padding:7px 8px;border:1px solid var(--frame);border-radius:6px;background:rgba(43,74,111,.4);cursor:pointer;transition:filter .12s}'+
'.dt-move-cell:hover{filter:brightness(1.15)}'+
'.dt-move-cell .move-type{width:34px;min-width:34px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;font-size:.6rem;font-weight:800;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.3);box-sizing:border-box;flex-shrink:0}'+
'.dt-move-cell .move-name{flex:1;min-width:0;text-align:left;font-weight:800;font-size:.8rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.dt-more-list{margin-top:4px}'+'.bt-empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);letter-spacing:3px;font-size:.86rem;text-align:center}'+'.tab-panel .bt-empty{height:auto;min-height:140px}'+'.bt-rule{font-size:.78rem;line-height:1.5;color:#ffe9a8;padding:6px 10px;margin-bottom:6px;border-left:3px solid #d8b830;background:rgba(120,95,20,.28);border-radius:0 6px 6px 0;word-break:break-word}'+'.fold-inner{min-width:0;overflow-x:hidden}'+'.fold-inner .bag-list{max-height:none}'+'.fold-body{max-height:200px;overflow-y:auto}'+'.fold-body::-webkit-scrollbar{width:5px}'+'.fold-body::-webkit-scrollbar-thumb{background:rgba(170,204,255,.4);border-radius:3px}'+'.quick-bar{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:0 3% clamp(10px,2.5vw,14px) 3%}'+'.quick-chip{display:flex;align-items:center;justify-content:center;gap:2px;padding:6px 2px;font-size:clamp(.58rem,2.3vw,.7rem);font-weight:800;border-radius:4px;text-shadow:1px 1px 0 #000;white-space:nowrap;overflow:hidden}'+'.quick-emoji{font-size:.95rem;line-height:1}'+'.pk-left{display:flex;align-items:center;gap:4px;min-width:0;flex:1 1 auto;font-size:clamp(.74rem,2.8vw,.88rem)}'+'.mega-ic{height:1em;width:auto;flex:0 0 auto;image-rendering:pixelated}'+
'#pkm-hud-btn{position:fixed;z-index:2147483647;width:54px;height:54px;border-radius:50%;cursor:pointer;background:radial-gradient(circle at 30% 30%,#5a7db0,#2b4a6f);border:2px solid #7d95b5;box-shadow:0 4px 14px rgba(0,0,0,.5),0 0 12px rgba(124,196,248,.35);display:flex;align-items:center;justify-content:center;transition:box-shadow .15s;font-size:26px;color:#fff;user-select:none;-webkit-user-select:none;touch-action:none}'+
'#pkm-hud-btn:hover{box-shadow:0 6px 20px rgba(0,0,0,.6),0 0 18px rgba(124,196,248,.6)}'+
'#pkm-hud-btn img{width:46px;height:46px;object-fit:cover;border-radius:50%;pointer-events:none}'+
'#pkm-hud-mapfab{position:fixed;z-index:2147483647;width:44px;height:44px;border-radius:50%;border:2px solid #7d95b5;background:radial-gradient(circle at 30% 30%,#5a7db0,#2b4a6f);color:#fff;font-size:22px;cursor:pointer;display:none;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.5),0 0 12px rgba(124,196,248,.35);user-select:none;-webkit-user-select:none;touch-action:none}'+
'#pkm-hud-mapfab.show{display:flex}'+
'#pkm-hud-mask{position:fixed;inset:0;z-index:2147483500;background:rgba(8,12,24,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:block;opacity:0;visibility:hidden;transition:opacity .18s ease,visibility 0s linear .18s;pointer-events:none}'+
'#pkm-hud-mask.open{opacity:1;visibility:visible;transition:opacity .18s ease,visibility 0s;pointer-events:auto}'+
'#pkm-hud-win{position:fixed;left:0;top:0;z-index:2147483600;width:min(94vw,650px);max-height:86vh;overflow-y:auto;display:block;border-radius:12px;overscroll-behavior:contain;-webkit-overscroll-behavior:contain;opacity:0;visibility:hidden;transform:translateY(14px) scale(.98);transform-origin:center;transition:opacity .18s ease,transform .18s ease,visibility 0s linear .18s;pointer-events:none}'+
'#pkm-hud-win.open{opacity:1;visibility:visible;transform:none;transition:opacity .18s ease,transform .18s ease,visibility 0s;pointer-events:auto}'+
'#pkm-hud-win .hud{margin:0;max-width:none;width:100%}'+
'#pkm-hud-close{position:absolute;right:8px;top:8px;z-index:10;width:32px;height:32px;border-radius:50%;border:1px solid var(--frame);background:rgba(43,74,111,.92);color:#fff;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}'+
'#pkm-hud-close:hover{background:rgba(150,60,60,.9)}'+
'#pkm-hud-inline{position:relative;display:block;margin:8px 0 4px;max-width:100%}'+
'#pkm-hud-inline .hud{max-width:600px;margin:0 auto;border-radius:8px}'+
'#pkm-hud-inline{--pkm-inline-h:500px}'+
'#pkm-hud-inline .hud-inner{height:var(--pkm-inline-h,500px)}'+
'@media(max-width:430px){#pkm-hud-inline{--pkm-inline-h:400px}}'+
'#pkm-hud-inline .tab-panel{overscroll-behavior:auto;-webkit-overscroll-behavior:auto}'+
'#pkm-hud-inline .tab-btn{padding:10px 0;min-height:44px;font-size:.8rem;touch-action:manipulation}'+
'.map-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}'+
'.map-tab{flex:0 0 auto;padding:2px 12px;font-family:inherit;font-size:.72rem;border:1px solid var(--frame);background:rgba(170,204,255,.12);color:var(--text);border-radius:4px;cursor:pointer}'+
'.map-tab.active{background:rgba(43,74,111,.8);color:#fff}'+
'.map-wrap{position:relative;width:100%;height:auto;min-height:140px;overflow:hidden;border:0;border-radius:8px;background:#0a1020;touch-action:none;cursor:grab}'+
'.map-wrap.dragging{cursor:grabbing}'+
'.map-stage{position:relative;width:100%;height:100%;transform-origin:0 0}'+
'.map-img{display:block;width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-user-drag:none}'+
'.map-pin{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#7cc4f8;border:2px solid #fff;box-shadow:0 0 10px rgba(124,196,248,.9);animation:map-pin-pulse 1.2s ease-in-out infinite;pointer-events:none;z-index:2}'+
'.map-pin-label{position:absolute;transform:translate(-50%,-135%);white-space:nowrap;padding:1px 6px;border-radius:4px;background:rgba(15,22,38,.92);border:1px solid var(--frame);font-size:.68rem;font-weight:800;color:#fff;pointer-events:none;z-index:2}'+
'.map-no-loc{padding:10px;text-align:center;color:var(--dim);font-size:.78rem;letter-spacing:1px}'+
'.map-page{display:flex;flex-direction:column;gap:8px;margin:-14px -14px 0}'+
'.map-toolbar{display:flex;align-items:center;gap:8px;padding:0 12px}'+
'.map-toolbar .map-tabs{flex:1;margin-bottom:0}'+
'.map-controls{display:flex;align-items:center;gap:6px;padding:2px 12px;min-height:34px;position:relative;flex-wrap:nowrap;overflow:hidden}'+
'.map-size-btn{flex:0 0 auto;padding:3px 10px;font-family:inherit;font-size:.72rem;font-weight:800;border:1px solid var(--frame);background:rgba(170,204,255,.12);color:var(--text);border-radius:4px;cursor:pointer;white-space:nowrap}'+
'.map-size-btn:active{background:rgba(43,74,111,.8);color:#fff}'+
'.map-eye{flex:0 0 auto;padding:4px 14px;font-family:inherit;font-size:.85rem;font-weight:800;border:1px solid var(--frame);background:rgba(170,204,255,.12);color:var(--text);border-radius:4px;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none}'+
'.map-eye:active{background:rgba(43,74,111,.8);color:#fff}'+
'.map-eye.on{background:rgba(43,74,111,.8);color:#fff;border-color:#7cc4f8}'+
'.map-zoom-hint{padding:4px 12px;font-size:.68rem;color:var(--dim);text-align:center;letter-spacing:1px}'+
'.map-spot-label{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;padding:1px 5px;border-radius:4px;background:rgba(15,22,38,.85);border:1px solid rgba(124,196,248,.5);font-size:.62rem;font-weight:800;color:#fff;pointer-events:auto;cursor:pointer;z-index:3;display:none}'+
'.map-spot-label.top{z-index:99;background:rgba(43,74,111,.95);border-color:#7cc4f8;box-shadow:0 0 8px rgba(124,196,248,.6)}'+
'.map-wrap.show-all.show-town .map-spot-label[data-cat="town"],.map-wrap.show-all.show-road .map-spot-label[data-cat="road"],.map-wrap.show-all.show-special .map-spot-label[data-cat="special"]{display:block}'+
'.map-filter{display:none;align-items:center;gap:4px;min-width:0;white-space:nowrap}'+
'.map-filter.show{display:flex}'+
'.map-size-pop{display:none;position:absolute;inset:0;align-items:center;gap:8px;padding:0 12px;background:#0f1626;z-index:5}'+
'.map-size-pop.open{display:flex}'+
'.map-size-pop input[type=range]{flex:1;min-width:60px;accent-color:#7cc4f8}'+
'.map-size-pop .dim{flex:0 0 auto;white-space:nowrap}'+
'.map-size-done{flex:0 0 auto;padding:2px 10px;font-family:inherit;font-size:.75rem;font-weight:800;border:1px solid var(--frame);background:rgba(43,74,111,.8);color:#fff;border-radius:4px;cursor:pointer}'+
'.map-labels{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none}'+
'@keyframes map-pin-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}'+
'#pkm-hud-btn .fab-update-dot{position:absolute;top:-3px;right:-3px;width:16px;height:16px;border-radius:50%;background:#e05050;border:2px solid #0f1626;box-shadow:0 0 8px rgba(224,80,80,.9);animation:pkm-fab-pulse 1.2s ease-in-out infinite;pointer-events:none;z-index:2}'+
'@keyframes pkm-fab-pulse{0%,100%{transform:scale(1);box-shadow:0 0 8px rgba(224,80,80,.9)}50%{transform:scale(1.3);box-shadow:0 0 16px rgba(224,80,80,1)}}'+
'.tr-right{display:inline-flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0}'+
'.hud-refresh-btn{display:inline-flex;align-items:center;justify-content:center;width:1.45em;height:1.45em;padding:0;border:none;background:transparent;cursor:pointer;flex-shrink:0;align-self:center;line-height:1;font-family:inherit;font-size:inherit;color:inherit}'+
'.hud-refresh-btn img{width:2em;height:2em;object-fit:contain;display:block;pointer-events:none;margin-top:-0.23em}'+
'.hud-refresh-btn:hover{filter:brightness(1.2)}'+
'.hud-refresh-btn:disabled{opacity:.6;cursor:default}'+
'.hud-refresh-btn.spin img{animation:pkm-refresh-spin .6s linear}'+
'.hud-refresh-ok{color:#4ade80;font-size:1.25em;line-height:1;font-weight:800;margin-top:-0.24em}'+
'@keyframes pkm-refresh-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}'+
'#pkm-hud-win .trainer-frame .info-title{padding-right:28px}'+
'.map-island-label{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;padding:1px 6px;border-radius:4px;background:rgba(15,22,38,.68);border:1px solid rgba(74,222,128,.5);color:#c6d1e4;font-size:.62rem;font-weight:800;pointer-events:auto;cursor:pointer;z-index:3}'+
'.map-island-label .il-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#4ade80;margin-right:3px;vertical-align:1px;opacity:.8}'+
'.map-island-label.no-sub{cursor:default}'+
'.map-island-label.hl{border-color:#fff;background:rgba(255,255,255,.14);color:#fff;box-shadow:0 0 6px 1px rgba(255,255,255,.5);animation:island-hl-pulse 1.1s ease-in-out infinite}'+
'@keyframes island-hl-pulse{0%,100%{box-shadow:0 0 3px 1px rgba(255,255,255,.4)}50%{box-shadow:0 0 10px 4px rgba(255,255,255,.7)}}'+
'.map-back-btn{flex:0 0 auto;padding:4px 12px;font-family:inherit;font-size:.75rem;font-weight:800;border:1px solid var(--frame);background:rgba(43,74,111,.85);color:#fff;border-radius:4px;cursor:pointer;white-space:nowrap}'+
'.map-back-btn:hover{background:rgba(124,196,248,.28)}'+
'.map-pad-toggle{flex:0 0 auto;width:32px;height:32px;margin-right:6px;border-radius:7px;border:1px solid var(--frame);background:rgba(43,74,111,.86);color:#fff;font-size:16px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;touch-action:manipulation;user-select:none;-webkit-user-select:none}'+
'.map-pad-toggle:hover{background:rgba(124,196,248,.22)}'+
'.map-pad-toggle.on{background:rgba(124,196,248,.26);border-color:#7cc4f8;box-shadow:0 0 8px rgba(124,196,248,.35)}'+
'.map-viewer-frame{position:relative;max-width:100%;margin:0 auto;border:1px solid rgba(125,149,181,.72);border-radius:10px;background:#0a1020;box-shadow:0 3px 14px rgba(0,0,0,.35);overflow:hidden}'+
'.map-viewer-frame .map-wrap{margin:0!important;border-radius:8px;background:#0a1020;max-width:100%}'+
'.map-viewer-frame.manual-open .map-wrap{border-radius:8px 8px 0 0}'+
'.map-manual-controls{display:none;align-items:center;justify-content:space-between;gap:12px;min-height:86px;padding:7px 12px 9px;border-top:1px solid rgba(125,149,181,.6);background:linear-gradient(180deg,rgba(24,39,64,.96),rgba(12,22,38,.98));touch-action:manipulation;user-select:none;-webkit-user-select:none}'+
'.map-viewer-frame.manual-open .map-manual-controls{display:flex}'+
'.map-dpad{display:grid;grid-template-columns:36px 36px 36px;grid-template-rows:25px 30px 25px;gap:2px;align-items:center;justify-items:center;flex:0 0 auto}'+
'.map-dpad-core{grid-column:2;grid-row:2;width:16px;height:16px;border-radius:50%;border:1px solid rgba(125,149,181,.55);background:rgba(124,196,248,.10);box-shadow:inset 0 0 5px rgba(0,0,0,.5)}'+
'.map-manual-btn{display:flex;align-items:center;justify-content:center;padding:0;border:1px solid var(--frame);background:rgba(43,74,111,.82);color:#fff;border-radius:7px;font-family:inherit;font-weight:900;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none;box-shadow:0 2px 5px rgba(0,0,0,.28)}'+
'.map-manual-btn:hover{filter:brightness(1.16)}'+
'.map-manual-btn:active{transform:translateY(1px);background:rgba(124,196,248,.28)}'+
'.map-dpad .map-manual-btn{width:34px;height:27px;font-size:16px}'+
'.map-dpad [data-map-pan="up"]{grid-column:2;grid-row:1}'+
'.map-dpad [data-map-pan="left"]{grid-column:1;grid-row:2}'+
'.map-dpad [data-map-pan="right"]{grid-column:3;grid-row:2}'+
'.map-dpad [data-map-pan="down"]{grid-column:2;grid-row:3}'+
'.map-zoom-pad{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:0 0 auto;margin-left:auto}'+
'.map-zoom-pad .map-manual-btn{width:44px;height:44px;font-size:24px;line-height:1}'+
'@media(max-width:600px){.page-overlay.popout{padding:max(6px,env(safe-area-inset-top)) 4px max(6px,env(safe-area-inset-bottom));align-items:center;align-items:safe center;justify-content:center}.page-overlay.popout .page{box-sizing:border-box;width:96vw;max-width:96vw;max-height:90vh;max-height:90dvh}.page-overlay.popout .page-head{min-height:44px;padding:5px 6px}.page-overlay.popout .page-body{padding:10px 8px 12px;max-height:calc(90vh - 44px);max-height:calc(90dvh - 44px);overflow:auto;overflow-x:hidden}.map-page{margin:-10px -8px 0;gap:6px}.map-toolbar{padding:0 8px;gap:4px;min-width:0}.map-toolbar .map-tabs{flex-wrap:nowrap;overflow-x:auto;min-width:0;scrollbar-width:none;-webkit-overflow-scrolling:touch}.map-toolbar .map-tabs::-webkit-scrollbar{display:none}.map-tab{padding:4px 10px;min-height:30px}.map-controls{padding:2px 8px;overflow-x:auto}.map-zoom-hint{padding:4px 8px;font-size:.62rem;line-height:1.45;letter-spacing:.4px}.map-pad-toggle,.page-close{width:36px;height:36px;font-size:17px}.map-manual-controls{min-height:82px;padding:6px 9px 8px}.map-dpad{grid-template-columns:38px 38px 38px;grid-template-rows:24px 30px 24px}.map-dpad .map-manual-btn{width:36px;height:28px;font-size:17px}.map-zoom-pad{gap:6px}.map-zoom-pad .map-manual-btn{width:42px;height:42px;font-size:23px}}'+
'@media(hover:none){.card-frame:hover,.nearby-card:hover,.nb-cell:hover{transform:none!important;filter:none!important}.page-overlay,.overlay{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}'+
'@media(hover:none){.page-overlay.popout.map-focus{backdrop-filter:blur(9px) saturate(.76) brightness(.68)!important;-webkit-backdrop-filter:blur(9px) saturate(.76) brightness(.68)!important}}'+
'@media(prefers-reduced-motion:reduce){#pkm-hud-win,#pkm-hud-mask,.card-frame,.nearby-card,.nb-cell,.hp-fill,.exp-fill{transition:none!important}.map-pin,.fab-update-dot,.map-island-label.hl{animation:none!important}}';

/* 每次进聊天（脚本重新执行）都像第一次一样完整重建 HUD：
 * 先清掉上一轮留下的悬浮球/遮罩/窗口/样式，再从头加载缓存数据重新渲染。 */
try{
  var _deadIds=['pkm-hud-btn','pkm-hud-mapfab','pkm-hud-mask','pkm-hud-win'];
  for(var _di=0;_di<_deadIds.length;_di++){
    var _de=document.getElementById(_deadIds[_di]);
    if(_de&&_de.parentNode){_de.parentNode.removeChild(_de);}
  }
}catch(e){}
try{
  var _ss=document.querySelectorAll('style');
  for(var _si=0;_si<_ss.length;_si++){
    var _st=_ss[_si];
    if(_st.textContent&&_st.textContent.indexOf('pkm-hud-btn')>=0&&_st.parentNode){_st.parentNode.removeChild(_st);}
  }
}catch(e){}
try{WIN.__pkmHudLoaded=true;}catch(e){}
try{
  if(WIN.__pkmHudAssetLocksHandler){WIN.removeEventListener('pkworkshop:asset-locks-changed',WIN.__pkmHudAssetLocksHandler);}
  if(WIN.__pkmHudAssetStorageHandler){WIN.removeEventListener('storage',WIN.__pkmHudAssetStorageHandler);}
  WIN.__pkmHudAssetLocksHandler=function(){try{pkmHudRenderCurrent();}catch(e){hudDiagError('asset lock refresh',e);}};
  WIN.__pkmHudAssetStorageHandler=function(e){try{if(e&&e.key==='pk_pokemon_asset_locks_v1')pkmHudRenderCurrent();}catch(ex){hudDiagError('asset lock storage',ex);}};
  hudScope.listen(WIN,'pkworkshop:asset-locks-changed',WIN.__pkmHudAssetLocksHandler);
  hudScope.listen(WIN,'storage',WIN.__pkmHudAssetStorageHandler);
}catch(e){hudDiagError('asset lock bind',e);}

var st=document.createElement('style');
st.type='text/css';
st.textContent=css;
(document.head||document.body).appendChild(st);
/* Tauri/安卓 WebView + 鸿蒙(TavernNext/ArkWeb) 适配：仅在这些环境下去掉图片请求 Referer（浏览器用户不受影响） */
try{
  var _ua2=(navigator.userAgent||'');
  var _isTauri=!!(WIN.__TAURI_INTERNALS__||WIN.__TAURI__)||/^tauri:/.test(WIN.location.protocol)||/tauri\.localhost/.test(WIN.location.hostname)||/Tauri/i.test(_ua2);
  var _isHarmony=/ArkWeb/i.test(_ua2)||/HarmonyOS/i.test(_ua2)||/OpenHarmony/i.test(_ua2);
  if(_isTauri||_isHarmony){
    var _rm=document.createElement('meta');
    _rm.name='referrer';
    _rm.content='no-referrer';
    var _hd=document.head||document.documentElement;
    if(_hd)_hd.insertBefore(_rm,_hd.firstChild);
  }
}catch(e){}

var MENU=[
  {key:'bag',label:'背包',emoji:'🎒',img:'https://img.baibai.cv/f/3o2qte/1788188339193.png'},
  {key:'box',label:'盒子',emoji:'📦',img:'https://media.52poke.com/wiki/d/dd/Bag_%E5%AE%9D%E5%8F%AF%E6%A2%A6%E7%9B%92_Sprite.png'},
  {key:'rel',label:'人际关系',emoji:'💬',img:''},
  {key:'rivals',label:'劲敌',emoji:'👥',img:''},
  {key:'breeding',label:'繁育',emoji:'🥚',img:'https://media.52poke.com/wiki/1/1e/Spr_6x_Egg.png',isz:20},
  {key:'pokedex',label:'图鉴',emoji:'📖',img:'https://media.52poke.com/wiki/2/2d/%E5%AF%B6%E5%8F%AF%E5%A4%A2%E5%9C%96%E9%91%91_LPLE.png'},
  {key:'badge',label:'徽章盒',emoji:'🏅',img:''},
  {key:'diy',label:'DIY',emoji:'🛠️',img:''},
  {key:'map',label:'地图',emoji:'🗺️',img:''},
  {key:'settings',label:'设置',emoji:'⚙️',img:''}
];

var DEFAULT_STAT={"训练家":{"名字":"","活力":3,"活力上限":3,"金钱":0,"徽章":"","身份":"","声望":"0 无名","气场":"无","可命令等级":10},"队伍":{"1":{"名字":"空"},"2":{"名字":"空"},"3":{"名字":"空"},"4":{"名字":"空"},"5":{"名字":"空"},"6":{"名字":"空"}},"附近宝可梦":{},"背包":{},"盒子":{},"人际关系":{},"任务":{"主线":"","支线":"","传说":""},"劲敌":{},"通讯录":{},"繁育":{"蛋":"","剩余步数":0,"存放":""},"世界事件":{"附近遭遇":"","地区新闻":"","区域动态":""},"战场":{"场景":"","规则":"","场上":{},"各方":{}},"环境":{"当前地点":"","日期":"","时间":"","赛程":""}};

function cloneStat(){try{if(typeof WIN.structuredClone==='function')return WIN.structuredClone(DEFAULT_STAT);}catch(e){}return JSON.parse(JSON.stringify(DEFAULT_STAT));}
function mergeStat(extra){
  var out=cloneStat();
  function m(a,b){for(var k in b){if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])&&a[k]&&typeof a[k]==='object'){m(a[k],b[k]);}else{a[k]=b[k];}}}
  if(extra)m(out,extra);
  return out;
}
function loadFromMvu(){
  try{
    var mv=WIN.Mvu||window.Mvu;
    if(!mv||!mv.getMvuData)return null;
    var d=null;
    try{
      var f=window.frameElement;
      if(f&&f.closest){
        var m=f.closest('.mes');
        var id=m?parseInt(m.getAttribute('mesid')||''):NaN;
        if(!isNaN(id))d=mv.getMvuData({type:'message',message_id:id});
      }
    }catch(e){}
    if(!(d&&d.stat_data&&d.stat_data.训练家)){
      try{
        var mes=WIN.document.querySelectorAll('.mes');
        for(var i=mes.length-1;i>=0;i--){
          var mid=parseInt(mes[i].getAttribute('mesid')||'');
          if(isNaN(mid))continue;
          var dd=mv.getMvuData({type:'message',message_id:mid});
          if(dd&&dd.stat_data&&dd.stat_data.训练家){d=dd;break;}
        }
      }catch(e){}
    }
    return (d&&d.stat_data&&d.stat_data.训练家)?mergeStat(d.stat_data):null;
  }catch(e){return null;}
}
function loadFromText(text){
  try{
    if(!text)return null;
    var re=/\u005B([^\u005D]+)\u005D([\s\S]*?)\u005B\/\1\u005D/g,blocks={},bm;
    while((bm=re.exec(text))!==null){
      var oo={};
      bm[2].trim().split('\n').forEach(function(line){
        var idx=line.indexOf(':');
        if(idx<0)return;
        oo[line.slice(0,idx).trim()]=line.slice(idx+1).trim();
      });
      blocks[bm[1]]=oo;
    }
    if(!blocks['训练家信息'])return null;
    var out=cloneStat(),tr=blocks['训练家信息'];
    var np=(tr['名字']||'').split('|');
    out.训练家.名字=np[0].trim();
    if(np[1]){var vv=np[1].match(/(\d+)\/(\d+)/);if(vv){out.训练家.活力=parseInt(vv[1],10);out.训练家.活力上限=parseInt(vv[2],10);}}
    var mp=(tr['金钱']||'0').split('|');
    out.训练家.金钱=parseInt(mp[0],10)||0;
    if(mp[1]){var pp=mp[1].match(/(\d+)/);if(pp)out.训练家.PP=parseInt(pp[1],10);}
    out.训练家.徽章=tr['徽章']||'';
    out.训练家.身份=tr['身份']||'';
    out.训练家.声望=tr['声望']||'0 无名';
    out.训练家.气场=tr['气场']||'无';
    out.训练家.可命令等级=parseInt(tr['可命令等级']||'0',10)||0;
    var team=blocks['队伍状态']||{};
    for(var i=1;i<=6;i++){
      var nm=team['队伍'+i+'_名字'];
      if(!nm||nm==='空')continue;
      out.队伍[String(i)]={名字:nm,英文名:'',昵称:'',等级:parseInt(team['队伍'+i+'_等级']||'1',10)||1,性别:team['队伍'+i+'_性别']||'',是否闪光:team['队伍'+i+'_是否闪光']==='是',图标:team['队伍'+i+'_图标']||'',HP:team['队伍'+i+'_HP']||'0/0',经验:team['队伍'+i+'_经验']||'0/0',属性1:team['队伍'+i+'_属性1']||'',属性2:team['队伍'+i+'_属性2']||'无',技能:team['队伍'+i+'_技能']||'',性格:team['队伍'+i+'_性格']||'',特性:team['队伍'+i+'_特性']||'',携带道具:team['队伍'+i+'_携带道具']||'无',携带道具英文:'',亲密度:parseInt(team['队伍'+i+'_亲密度']||'0',10)||0,个体值:team['队伍'+i+'_个体值']||'',精灵球:team['队伍'+i+'_精灵球']||'',精灵球英文:team['队伍'+i+'_精灵球英文']||'',孵化剩余:team['队伍'+i+'_孵化剩余']||''};
    }
    var near=blocks['附近宝可梦']||{},ng={};
    for(var k in near){var mt=k.match(/附近(\d+)_(.+)/);if(mt){ng[mt[1]]=ng[mt[1]]||{};ng[mt[1]][mt[2]]=near[k];}}
    for(var g in ng){var dd=ng[g];out.附近宝可梦[g]={名字:dd['名字']||'',英文名:'',数量:parseInt(dd['数量']||'1',10)||1,是否闪光:dd['是否闪光']==='是',状态:dd['状态']||'普通',图标:dd['图标']||''};}
    for(var bk in blocks){if(bk.indexOf('背包_')===0){var cat=bk.replace('背包_','');var its=blocks[bk];for(var it in its){var ps=its[it].split(',');out.背包[it]={类型:cat,数量:parseInt(ps[0],10)||0,图标:(ps[1]||'').trim()};}}}
    var rel=blocks['人际关系']||{};
    for(var rn in rel){var rv=rel[rn].match(/(\d+)/);out.人际关系[rn]={好感度:rv?parseInt(rv[1],10):0};}
    return out;
  }catch(e){return null;}
}
function loadStatDataLight(){
  var d=loadFromMvu();
  if(d)return d;
  try{var backup=JSON.parse(localStorage.getItem('pk_mvu_backup_'+chatKey())||'null');if(backup&&backup.训练家)return backup;}catch(e){}
  try{
    var el=WIN.document.querySelector('.statusbar-data-source')||document.querySelector('.statusbar-data-source');
    if(el){
      var t=loadFromText(el.value||el.textContent||'');
      if(t)return t;
    }
  }catch(e){}
  return DEFAULT_STAT;
}
function loadStatData(){
  var d=loadFromMvu();
  if(d){try{localStorage.setItem('pk_mvu_backup_'+chatKey(),JSON.stringify(d));}catch(e){}return d;}
  return loadStatDataLight();
}

var stat_data=loadStatData();
/* v1.8.0：永久ID位置索引 + 增量 revision。getStateRevision 不再每次 stringify 全队伍/盒子。 */
var hudLocationIndex=new Map(),hudLocationIndexDirty=true,hudStateRevCounter=1,hudStateFingerprint='';
function hudRebuildLocationIndex(){
  var idx=new Map();
  function add(id,loc){id=String(id||'');if(!id)return;var a=idx.get(id);if(!a){a=[];idx.set(id,a);}a.push(loc);}
  try{var t=(stat_data&&stat_data.队伍)||{};for(var i=1;i<=6;i++){var p=t[String(i)],id=hudPokemonId(p);if(id)add(id,{type:'team',slot:String(i),pokemon:pkmHudClone(p)});}var bs=(stat_data&&stat_data.盒子)||{};Object.keys(bs).forEach(function(b){var box=bs[b]||{};Object.keys(box).forEach(function(sl){var p2=box[sl],id2=hudPokemonId(p2);if(id2)add(id2,{type:'box',box:String(b),slot:String(sl),pokemon:pkmHudClone(p2)});});});}catch(e){hudDiagError('location index',e);}
  hudLocationIndex=idx;hudLocationIndexDirty=false;hudDiagInc('locationIndexRebuild');return idx;
}
function hudComputeStateFingerprint(){try{var raw=JSON.stringify({队伍:(stat_data&&stat_data.队伍)||{},盒子:(stat_data&&stat_data.盒子)||{}}),h=2166136261;for(var i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16)+':'+raw.length;}catch(e){return '';}}
function hudMarkStateDirty(reason){hudLocationIndexDirty=true;hudStateRevCounter++;if(hudStateRevCounter>2147483000)hudStateRevCounter=1;hudStateFingerprint=hudComputeStateFingerprint();if(reason)hudDiagEvent('state',reason);}
function hudExternalStateChanged(){
  try{var fp=hudComputeStateFingerprint();if(fp!==hudStateFingerprint){hudStateFingerprint=fp;hudLocationIndexDirty=true;hudStateRevCounter++;if(hudStateRevCounter>2147483000)hudStateRevCounter=1;return true;}}catch(e){}return false;
}
function hudEnsureLocationIndex(){if(hudLocationIndexDirty)hudRebuildLocationIndex();return hudLocationIndex;}
try{hudExternalStateChanged();hudRebuildLocationIndex();}catch(e){}

/* ===== Workshop / 外部工具实时状态桥 =====
 * HUD 的盒子/队伍操作先修改内存 stat_data，再写回同一条 MVU 数据，
 * 让外部 Workshop 在 AI 回复前就能读到最新队伍；同时公开只读实时接口。
 */
var __pkmHudPersistQueue=Promise.resolve();
/* v1.7.5：所有 HUD → MVU 写入带 epoch。外部权威资产事务会提升 epoch，
 * 尚未开始的旧乐观快照写入会自动作废；权威写入排在已有队列之后，确保最终状态不会被旧快照“复活”。 */
var __pkmHudPersistEpoch=0;
function pkmHudClone(v){try{if(typeof WIN.structuredClone==='function')return WIN.structuredClone(v);}catch(e){}try{return JSON.parse(JSON.stringify(v));}catch(e2){return v;}}
function pkmHudMvuTarget(){
  try{
    var mv=WIN.Mvu||window.Mvu;
    if(!mv||typeof mv.getMvuData!=='function')return null;
    try{
      var latest=mv.getMvuData({type:'message',message_id:'latest'});
      if(latest&&latest.stat_data&&latest.stat_data.队伍){
        return {mv:mv,data:latest,opt:{type:'message',message_id:'latest'}};
      }
    }catch(e){}
    var mes=[];
    try{mes=WIN.document.querySelectorAll('.mes');}catch(e){}
    for(var i=mes.length-1;i>=0;i--){
      var id=parseInt(mes[i].getAttribute('mesid')||'',10);
      if(isNaN(id))continue;
      try{
        var d=mv.getMvuData({type:'message',message_id:id});
        if(d&&d.stat_data&&d.stat_data.队伍){
          return {mv:mv,data:d,opt:{type:'message',message_id:id}};
        }
      }catch(e){}
    }
  }catch(e){}
  return null;
}
function pkmHudPersistStatData(opt){
  opt=opt||{};
  pkmLastLocalWrite=Date.now();
  hudMarkStateDirty(opt.force?'authoritative-persist':'local-persist');
  var epoch=(opt.epoch==null?__pkmHudPersistEpoch:Number(opt.epoch)||0);
  var snap=pkmHudClone(stat_data);
  __pkmHudPersistQueue=__pkmHudPersistQueue.catch(function(){return false;}).then(function(){
    /* 旧的普通乐观写入若在权威资产事务之后才轮到执行，直接跳过。 */
    if(!opt.force&&epoch!==__pkmHudPersistEpoch)return false;
    var t=pkmHudMvuTarget();
    if(!t||!t.mv||typeof t.mv.replaceMvuData!=='function')return false;
    var n=pkmHudClone(t.data)||{};
    n.stat_data=snap;
    var p;
    try{p=t.mv.replaceMvuData(n,t.opt);}catch(e){return false;}
    return Promise.resolve(p).then(function(){
      try{localStorage.setItem('pk_mvu_backup_'+chatKey(),JSON.stringify(snap));}catch(e){}
      try{hudRebuildLocationIndex();}catch(e){}
      try{pkmAutoSnap=pkmStateSnapshot(snap);}catch(e){}
      return true;
    }).catch(function(){return false;});
  });
  return __pkmHudPersistQueue;
}
function pkmHudAuthoritativeAssetMutation(opt){
  opt=opt&&typeof opt==='object'?opt:{};
  var action=String(opt.action||''),id=String(opt.pokemonId||opt.pokemon_id||'').trim();
  if(!id)return Promise.reject(new Error('缺少永久精灵ID'));
  if(action!=='remove-box-by-id'&&action!=='replace-box-by-id')return Promise.reject(new Error('HUD 不支持该资产变动：'+action));
  var loc=hudFindPokemonLocations(id);
  if(loc.length>1)return Promise.reject(new Error('HUD 检测到 '+loc.length+' 个同一精灵ID实体，已拒绝自动修改'));
  if(!loc.length)return Promise.resolve({ok:true,notFound:true,pokemonId:id});
  var hit=loc[0];
  if(hit.type!=='box')return Promise.reject(new Error('同ID精灵当前位于队伍，不能由云仓自动清理'));
  stat_data.盒子=stat_data.盒子||{};
  var box=stat_data.盒子[String(hit.box)];
  if(!box)return Promise.reject(new Error('HUD 盒子位置已变化，请重新扫描'));
  var current=box[String(hit.slot)];
  if(!current||hudPokemonId(current)!==id)return Promise.reject(new Error('HUD 精灵位置已变化，请重新扫描'));
  var replacement=(opt.replacement&&typeof opt.replacement==='object')?pkmHudClone(opt.replacement):{名字:'空'};
  box[String(hit.slot)]=replacement;
  __pkmHudPersistEpoch++;
  var authoritativeEpoch=__pkmHudPersistEpoch;
  return pkmHudPersistStatData({force:true,epoch:authoritativeEpoch}).then(function(ok){
    if(!ok)throw new Error('HUD 权威资产状态写回 MVU 失败');
    try{pkmHudRenderCurrent();}catch(e){}
    return {ok:true,pokemonId:id,type:'box',box:String(hit.box),slot:String(hit.slot),replacement:pkmHudClone(replacement),stateRevision:hudStateRevision()};
  });
}
function pkmHudRenderCurrent(){
  try{render();resizeFrame();return true;}catch(e){return false;}
}

var winMode='0';
try{winMode=localStorage.getItem('pk_winmode')||'0';}catch(e){winMode='0';}
function lsGet(key,fb){
  if(hudIsCacheKey(key)){
    if(Object.prototype.hasOwnProperty.call(hudCacheMem,key)){hudCacheTouch(key);return pkmHudClone(hudCacheMem[key]);}
    try{var raw=localStorage.getItem(key);if(raw!=null){var v=raw;try{v=JSON.parse(raw);}catch(e){}hudCacheMem[key]=v;hudCachePut(key,v).then(function(ok){if(ok)try{localStorage.removeItem(key);}catch(e){}});return pkmHudClone(v);}}catch(e){hudDiagError('cache legacy read',e);}
    return fb;
  }
  try{var v2=JSON.parse(localStorage.getItem(key));return (v2==null)?fb:v2;}catch(e){return fb;}
}
function lsSet(key,v){
  if(hudIsCacheKey(key)){hudCachePut(key,pkmHudClone(v));return;}
  try{localStorage.setItem(key,JSON.stringify(v));}catch(e){hudDiagError('localStorage set '+key,e);}
}
var DIY_INPUT_STYLE='width:100%;box-sizing:border-box;padding:6px 10px;margin-bottom:6px;font-family:inherit;font-size:.85rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none;display:block';
var diyType='move';
var diyStorageRawSeen='';
var hudDiyNameIndex=new Map();
function diyNormalizeData(d){
  d=(d&&typeof d==='object')?d:{};
  d.move=(d.move&&typeof d.move==='object')?d.move:{};
  d.ability=(d.ability&&typeof d.ability==='object')?d.ability:{};
  d.item=(d.item&&typeof d.item==='object')?d.item:{};
  d.pokemon=(d.pokemon&&typeof d.pokemon==='object')?d.pokemon:{};
  return d;
}
function hudDiyIndexKey(n){return String(n||'').trim().toLowerCase();}
function hudBuildDiyIndex(){
  var idx=new Map(),bucket=(diyData&&diyData.pokemon)||{};
  function put(n,rootKey,root,stage,stageIndex){if(!n)return;var keys=[String(n).trim(),baseName(String(n).trim())];for(var q=0;q<keys.length;q++){var k=hudDiyIndexKey(keys[q]);if(k&&!idx.has(k))idx.set(k,{rootKey:String(rootKey),root:root,stage:stage,stageIndex:stageIndex});}}
  Object.keys(bucket).forEach(function(rootKey){var root=bucket[rootKey];if(!root)return;put(rootKey,rootKey,root,root,-1);put(root.name,rootKey,root,root,-1);if(Array.isArray(root.chain))root.chain.forEach(function(st,i){if(st)put(st.name,rootKey,root,st,i);});});
  hudDiyNameIndex=idx;hudDiagInc('diyIndexRebuild');return idx;
}
function hudDiyLookup(name){if(!name)return null;var k=hudDiyIndexKey(String(name).trim()),x=hudDiyNameIndex.get(k);if(x)return x;var b=hudDiyIndexKey(baseName(String(name).trim()));return hudDiyNameIndex.get(b)||null;}
function diyLoad(){
  try{var raw=localStorage.getItem('pk_diy')||'';diyStorageRawSeen=raw;var d=raw?JSON.parse(raw):null;if(d&&typeof d==='object')return diyNormalizeData(d);}catch(e){hudDiagError('DIY load',e);}
  return {move:{},ability:{},item:{},pokemon:{}};
}
var diyData=diyLoad();
hudBuildDiyIndex();
diyPreloadImages();
hudScope.setTimeout(function(){hudMigrateInlineDiyAssets();},120);
/* 供外部脚本（如创意工坊）直接抓取当前内存 DIY 数据，无需分享码 */
try{WIN.__pkmDiyData=function(){return diyData;};}catch(e){}
try{if(window!==WIN)window.__pkmDiyData=function(){return diyData;};}catch(e){}
var diyDelStep=0,diyDelType='move',diyDelName='';
var diyEditingName='';
var diyClearStep=0;
function diySyncFromStorage(force){
  try{
    var raw=localStorage.getItem('pk_diy')||'';
    if(!force&&raw===diyStorageRawSeen)return false;
    diyStorageRawSeen=raw;
    var d=raw?JSON.parse(raw):null;
    if(d&&typeof d==='object'){diyData=diyNormalizeData(d);hudBuildDiyIndex();diyPreloadImages();return true;}
  }catch(e){hudDiagError('DIY sync',e);}
  return false;
}
function diyCanonicalizeRuntimeUrls(v){
  if(typeof v==='string')return hudDiyRefByBlob[v]||v;
  if(Array.isArray(v))return v.map(diyCanonicalizeRuntimeUrls);
  if(v&&typeof v==='object'){Object.keys(v).forEach(function(k){v[k]=diyCanonicalizeRuntimeUrls(v[k]);});}
  return v;
}
function diySave(opt){
  opt=opt||{};
  try{
    diyData=diyNormalizeData(diyCanonicalizeRuntimeUrls(diyData));
    var raw=JSON.stringify(diyData);
    localStorage.setItem('pk_diy',raw);diyStorageRawSeen=raw;hudBuildDiyIndex();
  }catch(e){hudDiagError('DIY save',e);}
  diyPreloadImages();
  if(!opt.skipAssetMigration)hudScope.setTimeout(hudMigrateInlineDiyAssets,20);
}
/* Phone Suite / 创意工坊通过 localStorage fallback 写入后，HUD 立即刷新内存与 DIY 页面。 */
try{hudScope.listen(WIN,'pkworkshop:diy-imported',function(){
  try{diySyncFromStorage(true);hudBuildDiyIndex();diyPreloadImages();pkmHudRenderCurrent();}catch(e){hudDiagError('Workshop DIY sync event',e);}
});}catch(e){}
function hudMigrateInlineDiyAssets(){
  var jobs=[],changed=false;
  function one(obj,key){if(!obj||!obj[key])return;var v=String(obj[key]||'');if(/^data:image\//i.test(v))jobs.push(hudDiyAssetStoreBlob(hudDataUrlBlob(v)).then(function(ref){obj[key]=ref;changed=true;}));else if(v.indexOf(HUD_DIY_SCHEME)===0)hudDiyAssetResolve(v);}
  try{Object.keys((diyData&&diyData.pokemon)||{}).forEach(function(k){var o=diyData.pokemon[k];one(o,'img');if(o&&Array.isArray(o.chain))o.chain.forEach(function(st){one(st,'img');});});Object.keys((diyData&&diyData.item)||{}).forEach(function(k){one(diyData.item[k],'img');});}catch(e){hudDiagError('DIY asset scan',e);}
  if(!jobs.length)return Promise.resolve(false);
  return Promise.all(jobs).then(function(){if(changed){diySave({skipAssetMigration:true});hudDiagEvent('DIY','DataURL 图片已迁入 IndexedDB');}return changed;}).catch(function(e){hudDiagError('DIY asset migrate',e);return false;});
}
/* 每次自创/编辑保存后：把 DIY 精灵/道具图片预加载进浏览器缓存，
 * 并原地刷新主页队伍卡片，让队伍界面马上显示自创精灵图片。 */
function diyPreloadImages(){
  try{
    var seen={};
    function add(u){
      u=String(u==null?'':u).trim();
      if(!u||seen[u])return;seen[u]=1;
      if(u.indexOf(HUD_DIY_SCHEME)===0){hudDiyAssetResolve(u);return;}
      if(!/^(?:https?:\/\/|data:image\/)/i.test(u))return;
      try{var im=new Image();try{im.referrerPolicy='no-referrer';}catch(e2){}im.onerror=function(){try{im.onerror=null;}catch(e3){}};im.src=u;}catch(e4){}
    }
    var p=diyData.pokemon||{};
    for(var k in p){
      var o=p[k];
      if(!o)continue;
      add(o.img);
      if(o.chain){for(var i=0;i<o.chain.length;i++){var st=o.chain[i];if(st)add(st.img);}}
    }
    var it=diyData.item||{};
    for(var k2 in it){var io=it[k2];if(io)add(io.img);}
  }catch(e){}
}
function diyRefreshTeam(){
  try{
    cards=buildCards();
    var grid=document.querySelector('#tab-1 .grid');
    if(grid){grid.outerHTML=teamHTML();}
    pkImgFix(document);resolvePkmImgs(document);resolveItemImgs(document);hudResolvePkidbImages(document);resizeFrame();
  }catch(e){hudDiagError('DIY team refresh',e);}
}
/* v1.6.3 / Bridge API v2：精灵资产锁与云仓引用识别 */
var PKM_ASSET_LOCKS_KEY='pk_pokemon_asset_locks_v1';
function hudPokemonId(p){p=p&&typeof p==='object'?p:{};return String(p.精灵ID||p.pokemonId||p.培育实例ID||p.nurseryInstanceId||'').trim();}
function hudIsCloudStub(p){return !!(p&&typeof p==='object'&&(p.云端引用===true||p.云端引用===1||String(p.云端状态||'').toLowerCase()==='cold'||String(p.云端状态||'').toLowerCase()==='cloud'));}
function hudAssetChatKey(){try{var ST=WIN&&WIN.SillyTavern,ctx=ST&&ST.getContext?ST.getContext():null,id=ctx&&((typeof ctx.getCurrentChatId==='function'&&ctx.getCurrentChatId())||ctx.chatId);if(id!==undefined&&id!==null&&String(id)!=='')return 'chat:'+String(id);}catch(e){}return '';}
function hudAssetLocks(){try{var x=JSON.parse(WIN.localStorage.getItem(PKM_ASSET_LOCKS_KEY)||'null'),ck=hudAssetChatKey();if(!x||!Array.isArray(x.locks))return [];if(ck&&x.chatKey&&String(ck)!==String(x.chatKey))return [];return x.locks;}catch(e){return [];}}
function hudPokemonLockById(id){id=String(id||'');if(!id)return null;var a=hudAssetLocks();for(var i=0;i<a.length;i++)if(String(a[i]&&a[i].pokemonId||'')===id)return a[i];return null;}
function hudPokemonLock(p){return hudPokemonLockById(hudPokemonId(p));}
function hudAssertPokemonMutable(p,action){if(!p||!p.名字||p.名字==='空')return true;if(hudIsCloudStub(p)){hudMsg('这是得文云仓的冷存引用，不能在 HUD 中直接'+String(action||'修改')+'。请到小手机 → 培育中心 → 得文云仓正式取回。');return false;}var l=hudPokemonLock(p);if(l){var label=String(l.type||'资产事务');hudMsg('这只精灵正在执行「'+label+'」，HUD 已暂时锁定'+String(action||'修改')+'操作。请先在小手机完成/恢复该事务。');return false;}return true;}
function hudPhoneAssetBridge(){try{return (WIN.__PokemonPhoneSuite&&WIN.__PokemonPhoneSuite.pokemonAssets)||(window.__PokemonPhoneSuite&&window.__PokemonPhoneSuite.pokemonAssets)||null;}catch(e){return null;}}
function hudEnsurePokemonIdentity(p){
  if(!p||typeof p!=='object'||!p.名字||p.名字==='空')return '';
  var id=hudPokemonId(p);if(id)return id;
  try{var a=hudPhoneAssetBridge();if(a&&typeof a.makePokemonId==='function'&&typeof a.stampIdentity==='function'){id=String(a.makePokemonId('PKM-HUD')||'');if(id)a.stampIdentity(p,id);}}catch(e){}
  return hudPokemonId(p);
}
function hudRecordAssetMutation(p,opt){
  try{
    if(!p||typeof p!=='object')return false;
    hudEnsurePokemonIdentity(p);
    var a=hudPhoneAssetBridge();
    if(a&&typeof a.recordMutation==='function')return !!a.recordMutation(p,opt||{});
  }catch(e){}
  return false;
}
function hudFindPokemonLocations(id){id=String(id||'');if(!id)return [];var a=hudEnsureLocationIndex().get(id)||[];return a.map(function(x){return pkmHudClone(x);});}
function hudStateRevision(){return 'r'+String(hudStateRevCounter)+':'+String(hudStateFingerprint||hudComputeStateFingerprint()||'0');}

/* v1.7.7（融合脚本2 v1.7.6）：给 Phone Suite / 云仓 / 交换提供与 HUD 显示逻辑一致的 DIY 解析。
 * 对外优先返回 localStorage 中 canonical pk_diy（包括 pkidb:// 持久图片引用），
 * 避免把运行时 blob: URL 写进云仓/交换恢复事务。 */
function hudDiyCanonicalData(){
  try{
    var raw=localStorage.getItem('pk_diy')||'';
    if(raw){var d=JSON.parse(raw);if(d&&typeof d==='object')return diyNormalizeData(d);}
  }catch(e){}
  try{diySyncFromStorage(false);}catch(e){}
  return diyNormalizeData(pkmHudClone(diyData||{}));
}
function hudResolveDiyPokemonInfo(input){
  var p=(input&&typeof input==='object')?input:{名字:String(input||'')},name=String(p.名字||p.name||'').trim();
  if(!name)return {isDiy:false,name:'',rootKey:'',stageIndex:-1,image:''};
  try{diySyncFromStorage(false);}catch(e){}
  var hit=hudDiyLookup(name);if(!hit)return {isDiy:false,name:name,rootKey:'',stageIndex:-1,image:''};
  var root=hit.root||{},stage=hit.stage||root,img=String(stage.img||root.img||'').trim();
  if(!img&&root.chain&&root.chain.length){for(var z=0;z<root.chain.length;z++){if(root.chain[z]&&root.chain[z].img){img=String(root.chain[z].img);break;}}}
  return {isDiy:true,name:name,rootKey:String(hit.rootKey||''),stageIndex:Number(hit.stageIndex),stageName:String(stage.name||name),image:img,root:pkmHudClone(root),stage:pkmHudClone(stage)};
}

/* 创意工坊优先使用这个 API 获取“HUD 此刻真正显示的队伍/盒子”，
 * 而不是等待下一次 AI 回复后才更新的旧 MVU 快照。
 */
(function(){
  var api={
    version:'2.6.0',
    capabilities:{pokemonIdentity:true,assetLocks:true,cloudStubs:true,stateRevision:true,locations:true,assetMutationBridge:true,authoritativeAssetMutation:true,diyCanonicalData:true,diyPokemonResolver:true,spriteProviders:true,dynamicSpriteUrls:true,diyBundleInstallV2:true,diyWorldbookSync:true,diyAssetCanonicalRef:true,diyAssetPersistence:true},
    getStatData:function(){return pkmHudClone(stat_data);},
    getTeam:function(){return pkmHudClone((stat_data&&stat_data.队伍)||{});},
    getBoxes:function(){return pkmHudClone((stat_data&&stat_data.盒子)||{});},
    getPokemon:function(id){var a=hudFindPokemonLocations(id);return a.length?pkmHudClone(a[0]):null;},
    findPokemonLocations:function(id){return hudFindPokemonLocations(id);},
    getPokemonLock:function(id){var x=hudPokemonLockById(id);return x?pkmHudClone(x):null;},
    isCloudStub:function(p){return hudIsCloudStub(p);},
    ensurePokemonIdentity:function(p){return hudEnsurePokemonIdentity(p);},
    recordAssetMutation:function(p,opt){return hudRecordAssetMutation(p,opt||{});},
    applyAssetMutation:function(opt){return pkmHudAuthoritativeAssetMutation(opt||{});},
    getStateRevision:function(){return hudStateRevision();},
    getDiyData:function(){try{diySyncFromStorage(false);}catch(e){}return pkmHudClone(diyData||{});},
    getDiyDataCanonical:function(){return pkmHudClone(hudDiyCanonicalData());},
    getDiyPokemonInfo:function(input){return pkmHudClone(hudResolveDiyPokemonInfo(input));},
    canonicalizeImageRef:function(value){return hudDiyAssetCanonicalRef(value);},
    persistImageValue:function(value){return hudDiyAssetPersistValue(value);},
    getSpriteProviders:function(){return pkmHudClone(hudSpriteProviders());},
    buildPokemonSpriteUrls:function(opt){return pkmHudClone(hudBuildPokemonSpriteUrls(opt||{}));},
    reloadDiy:function(){try{diySyncFromStorage(true);pkmHudRenderCurrent();return true;}catch(e){return false;}},
    installDiyBundle:function(bundle,opt){
      opt=opt&&typeof opt==='object'?opt:{};
      bundle=bundle&&typeof bundle==='object'?bundle:{};
      /* 兼容工坊/交换可能外包一层 diy 或 bundle，同时只接受四个正式 bucket。 */
      if(bundle.diy&&typeof bundle.diy==='object')bundle=bundle.diy;
      else if(bundle.bundle&&typeof bundle.bundle==='object')bundle=bundle.bundle;
      try{diySyncFromStorage(false);}catch(e){}
      diyData=diyNormalizeData(diyData);
      var count=0,pokemon=0,changed=0,installed=[],worldbookQueue=[];
      ['move','ability','item','pokemon'].forEach(function(t){
        var src=bundle[t]&&typeof bundle[t]==='object'&&!Array.isArray(bundle[t])?bundle[t]:{};
        diyData[t]=diyData[t]||{};
        Object.keys(src).forEach(function(k){
          var name=String(k||'').trim();if(!name)return;
          var existed=Object.prototype.hasOwnProperty.call(diyData[t],name);
          var before=existed?JSON.stringify(diyData[t][name]):'';
          var next=pkmHudClone(src[k]);
          diyData[t][name]=next;count++;if(t==='pokemon')pokemon++;
          var different=!existed||before!==JSON.stringify(next);if(different)changed++;
          installed.push({type:t,name:name,existed:existed,changed:different});
          if(opt.writeLorebook)worldbookQueue.push({type:t,name:name,existed:existed});
        });
      });
      diySave();
      try{pkmHudRenderCurrent();}catch(e){}
      /* 世界书采用“新条目创建 / 同名条目更新”而不是无条件 create，避免工坊重复导入制造重复条目。
         错开命令发送，兼容 SillyTavern 连续 slash command 被吞的环境。 */
      if(worldbookQueue.length){
        worldbookQueue.forEach(function(row,idx){
          hudScope.setTimeout(function(){
            try{diyWriteLorebook(row.type,row.name,row.existed?row.name:'',true);}catch(e){hudDiagError('Workshop worldbook sync',e);}
          },idx*650);
        });
      }
      try{WIN.dispatchEvent(new CustomEvent('pkm-hud:diy-installed',{detail:{source:String(opt.source||'external'),count:count,pokemon:pokemon,changed:changed,worldbookQueued:worldbookQueue.length}}));}catch(e){}
      return {count:count,pokemon:pokemon,changed:changed,installed:installed,worldbookQueued:worldbookQueue.length,worldbookScheduled:worldbookQueue.length>0};
    },
    persist:function(){return pkmHudPersistStatData();},
    refreshView:function(){return pkmHudRenderCurrent();},
    refreshFromMvu:function(){try{hudRefresh();return true;}catch(e){return false;}},
    setTeamSlot:function(slot,pokemon){
      slot=String(parseInt(slot,10)||'');if(!slot||Number(slot)<1||Number(slot)>6)return Promise.reject(new Error('无效队伍位置'));
      stat_data.队伍=stat_data.队伍||{};var cur=stat_data.队伍[slot],incoming=pokemon||{名字:'空'};
      if(cur&&cur.名字&&cur.名字!=='空'&&(hudPokemonLock(cur)||hudIsCloudStub(cur)))return Promise.reject(new Error('当前队伍位置的精灵正在资产事务中或是云仓引用，拒绝外部覆盖'));
      if(incoming&&incoming.名字&&incoming.名字!=='空'&&(hudPokemonLock(incoming)||hudIsCloudStub(incoming)))return Promise.reject(new Error('目标精灵正在资产事务中或是云仓引用，拒绝通过通用 HUD API 移动'));
      stat_data.队伍[slot]=pkmHudClone(incoming);return pkmHudPersistStatData().then(function(){pkmHudRenderCurrent();return true;});
    }
  };
  try{WIN.__pkmHudApi=api;}catch(e){}
  try{if(window!==WIN)window.__pkmHudApi=api;}catch(e){}
})();

function diyGet(type,name){if(!name)return null;var t=diyData[type]||{};return t[name]||null;}
function diyHas(type,name){
  if(!name)return false;
  if(type==='pokemon')return !!hudDiyLookup(name);
  var p=diyData[type]||{};return !!(p[name]||p[baseName(name)]);
}
function diyLabel(type){return {move:'技能',ability:'特性',item:'道具',pokemon:'精灵'}[type]||'';}
function diyVal(id){var e=document.getElementById(id);return e?e.value.trim():'';}
function diyInput(id,ph){return '<input type="text" id="'+id+'" placeholder="'+esc(ph)+'" style="'+DIY_INPUT_STYLE+'">';}
function diyArea(id,ph){return '<textarea id="'+id+'" placeholder="'+esc(ph)+'" style="'+DIY_INPUT_STYLE+'min-height:56px;resize:vertical"></textarea>';}
function diyStatInput(id,ph){return '<input type="text" id="'+id+'" placeholder="'+esc(ph)+'" style="flex:1;min-width:0;box-sizing:border-box;padding:6px 8px;font-family:inherit;font-size:.85rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none">';}
function diyStatsText(st){
  if(!st)return '';
  if(typeof st==='string')return st;
  return 'HP '+(st.hp||'-')+' · 攻击 '+(st.atk||'-')+' · 防御 '+(st.def||'-')+' · 特攻 '+(st.spa||'-')+' · 特防 '+(st.spd||'-')+' · 速度 '+(st.spe||'-');
}
/* ===== DIY 精灵：本地图片/GIF 上传 + AI 识图（外观描述） ===== */
function diyVisionDefaults(){return {provider:'openai',baseUrl:'',apiKey:'',model:'',proxyBase:'',proxyToken:'',maxTokens:'2048',rememberSecrets:false};}
var DIY_VISION_CFG_KEY='pk_vision_cfg',DIY_VISION_SESSION_SECRET='pk_vision_secret_session_v2',DIY_VISION_SAVED_SECRET='pk_vision_secret_saved_v2';
function diyVisionDefaultBase(provider){
  if(provider==='gemini')return 'https://generativelanguage.googleapis.com/v1beta';
  if(provider==='claude')return 'https://api.anthropic.com';
  return 'https://api.openai.com/v1';
}
function diyVisionDefaultPrompt(){
  return '请描述这张图片中宝可梦（精灵）的外观：包括体型、主要配色、花纹/斑纹、头部特征、眼睛、四肢、尾巴、翅膀、装饰物等。用简洁的中文写一段详细的外观描述，直接输出描述，不要多余说明。';
}
function diyVisionCfg(){
  var d=diyVisionDefaults(),c=null;
  try{c=JSON.parse(localStorage.getItem(DIY_VISION_CFG_KEY)||'null');if(c&&typeof c==='object'){['provider','baseUrl','model','proxyBase','maxTokens','rememberSecrets'].forEach(function(k){if(c[k]!=null)d[k]=c[k];});}}catch(e){}
  /* 兼容旧版把秘密直接放 localStorage：首次读取即迁移到 sessionStorage。 */
  try{if(c&&(c.apiKey||c.proxyToken)){sessionStorage.setItem(DIY_VISION_SESSION_SECRET,JSON.stringify({apiKey:String(c.apiKey||''),proxyToken:String(c.proxyToken||'')}));var clean=Object.assign({},c);delete clean.apiKey;delete clean.proxyToken;localStorage.setItem(DIY_VISION_CFG_KEY,JSON.stringify(clean));}}catch(e){}
  var sec=null;
  try{sec=JSON.parse((d.rememberSecrets?localStorage.getItem(DIY_VISION_SAVED_SECRET):sessionStorage.getItem(DIY_VISION_SESSION_SECRET))||'null');}catch(e){}
  if(!sec){try{sec=JSON.parse(sessionStorage.getItem(DIY_VISION_SESSION_SECRET)||'null');}catch(e){}}
  if(sec){d.apiKey=String(sec.apiKey||'');d.proxyToken=String(sec.proxyToken||'');}
  if(!d.baseUrl)d.baseUrl=diyVisionDefaultBase(d.provider);
  return d;
}
function diyVisionSave(cfg){
  cfg=Object.assign(diyVisionDefaults(),cfg||{});
  var pub={provider:cfg.provider,baseUrl:cfg.baseUrl,model:cfg.model,proxyBase:cfg.proxyBase,maxTokens:cfg.maxTokens,rememberSecrets:!!cfg.rememberSecrets};
  var sec={apiKey:String(cfg.apiKey||''),proxyToken:String(cfg.proxyToken||'')};
  try{localStorage.setItem(DIY_VISION_CFG_KEY,JSON.stringify(pub));sessionStorage.setItem(DIY_VISION_SESSION_SECRET,JSON.stringify(sec));if(pub.rememberSecrets)localStorage.setItem(DIY_VISION_SAVED_SECRET,JSON.stringify(sec));else localStorage.removeItem(DIY_VISION_SAVED_SECRET);}catch(e){hudDiagError('vision secret save',e);}
}
function diyVisionSet(key,val){var c=diyVisionCfg();c[key]=val;diyVisionSave(c);}
var diyVisionModelsCache=[];
function diyVisionProviderChange(v){
  var c=diyVisionCfg();
  c.provider=v;c.baseUrl='';c.model='';
  diyVisionSave(c);
  diyVisionModelsCache=[];
  var b=document.getElementById('vision-base');
  if(b){b.value='';b.placeholder='API 地址，如 '+diyVisionDefaultBase(v);}
  var m=document.getElementById('vision-model');
  if(m){m.value='';m.placeholder='点击右侧选择模型';}
  var pnl=document.getElementById('vision-model-panel');
  if(pnl){pnl.style.display='none';pnl.innerHTML='';}
  diyVisionModelsMsg('已切换服务商，可重新点「选择模型」获取列表');
}
function diyVisionBtnHTML(){
  return '<div class="info-frame plain-frame"><div class="info-inner"><div class="info-title">AI 识图</div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><button type="button" class="btn-small" data-vision-settings style="background:rgba(43,74,111,.7)">🤖 AI 识图设置</button><span class="dim" style="font-size:.72rem">配置 API 后，可在精灵表单里点「AI识图」自动生成外观描述</span></div></div></div>';
}
function openVisionSettings(){
  clearBack();
  var c=diyVisionCfg();
  var provSel='<select id="vision-provider" style="'+DIY_INPUT_STYLE+'">'+
    '<option value="openai"'+(c.provider==='openai'?' selected':'')+'>OpenAI 兼容（GPT-4o 等 / 中转站）</option>'+
    '<option value="gemini"'+(c.provider==='gemini'?' selected':'')+'>Google Gemini</option>'+
    '<option value="claude"'+(c.provider==='claude'?' selected':'')+'>Anthropic Claude</option>'+
    '</select>';
  var modelRow='<div style="display:flex;gap:6px;align-items:flex-start;margin-bottom:6px">'+
    '<input type="text" id="vision-model" placeholder="点击右侧选择模型" value="'+esc(c.model)+'" style="flex:1;min-width:0;box-sizing:border-box;padding:6px 10px;font-family:inherit;font-size:.85rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none;margin-bottom:0">'+
    '<button type="button" class="btn-small" data-vision-pick style="flex-shrink:0;background:rgba(43,74,111,.7)">🎯 选择模型</button>'+
    '</div>'+
    '<div id="vision-model-panel" style="display:none;max-height:200px;overflow-y:auto;border:1px solid var(--frame);border-radius:4px;background:rgba(25,40,65,.55);margin-bottom:6px"></div>'+
    '<div id="vision-models-msg" class="dim" style="font-size:.72rem;margin-bottom:6px">点「选择模型」拉取可用模型，选择后自动填入左侧输入框；也可直接手填。</div>';
  overlay.innerHTML='<div class="modal" style="max-width:480px"><div class="modal-head"><div class="modal-name">AI 识图设置</div><button class="close" data-close>✕</button></div><div class="modal-body">'+
    '<div class="set-title" style="margin-left:0">服务商</div>'+provSel+
    '<div class="set-title" style="margin-left:0">API 地址</div><input type="text" id="vision-base" placeholder="API 地址，如 '+esc(diyVisionDefaultBase(c.provider))+'" value="'+esc(c.baseUrl)+'" style="'+DIY_INPUT_STYLE+'">'+
    '<div class="set-title" style="margin-left:0">API Key</div><input type="password" id="vision-key" placeholder="API Key（必填）" value="'+esc(c.apiKey)+'" style="'+DIY_INPUT_STYLE+'">'+
    '<div class="set-title" style="margin-left:0">模型</div>'+modelRow+
    '<div class="set-title" style="margin-left:0">最大回复长度（tokens，默认 2048，被截断就调大）</div><input type="text" id="vision-max-tokens" placeholder="2048" value="'+esc(c.maxTokens)+'" style="'+DIY_INPUT_STYLE+'">'+
    '<label class="set-opt" style="margin:6px 0"><input type="checkbox" id="vision-remember-secret"'+(c.rememberSecrets?' checked':'')+'>在本设备长期保存 API Key / 代理令牌</label>'+ 
    '<div class="dim" style="font-size:.72rem;margin-top:2px">默认仅保存到当前浏览器会话；关闭页面后 Key 会消失。只有勾选上方选项才写入长期本地存储。只有点「AI识图」时才会把图片发给所填 API。</div>'+
    '<details style="margin:8px 0"><summary class="dim" style="cursor:pointer;font-size:.78rem">🛡 跨域代理（可选：直连被 CORS 拦截时使用本机 proxy.py）</summary>'+
    '<div class="set-title" style="margin-left:0;margin-top:8px">代理地址</div><input type="text" id="vision-proxy-base" placeholder="http://127.0.0.1:8765" value="'+esc(c.proxyBase)+'" style="'+DIY_INPUT_STYLE+'">'+
    '<div class="set-title" style="margin-left:0">代理令牌（proxy.py 启动后打印，可留空）</div><input type="password" id="vision-proxy-token" placeholder="留空" value="'+esc(c.proxyToken)+'" style="'+DIY_INPUT_STYLE+'">'+
    '</details>'+
    '<div class="action-btns" style="margin-top:10px"><button class="act-btn" data-vision-save>✔ 完成</button><button class="act-btn" data-close>返回</button></div>'+
    '</div></div>';
  overlay.classList.add('open');
  var vp=document.getElementById('vision-provider');
  if(vp)vp.addEventListener('change',function(){diyVisionProviderChange(vp.value);});
  var vb=document.getElementById('vision-base');
  if(vb)vb.addEventListener('input',function(){diyVisionSet('baseUrl',vb.value.trim());});
  var vk=document.getElementById('vision-key');
  if(vk)vk.addEventListener('input',function(){diyVisionSet('apiKey',vk.value.trim());});
  var vm=document.getElementById('vision-model');
  if(vm)vm.addEventListener('input',function(){diyVisionSet('model',vm.value.trim());});
  var pb=document.getElementById('vision-proxy-base');
  if(pb)pb.addEventListener('input',function(){diyVisionSet('proxyBase',pb.value.trim());});
  var pt=document.getElementById('vision-proxy-token');
  if(pt)pt.addEventListener('input',function(){diyVisionSet('proxyToken',pt.value.trim());});
  var mt=document.getElementById('vision-max-tokens');
  if(mt)mt.addEventListener('input',function(){diyVisionSet('maxTokens',mt.value.trim());});
  var pk=document.querySelector('[data-vision-pick]');
  if(pk)pk.addEventListener('click',function(e){e.stopPropagation();diyVisionPickModels();});
  var pnl=document.getElementById('vision-model-panel');
  if(pnl)pnl.addEventListener('click',function(e){var it=e.target.closest('[data-model]');if(it){diyVisionPickSelect(it.getAttribute('data-model'));}});
}
function diyVisionSaveFromModal(){
  var cfg=diyVisionCfg();
  var prov=document.getElementById('vision-provider');
  var base=document.getElementById('vision-base');
  var key=document.getElementById('vision-key');
  var model=document.getElementById('vision-model');
  var pb=document.getElementById('vision-proxy-base');
  var pt=document.getElementById('vision-proxy-token');
  var mt=document.getElementById('vision-max-tokens');
  var rs=document.getElementById('vision-remember-secret');
  if(prov)cfg.provider=prov.value;
  if(base)cfg.baseUrl=base.value.trim();
  if(key)cfg.apiKey=key.value.trim();
  if(model)cfg.model=model.value.trim();
  if(pb)cfg.proxyBase=pb.value.trim();
  if(pt)cfg.proxyToken=pt.value.trim();
  if(mt)cfg.maxTokens=mt.value.trim();
  cfg.rememberSecrets=!!(rs&&rs.checked);
  diyVisionSave(cfg);
  overlay.classList.remove('open');
  clearBack();
}
function diyVisionPickModels(){
  var cfg=diyVisionCfg();
  var prov=document.getElementById('vision-provider');
  var base=document.getElementById('vision-base');
  var key=document.getElementById('vision-key');
  if(prov)cfg.provider=prov.value;
  if(base)cfg.baseUrl=base.value.trim();
  if(key)cfg.apiKey=key.value.trim();
  if(!cfg.apiKey){diyVisionModelsMsg('请先填写 API Key');return;}
  if(diyVisionModelsCache.length){
    diyVisionRenderModelsPanel(diyVisionModelsCache);
    diyVisionModelsMsg('已缓存 '+diyVisionModelsCache.length+' 个模型，点击即可选择');
    return;
  }
  var btn=document.querySelector('[data-vision-pick]');
  if(btn){btn.textContent='⏳ 读取中…';btn.disabled=true;}
  var pnl=document.getElementById('vision-model-panel');
  if(pnl){pnl.innerHTML='<div class="dim" style="padding:8px 10px;font-size:.78rem">正在读取可用模型…</div>';pnl.style.display='';}
  diyVisionFetchModels(diyVisionModelsURL(cfg),cfg,function(list){
    diyVisionModelsCache=list||[];
    if(btn){btn.textContent='🎯 选择模型';btn.disabled=false;}
    diyVisionRenderModelsPanel(diyVisionModelsCache);
    diyVisionModelsMsg(diyVisionModelsCache.length?('已读取 '+diyVisionModelsCache.length+' 个模型，点击即可选择'):'未读取到模型，可手动填写');
  },function(err){
    if(btn){btn.textContent='🎯 选择模型';btn.disabled=false;}
    if(pnl){pnl.style.display='none';pnl.innerHTML='';}
    diyVisionModelsMsg('读取失败：'+err);
  });
}
function diyVisionRenderModelsPanel(list){
  var pnl=document.getElementById('vision-model-panel');
  if(!pnl)return;
  if(!list||!list.length){pnl.style.display='none';pnl.innerHTML='';return;}
  pnl.innerHTML=list.map(function(m){
    return '<div data-model="'+esc(m)+'" style="padding:6px 10px;font-size:.82rem;cursor:pointer;border-bottom:1px dashed rgba(170,204,255,.2);word-break:break-all">'+esc(m)+'</div>';
  }).join('');
  pnl.style.display='';
}
function diyVisionPickSelect(m){
  var inp=document.getElementById('vision-model');
  if(inp){inp.value=m;diyVisionSet('model',m);}
  var pnl=document.getElementById('vision-model-panel');
  if(pnl){pnl.style.display='none';}
  diyVisionModelsMsg('已选择模型：'+m);
}
function diyVisionModelsMsg(t){
  var el=document.getElementById('vision-models-msg');
  if(el)el.textContent=t;
}
function diyVisionModelsURL(cfg){
  if(cfg.provider==='gemini')return String(cfg.baseUrl).replace(/\/+$/,'')+'/models?key='+encodeURIComponent(cfg.apiKey);
  if(cfg.provider==='claude')return String(cfg.baseUrl).replace(/\/+$/,'')+'/v1/models';
  return String(cfg.baseUrl).replace(/\/+$/,'')+'/models';
}
function diyVisionFetchModels(url,cfg,cb,errCb){
  diyVisionDoFetch(cfg,url,'GET',null,function(j){cb&&cb(diyVisionParseModels(j));},errCb);
}
function diyVisionParseModels(j){
  var out=[];
  try{
    if(j&&Array.isArray(j.data)){for(var i=0;i<j.data.length;i++){var id=j.data[i]&&j.data[i].id;if(id)out.push(String(id));}}
    if(j&&Array.isArray(j.models)){for(var i=0;i<j.models.length;i++){var n=j.models[i]&&j.models[i].name;if(n)out.push(String(n).replace(/^models\//,''));}}
  }catch(e){}
  var seen={},res=[];
  for(var k=0;k<out.length;k++){var s=String(out[k]).trim();if(s&&!seen[s]){seen[s]=1;res.push(s);}}
  return res;
}
function diyEvoEnsureDescShown(p){
  if(!diyEvoDescShow[p]){
    diyEvoDescShow[p]=true;
    var w=document.getElementById('evo-desc-wrap-'+p);
    if(w){w.innerHTML=diyEvoDescHTML(p);diyEvoDescAutosize(p);}
    var b=document.getElementById('evo-desc-btn-'+p);
    if(b)b.textContent='✕ 收起外观描述';
  }
}
function diyEvoUpload(p){
  p=parseInt(p,10);
  var f=document.getElementById('evo-img-file-'+p);
  if(f)f.click();
}
function diyEvoFileChange(input){
  var p=parseInt(String(input.id).replace('evo-img-file-',''),10);
  if(!input.files||!input.files.length)return;
  var file=input.files[0];
  if(!/^image\//.test(file.type||'')){diyMsg('请选择图片或 GIF 文件');return;}
  if(file.size>8*1024*1024){diyMsg('文件超过 8MB，请压缩后再上传（建议 ≤2MB）');return;}
  hudDiyAssetStoreBlob(file).then(function(ref){var t=document.getElementById('evo-img-'+p);if(t)t.value=ref;hudMsg('本地图片/GIF 已保存到 IndexedDB，不再占用 localStorage；点「AI识图」可自动生成外观描述');}).catch(function(e){hudDiagError('DIY evo image store',e);diyMsg('图片保存失败：'+String(e&&e.message||e));});
}
function diyItemUpload(){var f=document.getElementById('diy-item-img-file');if(f)f.click();}
function diyItemFileChange(input){
  if(!input.files||!input.files.length)return;
  var file=input.files[0];
  if(!/^image\//.test(file.type||'')){diyMsg('请选择图片或 GIF 文件');return;}
  if(file.size>8*1024*1024){diyMsg('文件超过 8MB，请压缩后再上传（建议 ≤2MB）');return;}
  hudDiyAssetStoreBlob(file).then(function(ref){var t=document.getElementById('diy-img');if(t)t.value=ref;hudMsg('本地图片已保存到 IndexedDB，不再占用 localStorage');}).catch(function(e){hudDiagError('DIY item image store',e);diyMsg('图片保存失败：'+String(e&&e.message||e));});
}
function diyEvoVision(p){
  p=parseInt(p,10);
  var src=diyVal('evo-img-'+p);
  if(!src){diyMsg('请先上传图片或填写图片链接，再点「AI识图」');return;}
  openVisionPrompt(p,src);
}
function openVisionPrompt(p,src){
  clearBack();
  var sv=String(src||'');
  var imgHtml=(sv.indexOf(HUD_DIY_SCHEME)===0||/^data:image\//i.test(sv)||/^https?:\/\//i.test(sv))?'<div style="text-align:center;margin-bottom:8px"><img '+hudDiyImgAttrs(sv)+' style="max-width:120px;max-height:120px;object-fit:contain;image-rendering:pixelated;border:1px solid var(--frame);border-radius:4px;background:rgba(43,74,111,.3)" onerror="this.remove()"></div>':'';
  overlay.innerHTML='<div class="modal" style="max-width:480px"><div class="modal-head"><div class="modal-name">AI 识图 · 生成外观描述</div><button class="close" data-close>✕</button></div><div class="modal-body">'+
    imgHtml+
    '<div class="set-title" style="margin-left:0">识别提示词（可留空，留空用默认）</div>'+
    '<textarea id="vision-run-prompt" placeholder="'+esc(diyVisionDefaultPrompt())+'" style="'+DIY_INPUT_STYLE+'min-height:72px;resize:vertical"></textarea>'+
    '<div id="vision-run-msg" class="dim" style="font-size:.75rem;margin-bottom:6px">点击「开始识图」后会把图片和提示词发给已配置的 API。</div>'+
    '<div class="action-btns" style="margin-top:8px"><button class="act-btn" data-vision-run>▶ 开始识图</button><button class="act-btn" data-close>返回</button></div>'+
    '</div></div>';
  overlay.classList.add('open');
  hudResolvePkidbImages(overlay);
  var run=document.querySelector('[data-vision-run]');
  if(run)run.addEventListener('click',function(e){e.stopPropagation();diyVisionRunFromPrompt(p);});
}
function diyVisionRunFromPrompt(p){
  var src=diyVal('evo-img-'+p);
  var promptEl=document.getElementById('vision-run-prompt');
  var prompt=promptEl?promptEl.value:'';
  var btn=document.querySelector('[data-vision-run]');
  var msg=document.getElementById('vision-run-msg');
  if(btn){btn.textContent='⏳ 识图中…';btn.disabled=true;}
  if(msg){msg.textContent='正在调用 API 识图…';msg.style.color='';}
  diyVisionRecognize(src,prompt,function(text){
    if(btn){btn.textContent='▶ 开始识图';btn.disabled=false;}
    diyEvoEnsureDescShown(p);
    var ta=document.getElementById('evo-desc-'+p);
    if(ta){ta.value=text;diyEvoDescCache[p]=text;}
    if(msg){msg.textContent='✔ 识别成功，已填入「外观描述」：'+text;msg.style.color='#4ade80';}
  },function(err){
    if(btn){btn.textContent='▶ 开始识图';btn.disabled=false;}
    if(msg){msg.textContent='✘ 识图失败：'+err;msg.style.color='#f87171';}
  });
}
function diyVisionRecognize(src,prompt,cb,errCb){
  var cfg=diyVisionCfg();
  if(!cfg.apiKey){errCb&&errCb('未填写 API Key（在 DIY 页面「AI 识图设置」里填写）');return;}
  if(!cfg.model){errCb&&errCb('未选择模型（在 AI 识图设置里点「选择模型」）');return;}
  var s=String(src||''),pr=String(prompt||'').trim()||diyVisionDefaultPrompt();
  if(s.indexOf(HUD_DIY_SCHEME)===0){hudDiyAssetToDataUrl(s).then(function(data){diyVisionRecognizeResolved(cfg,data,pr,cb,errCb);}).catch(function(e){errCb&&errCb(String(e&&e.message||e));});return;}
  diyVisionRecognizeResolved(cfg,s,pr,cb,errCb);
}
function diyVisionRecognizeResolved(cfg,s,pr,cb,errCb){
  var isData=/^data:image\//i.test(s);
  try{if(cfg.provider==='gemini')diyVisionGemini(cfg,s,isData,pr,cb,errCb);else if(cfg.provider==='claude')diyVisionClaude(cfg,s,isData,pr,cb,errCb);else diyVisionOpenAI(cfg,s,isData,pr,cb,errCb);}catch(e){errCb&&errCb(e&&e.message?e.message:String(e));}
}
function diyVisionOpenAI(cfg,src,isData,prompt,cb,errCb){
  var url=String(cfg.baseUrl).replace(/\/+$/,'')+'/chat/completions';
  var content=[{type:'text',text:prompt},{type:'image_url',image_url:{url:src}}];
  diyVisionFetch(url,{model:cfg.model,messages:[{role:'user',content:content}],max_tokens:(parseInt(cfg.maxTokens,10)||2048)},cfg,cb,errCb);
}
function diyVisionGemini(cfg,src,isData,prompt,cb,errCb){
  var base=String(cfg.baseUrl).replace(/\/+$/,'');
  var url=base+'/models/'+encodeURIComponent(cfg.model)+':generateContent?key='+encodeURIComponent(cfg.apiKey);
  function go(dataUrl,mime){
    var parts=[{text:prompt},{inline_data:{mime_type:mime||'image/png',data:String(dataUrl).replace(/^data:image\/[^;]+;base64,/,'')}}];
    diyVisionFetch(url,{contents:[{parts:parts}],generationConfig:{maxOutputTokens:(parseInt(cfg.maxTokens,10)||2048)}},cfg,cb,errCb);
  }
  if(isData){
    var m=(src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)||[])[1]||'image/png';
    go(src,m);
  }else{
    hudFetch(src).then(function(r){if(!r.ok)throw new Error('图片下载失败 HTTP '+r.status);return r.blob();}).then(function(b){
      var rd=new FileReader();
      rd.onload=function(){go(String(rd.result||''),b.type||'image/png');};
      rd.onerror=function(){errCb&&errCb('图片读取失败');};
      rd.readAsDataURL(b);
    }).catch(function(e){errCb&&errCb('Gemini 需要 base64：链接图片抓取失败（可能跨域），请改用上传本地图片。'+(e&&e.message?(' '+e.message):''));});
  }
}
function diyVisionClaude(cfg,src,isData,prompt,cb,errCb){
  var url=String(cfg.baseUrl).replace(/\/+$/,'')+'/v1/messages';
  var content=[];
  if(isData){
    var m=(src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)||[])[1]||'image/png';
    content.push({type:'image',source:{type:'base64',media_type:m,data:src.replace(/^data:image\/[^;]+;base64,/,'')}});
  }else{
    content.push({type:'image',source:{type:'url',url:src}});
  }
  content.push({type:'text',text:prompt});
  diyVisionFetch(url,{model:cfg.model,max_tokens:(parseInt(cfg.maxTokens,10)||2048),messages:[{role:'user',content:content}]},cfg,cb,errCb);
}
function diyVisionProxyBase(cfg){
  var b=String(cfg.proxyBase||'').trim();
  if(!b)return '';
  return b.replace(/\/+$/,'');
}
var diyVisionActiveCtl=null;
function diyVisionCancel(){if(diyVisionActiveCtl){try{diyVisionActiveCtl.abort();}catch(e){}diyVisionActiveCtl=null;}}
function diyVisionDoFetch(cfg,url,method,body,onJson,onErr){
  diyVisionCancel();var proxy=diyVisionProxyBase(cfg),ctl=hudNewAbortController();diyVisionActiveCtl=ctl;
  var req;
  if(proxy){var ph={'Content-Type':'application/json'};if(cfg.proxyToken)ph['X-Fusion-Token']=cfg.proxyToken;var proxyKey=(cfg.provider==='gemini')?'':cfg.apiKey;req=hudFetch(proxy+'/request',{method:'POST',headers:ph,credentials:'omit',referrerPolicy:'no-referrer',body:JSON.stringify({url:url,method:method,key:proxyKey,body:body}),signal:ctl.signal,timeout:90000});}
  else{var h={'Content-Type':'application/json'};if(cfg.provider==='claude'){h['x-api-key']=cfg.apiKey;h['anthropic-version']='2023-06-01';}else if(cfg.provider==='openai'){h['Authorization']='Bearer '+cfg.apiKey;}req=hudFetch(url,{method:method,headers:h,credentials:'omit',referrerPolicy:'no-referrer',body:(method==='POST'?JSON.stringify(body):undefined),signal:ctl.signal,timeout:90000});}
  req.then(function(r){return r.text().then(function(t){var j=null;try{j=JSON.parse(t);}catch(e){}if(!r.ok)throw new Error('HTTP '+r.status+'：'+String(t).slice(0,300));return j;});}).then(function(j){onJson&&onJson(j);}).catch(function(e){var msg=e&&e.name==='AbortError'?'请求已取消或超时':(e&&e.message?e.message:String(e));if(/Failed to fetch|NetworkError|Network request failed|Load failed|TypeError/i.test(msg))msg='网络请求失败：多半是 CORS/跨域被拦截、网络不可达或混合内容。可改用「AI 识图设置」里的跨域代理（本机 proxy.py），或换支持浏览器直连的 API 地址。';onErr&&onErr(msg);}).finally(function(){if(diyVisionActiveCtl===ctl)diyVisionActiveCtl=null;});
}
function diyVisionFetch(url,body,cfg,cb,errCb){
  diyVisionDoFetch(cfg,url,'POST',body,function(j){
    var t=diyVisionExtract(j);
    if(!t){errCb&&errCb('返回内容为空（请检查模型名/API 地址）');return;}
    cb&&cb(t);
  },errCb);
}
function diyVisionExtract(j){
  try{
    if(j&&j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)return String(j.choices[0].message.content).trim();
    if(j&&j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts){
      var ps=j.candidates[0].content.parts;
      for(var i=0;i<ps.length;i++){if(ps[i]&&ps[i].text)return String(ps[i].text).trim();}
    }
    if(j&&j.content&&j.content[0]&&j.content[0].text)return String(j.content[0].text).trim();
  }catch(e){}
  return '';
}
var TYPE_LIST=['一般','格斗','飞行','毒','地面','岩石','虫','幽灵','钢','火','水','草','电','超能力','冰','龙','恶','妖精'];
var CN_NUM=['','一','二','三','四','五','六','七','八','九','十'];
var diyTypeCount=2;var diyEvoCount=1;var diyEvoTypeCounts=[];var diyEvoBranchCounts=[];var diyEvoAbiCats=[];var diyEvoDescShow=[];var diyEvoDescCache=[];
function diyTypeSelectHTML(i){
  var opts='<option value="">无</option>'+TYPE_LIST.map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('');
  return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="font-size:.78rem;color:var(--dim);flex-shrink:0;min-width:44px">属性'+(CN_NUM[i]||i)+'</span><select id="diy-type-'+i+'" style="flex:1;min-width:0;box-sizing:border-box;padding:6px 8px;font-family:inherit;font-size:.85rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none">'+opts+'</select></div>';
}
function diyTypesHTML(){
  var out='';
  for(var i=1;i<=diyTypeCount;i++){out+=diyTypeSelectHTML(i);}
  return out;
}
function diyAddType(){
  var vals=[];
  for(var i=1;i<=diyTypeCount;i++){var e=document.getElementById('diy-type-'+i);vals.push(e?e.value:'');}
  diyTypeCount++;
  var tc=document.getElementById('diy-types');
  if(tc)tc.innerHTML=diyTypesHTML();
  for(var j=0;j<vals.length;j++){var e2=document.getElementById('diy-type-'+(j+1));if(e2)e2.value=vals[j];}
}
var abiListCache=null,abiListLoading=false,abiListCbs=[];
function fetchAbiList(cb){
  if(abiListCache){cb&&cb(abiListCache);return;}
  var _c=lsGet('pk_abilist',null);if(_c&&_c.length){abiListCache=_c;cb&&cb(_c);return;}
  if(abiListLoading){cb&&abiListCbs.push(cb);return;}
  abiListLoading=true;
  hudFetch('https://wiki.52poke.com/api.php?action=parse&page='+encodeURIComponent('特性列表')+'&format=json&prop=links&variant=zh-hans&origin=*')
    .then(function(r){return r.ok?r.json():Promise.reject();})
    .then(function(j){
      var links=(j&&j.parse&&j.parse.links)||[];
      var list=[],seen={};
      links.forEach(function(l){
        var t=String(l&&l['*']||'').trim();
        if(/（特性）$/.test(t)){
          var name=t.replace(/（特性）$/,'');
          if(name&&!seen[name]){seen[name]=1;list.push(name);}
        }
      });
      abiListCache=list;abiListLoading=false;
      if(list.length){lsSet('pk_abilist',list);}
      var cbs=abiListCbs;abiListCbs=[];
      for(var i=0;i<cbs.length;i++){try{cbs[i](list);}catch(e){}}
      if(cb)cb(list);
    })
    .catch(function(){abiListLoading=false;var cbs=abiListCbs;abiListCbs=[];for(var i=0;i<cbs.length;i++){try{cbs[i](null);}catch(e){}}if(cb)cb(null);});
}
var diyAbilityCat='';
function diyAbilityWrapHTML(){
  if(diyAbilityCat==='diy'){
    var diy=Object.keys(diyData.ability||{}).sort();
    var diyHtml=diy.length?diy.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join(''):'<option value="" disabled>暂无DIY特性</option>';
    return '<select id="diy-ability" style="'+DIY_INPUT_STYLE+'"><option value="">无</option>'+diyHtml+'</select>';
  }
  if(diyAbilityCat==='orig'){
    var orig=abiListCache||[];
    var origHtml=orig.length?orig.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join(''):'<option value="" disabled>加载中...</option>';
    return '<input id="diy-ability-search" placeholder="搜索原有特性" style="'+DIY_INPUT_STYLE+'"><select id="diy-ability" style="'+DIY_INPUT_STYLE+'"><option value="">无</option>'+origHtml+'</select>';
  }
  return '';
}
function diyAbilityHTML(){
  return '<select id="diy-ability-cat" style="'+DIY_INPUT_STYLE+'"><option value="">选择特性类型</option><option value="orig">原有特性</option><option value="diy">DIY特性</option></select><div id="diy-ability-wrap">'+diyAbilityWrapHTML()+'</div>';
}
function diyFilterAbility(){
  var q=(document.getElementById('diy-ability-search')||{}).value||'';
  q=q.trim().toLowerCase();
  var sel=document.getElementById('diy-ability');
  if(!sel)return;
  var opts=sel.querySelectorAll('option');
  for(var i=0;i<opts.length;i++){
    var o=opts[i];
    if(!o.value){o.hidden=false;continue;}
    o.hidden=(q && o.value.toLowerCase().indexOf(q)<0);
  }
}
function diyLoadAbiOptions(){
  fetchAbiList(function(list){
    if(diyAbilityCat!=='orig')return;
    var sel=document.getElementById('diy-ability');
    if(!sel)return;
    var cur=sel.value;
    sel.innerHTML='<option value="">无</option>'+(list&&list.length?list.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join(''):'<option value="" disabled>加载失败</option>');
    sel.value=cur;
  });
}
var diyLorebook='宝可梦 战斗爽MVU-大世界终极版';
try{var _dl=localStorage.getItem('pk_diy_lorebook2');if(_dl)diyLorebook=_dl;}catch(e){}
var diyLoreMode='select';
try{var _dlm=localStorage.getItem('pk_diy_loremode');if(_dlm==='input')diyLoreMode='input';}catch(e){}
var lorebookListCache=null;
var LORE_ENTRY_TEMPLATE={key:[],keysecondary:[],comment:'',content:'',constant:true,vectorized:false,selective:true,selectiveLogic:0,addMemo:false,order:100,position:0,disable:false,ignoreBudget:false,excludeRecursion:false,preventRecursion:false,matchPersonaDescription:false,matchCharacterDescription:false,matchCharacterPersonality:false,matchCharacterDepthPrompt:false,matchScenario:false,matchCreatorNotes:false,delayUntilRecursion:0,probability:100,useProbability:true,depth:4,outletName:'',group:'',groupOverride:false,groupWeight:100,scanDepth:null,caseSensitive:null,matchWholeWords:null,useGroupScoring:null,automationId:'',role:null,sticky:null,cooldown:null,delay:null,triggers:[],displayIndex:0,characterFilter:{isExclude:false,names:[],tags:[]}};
function tryParentLorebooks(){
  try{
    var w=WIN;
    if(!w)return null;
    var arr=null;
    if(w.world_names&&Array.isArray(w.world_names))arr=w.world_names;
    else if(w.lorebookNames&&Array.isArray(w.lorebookNames))arr=w.lorebookNames;
    else if(w.lorebooks&&Array.isArray(w.lorebooks))arr=w.lorebooks;
    else if(w.power_user&&w.power_user.lorebooks&&Array.isArray(w.power_user.lorebooks))arr=w.power_user.lorebooks;
    if(!arr)return null;
    return arr.map(function(x){return typeof x==='string'?x:(x&&x.name?x.name:'');}).filter(function(x){return x;});
  }catch(e){return null;}
}
function fetchLorebookList(cb){
  if(lorebookListCache){cb&&cb(lorebookListCache);return;}
  var names=[];
  try{
    var w=WIN,ST=w&&w.SillyTavern,ctx=ST&&ST.getContext?ST.getContext():null;
    if(ctx&&typeof ctx.getWorldInfoNames==='function'){
      var gl=ctx.getWorldInfoNames();
      if(Array.isArray(gl))gl.forEach(function(n){if(n)names.push(String(n));});
    }
  }catch(e){}
  try{
    var par=tryParentLorebooks();
    if(par)par.forEach(function(n){if(names.indexOf(n)<0)names.push(n);});
  }catch(e){}
  try{
    [].slice.call(document.querySelectorAll('#world_info,select[name="world_info"],#world_info_select,#world_editor_select')).forEach(function(sel){
      Array.prototype.slice.call(sel.options||[]).forEach(function(o){
        var v=String(o.value||o.text||'').trim();
        if(v&&v!=='---'&&!/^select/i.test(v)&&names.indexOf(v)<0)names.push(v);
      });
    });
  }catch(e){}
  var out=['当前世界信息'];
  names.forEach(function(n){
    var s=String(n==null?'':n).trim();
    if(!s||/^\d+$/.test(s))return;
    if(out.indexOf(s)<0)out.push(s);
  });
  lorebookListCache=out;
  cb&&cb(lorebookListCache);
}
function getCsrfToken(cb){
  hudFetch('/csrf-token')
    .then(function(r){return r.ok?r.json():Promise.reject();})
    .then(function(j){cb&&cb((j&&j.token)||'');})
    .catch(function(){cb&&cb('');});
}
function getLorebookData(name,cb){
  function parse(raw){try{var d=raw?JSON.parse(raw):null;return (d&&typeof d==='object')?d:null;}catch(e){return null;}}
  var d=null;
  try{d=parse(localStorage.getItem('world_info'));}catch(e){}
  if(d){cb&&cb(d);return;}
  try{
    var w=WIN;
    if(w&&w!==window){
      d=parse(w.localStorage.getItem('world_info'));
      if(d){cb&&cb(d);return;}
      var keys=[];
      for(var i=0;i<w.localStorage.length;i++){
        var k=w.localStorage.key(i);
        if(k&&/world|lore|wi|book|entry|info/i.test(k))keys.push(k);
      }
      try{diyMsg('父窗口相关键：'+(keys.length?keys.join(', '):'（无）'));}catch(e2){}
    }
  }catch(e){}
  try{
    var keys2=[];
    for(var j=0;j<localStorage.length;j++){
      var k2=localStorage.key(j);
      if(k2&&/world|lore|wi|book|entry|info/i.test(k2))keys2.push(k2);
    }
    try{diyMsg('本窗口相关键：'+(keys2.length?keys2.join(', '):'（无）'));}catch(e3){}
  }catch(e){}
  cb&&cb(null);
}
function saveLorebookData(name,data,cb){
  try{
    localStorage.setItem('world_info',JSON.stringify(data));
    try{var w=WIN;if(w&&w!==window)w.world_info=data;}catch(e){}
    cb&&cb(true);
  }catch(e){cb&&cb(false);}
}
function diyLoreText(type,obj){
  if(type==='move'){
    var t='技能：'+obj.name+'\n属性：'+(obj.type||'-')+'\n分类：'+(obj.cat||'-')+'\n威力：'+(obj.power||'-')+'\n命中：'+(obj.acc||'-');
    if(obj.desc)t+='\n描述：'+obj.desc;
    if(obj.eff)t+='\n详细效果：'+obj.eff;
    return t;
  }
  if(type==='ability'){
    var a='特性：'+obj.name+'\n介绍：'+(obj.text||'-');
    if(obj.detail)a+='\n详细效果：'+obj.detail;
    return a;
  }
  if(type==='item'){
    return '道具：'+obj.name+'\n介绍：'+(obj.text||'-');
  }
  var types=(obj.types&&obj.types.length)?obj.types:(obj.type?[obj.type]:[]);
  var p='精灵：'+obj.name+'\n属性：'+(types.length?types.join('/'):'-')+'\n特性：'+(obj.ability||'-');
  if(obj.stats)p+='\n种族值：'+diyStatsText(obj.stats);
  if(obj.desc)p+='\n外观描述：'+obj.desc;
if(obj.chain&&obj.chain.length>1)p+='\n进化链：'+diyChainText(obj);
  return p;
}
function diyLorebookValue(){
  if(diyLoreMode==='input'){
    var custom=document.getElementById('diy-lorebook-custom');
    var cv=custom?custom.value.trim():'';
    return cv||diyLorebook;
  }
  var sel=document.getElementById('diy-lorebook');
  return (sel&&sel.value)?sel.value:diyLorebook;
}
function diySetLoreMode(mode){
  diyLoreMode=(mode==='input')?'input':'select';
  try{localStorage.setItem('pk_diy_loremode',diyLoreMode);}catch(e){}
  var selWrap=document.getElementById('diy-lore-select-wrap');
  var inWrap=document.getElementById('diy-lore-input-wrap');
  var btnSel=document.getElementById('diy-lore-mode-select');
  var btnIn=document.getElementById('diy-lore-mode-input');
  var on='border-color:#7cc4f8;color:#fff;background:rgba(43,74,111,.9)';
  if(selWrap)selWrap.style.display=(diyLoreMode==='select')?'':'none';
  if(inWrap)inWrap.style.display=(diyLoreMode==='input')?'':'none';
  if(btnSel)btnSel.style.cssText=(diyLoreMode==='select')?on:'';
  if(btnIn)btnIn.style.cssText=(diyLoreMode==='input')?on:'';
}
function diyFillLorebookOptions(){
  var sel=document.getElementById('diy-lorebook');
  if(!sel)return;
  fetchLorebookList(function(list){
    if(!sel||!document.body.contains(sel))return;
    var cur=sel.value||diyLorebook;
    var h='<option value="">—— 请选择世界书 ——</option>';
    (list||[]).forEach(function(n){
      var s=String(n==null?'':n).trim();
      if(!s||/^\d+$/.test(s))return;
      h+='<option value="'+esc(s)+'"'+(s===cur?' selected':'')+'>'+esc(s)+'</option>';
    });
    sel.innerHTML=h;
  });
}
function diyLorebookHTML(){
  var selActive=diyLoreMode==='select';
  var modeBtn='<div style="display:flex;gap:6px;margin-bottom:6px">'+
    '<button type="button" id="diy-lore-mode-select" class="btn-small" style="'+(selActive?'border-color:#7cc4f8;color:#fff;background:rgba(43,74,111,.9)':'')+'">📖 选择世界书</button>'+
    '<button type="button" id="diy-lore-mode-input" class="btn-small" style="'+(!selActive?'border-color:#7cc4f8;color:#fff;background:rgba(43,74,111,.9)':'')+'">⌨ 手动输入</button>'+
    '</div>';
  var selectHtml='<div id="diy-lore-select-wrap"'+(selActive?'':' style="display:none"')+'><select id="diy-lorebook" style="'+DIY_INPUT_STYLE+'"><option value="">—— 正在读取世界书列表… ——</option></select></div>';
  var inputHtml='<div id="diy-lore-input-wrap"'+(selActive?' style="display:none"':'')+'><input type="text" id="diy-lorebook-custom" placeholder="世界书文件名，如 宝可梦DIY" value="'+esc(diyLorebook)+'" style="'+DIY_INPUT_STYLE+'"></div>';
  return '<div class="info-frame plain-frame"><div class="info-inner"><div class="info-title">写入世界书(推荐自建外挂世界书，方便删除，删除缓存不会删除世界书条目，只会关闭)</div>'+modeBtn+selectHtml+inputHtml+'</div></div>';
}
function diyLoreCreateCmd(type,name,obj,book){
  var text=diyLoreText(type,obj);
  var one=text.replace(/\"/g,'＂').replace(/\|/g,'｜');
  var title=('自创'+diyLabel(type)+'：'+name).replace(/\"/g,'＂').replace(/\|/g,'｜');
  var book2=book.replace(/\"/g,'＂').replace(/\|/g,'｜');
  return '/createentry file="'+book2+'" '+one+' | /setvar key=uid {{pipe}} | /setentryfield file="'+book2+'" uid={{pipe}} field=comment '+title+' | /getvar uid | /setentryfield file="'+book2+'" uid={{pipe}} field=constant true';
}
function diyWriteLorebook(type,name,oldName,silent){
  var obj=diyGet(type,name);
  if(!obj){if(!silent)diyDoneMsg();return;}
  var book=diyLorebookValue();
if(!book){if(!silent)diyMsg('已保存 DIY（未填写世界书文件名，未写入）');return;}
  var text=diyLoreText(type,obj);
  var one=text.replace(/\"/g,'＂').replace(/\|/g,'｜');
  var title=('自创'+diyLabel(type)+'：'+name).replace(/\"/g,'＂').replace(/\|/g,'｜');
  var book2=book.replace(/\"/g,'＂').replace(/\|/g,'｜');
  if(oldName && oldName===name){
    var cmdUpd='/findentry file="'+book2+'" field=comment "'+title+'" | /setentryfield file="'+book2+'" uid={{pipe}} field=content '+one;
    sendMessage(cmdUpd);
    if(!silent)diyMsg('已保存编辑，并已更新世界书「'+book+'」中对应条目内容');
    return;
  }
  var dis='';
  if(oldName){
    var oldTitle=('自创'+diyLabel(type)+'：'+oldName).replace(/\"/g,'＂').replace(/\|/g,'｜');
    dis='/findentry file="'+book2+'" field=comment "'+oldTitle+'" | /setentryfield file="'+book2+'" uid={{pipe}} field=disable true | ';
  }
  sendMessage(dis+diyLoreCreateCmd(type,name,obj,book));
  if(!silent)diyMsg('已保存 DIY，并已写入世界书「'+book+'」（蓝灯常驻）');
}
function diyDisableLorebook(type,name){
  try{
    var book=diyLorebookValue();
if(!book)return;
    var title=('自创'+diyLabel(type)+'：'+name).replace(/"/g,'＂').replace(/\|/g,'｜');
    var book2=book.replace(/"/g,'＂').replace(/\|/g,'｜');
    var cmd='/findentry file="'+book2+'" field=comment "'+title+'" | /setentryfield file="'+book2+'" uid={{pipe}} field=disable true';
    sendMessage(cmd);
  }catch(e){}
}
/* ===== 随机模式（HUD 开关 → 写入/关闭世界书条目） ===== */
var RANDOM_MODE_TITLE='[随机模式] 随机宝可梦';
var RANDOM_MODE_POSITION=1;
var RANDOM_MODE_ORDER=860;
var RANDOM_MODE_DEFAULT_CONTENT='<Random_Pokemon_Enforcement>\n[最高优先级覆写] 高于原作队伍设定、本地图鉴与场景生态。\n物种抽取（一律D100骰，按序取自<Dice_Sequence>，禁自行编造或跳骰）:\n  世代骰(D100，值=该代全国图鉴区间): 1~11=1-151 12~22=152-251 23~33=252-386 34~44=387-493 45~55=494-649 56~66=650-721 67~77=722-809 78~88=810-905 89~100=906-1025\n  编号骰(D100): 全国图鉴编号 = 该代起始号 + ⌊骰 × (该代末号−起始号+1) ÷ 100⌋ − 1 → 取该编号物种\nNPC队伍: 逐只抽满全队后，读其属性·速度·特性分布反推战术体系，再逐只配性格·特性·道具·四招服务该体系。等级·数量·搭档数·机制数照<WorldSettingGuide>，搭档补种族照<Pokemon_Partner>。战术逻辑·性格·口癖照原人设保留\n野外遭遇与附近宝可梦: 无视气候·地形·海陆·昼夜与地区图鉴，抽出即用\n禁修正: 抽到鲤鱼王即鲤鱼王，禁因不符身份或生态而暗改\n</Random_Pokemon_Enforcement>';
var randomModeEnabled=false;
try{randomModeEnabled=(localStorage.getItem('pk_randommode')==='1');}catch(e){randomModeEnabled=false;}
function randomModeContent(){
  try{var c=localStorage.getItem('pk_randommode_content');if(c&&c.trim())return c;}catch(e){}
  return RANDOM_MODE_DEFAULT_CONTENT;
}
function randomModeSaveContent(c){try{localStorage.setItem('pk_randommode_content',c);}catch(e){}}
function randomModeSetOn(v){
  randomModeEnabled=!!v;
  try{localStorage.setItem('pk_randommode',randomModeEnabled?'1':'0');}catch(e){}
}
function randomModeSyncUI(){
  try{
    var chk=document.querySelector('input[data-toggle="randommode"]');
    if(chk)chk.checked=randomModeEnabled;
  }catch(e){}
}
function randomModeBook(){
  var book=diyLorebookValue();
  return book?book.replace(/"/g,'＂').replace(/\|/g,'｜'):'';
}
function randomModeTitleEsc(){
  return RANDOM_MODE_TITLE.replace(/"/g,'＂').replace(/\|/g,'｜');
}
function randomModeMatchingUids(){
  var found=[];
  function scan(d){
    if(!d||typeof d!=='object')return;
    var es=(d.entries)||(d.world_info&&d.world_info.entries);
    if(!es)return;
    function hit(e){
      return e&&String(e.comment||'')===RANDOM_MODE_TITLE;
    }
    if(Array.isArray(es)){
      for(var i=0;i<es.length;i++){var e=es[i];if(hit(e)&&e.uid!=null)found.push(e.uid);}
    }else{
      for(var k in es){var e2=es[k];if(hit(e2))found.push(e2.uid!=null?e2.uid:k);}
    }
  }
  try{scan(JSON.parse(localStorage.getItem('world_info')||'null'));}catch(e){}
  try{
    var w=WIN;
    if(w&&w!==window){
      var wd=null;
      try{wd=w.world_info;}catch(e){}
      if(!wd){try{wd=JSON.parse(w.localStorage.getItem('world_info')||'null');}catch(e){}}
      scan(wd);
    }
  }catch(e){}
  var seen={},out=[];
  for(var j=0;j<found.length;j++){var u=String(found[j]);if(!seen[u]){seen[u]=1;out.push(u);}}
  return out;
}
function randomModeDisableCmd(book,uids){
  return uids.map(function(u){return '/setentryfield file="'+book+'" uid='+u+' field=disable true';}).join(' | ');
}
function randomModeOn(){
  var book=randomModeBook();
  if(!book){randomModeSyncUI();hudMsg('请先在「DIY → 写入世界书」里选择世界书文件名');return;}
  var one=randomModeContent().replace(/"/g,'＂').replace(/\|/g,'｜');
  var title=randomModeTitleEsc();
  var pre='';
  var uids=randomModeMatchingUids();
  if(uids.length)pre=randomModeDisableCmd(book,uids)+' | ';
  var cmd=pre+'/createentry file="'+book+'" '+one+' | /setvar key=uid {{pipe}} | /setentryfield file="'+book+'" uid={{pipe}} field=comment '+title+' | /getvar uid | /setentryfield file="'+book+'" uid={{pipe}} field=constant true | /getvar uid | /setentryfield file="'+book+'" uid={{pipe}} field=position '+RANDOM_MODE_POSITION+' | /getvar uid | /setentryfield file="'+book+'" uid={{pipe}} field=order '+RANDOM_MODE_ORDER;
  sendMessage(cmd);
  randomModeSetOn(true);
  randomModeSyncUI();
  hudMsg('随机模式已开启：已写入世界书「'+diyLorebookValue()+'」（蓝灯常驻·高权重，顺序'+RANDOM_MODE_ORDER+'）');
}
function randomModeOff(){
  var book=randomModeBook();
  if(!book){randomModeSyncUI();hudMsg('请先在「DIY → 写入世界书」里选择世界书文件名');return;}
  var title=randomModeTitleEsc();
  var uids=randomModeMatchingUids();
  var cmd=uids.length?randomModeDisableCmd(book,uids):('/findentry file="'+book+'" field=comment "'+title+'" | /setentryfield file="'+book+'" uid={{pipe}} field=disable true');
  sendMessage(cmd);
  randomModeSetOn(false);
  randomModeSyncUI();
  hudMsg('随机模式已关闭：已关闭世界书「'+diyLorebookValue()+'」对应条目');
}
function diyFormHTML(type){
  diyTypeCount=2;
  diyAbilityCat='';
  if(type==='pokemon'){diyEvoCount=1;diyEvoTypeCounts=[];diyEvoBranchCounts=[];diyEvoAbiCats=[];diyEvoDescShow=[];diyEvoDescCache=[];}
  var btns=diyBtnsHTML();
  if(type==='move'){
    return '<div class="set-title" style="margin-left:8px">新增技能</div>'+diyInput('diy-name','技能名称（必填）')+diyInput('diy-type','属性，如 电')+diyInput('diy-cat','分类，如 物理')+diyInput('diy-power','威力，如 80')+diyInput('diy-acc','命中，如 100')+diyArea('diy-desc','描述')+diyArea('diy-eff','详细效果')+btns;
  }
  if(type==='ability'){
  return '<div class="set-title" style="margin-left:8px">新增特性</div>'+diyInput('diy-name','特性名称（必填）')+diyArea('diy-effect','介绍')+diyArea('diy-detail','详细效果')+btns;
}
  if(type==='item'){
    return '<div class="set-title" style="margin-left:8px">新增道具</div>'+diyInput('diy-name','道具名称（必填）')+diyArea('diy-effect','介绍')+diyInput('diy-img','图片链接（可选，或点下方上传本地图片）')+'<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap"><button type="button" class="btn-small" data-diy-item-upload style="background:rgba(43,74,111,.7)">📁 上传本地图片</button><span class="dim" style="font-size:.7rem">支持 PNG/JPG/GIF，建议 ≤2MB</span></div><input type="file" id="diy-item-img-file" accept="image/*" style="display:none">'+btns;
  }
  return diyPkmFormHTML()+btns;
}
function diyEncode(s){
  try{return btoa(unescape(encodeURIComponent(s)));}catch(e){return '';}
}
function diyDecode(c){
  try{return decodeURIComponent(escape(atob(String(c==null?'':c).replace(/[\s\n\r]+/g,'').trim())));}catch(e){return '';}
}
function diyCopyText(txt,done){
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){done&&done(true);},function(){diyCopyFallback(txt,done);});
    }else{diyCopyFallback(txt,done);}
  }catch(e){diyCopyFallback(txt,done);}
}
function diyShare(type,name){
  var obj=diyGet(type,name);
  if(!obj){diyMsg('未找到该自创内容');return;}
  var payload={v:2,t:type,n:name,d:obj};
  if(type==='pokemon'){
    var extras={};
    function pick(a){if(a&&!extras[a]){var ab=diyGet('ability',a);if(ab)extras[a]=ab;}}
    pick(obj.ability);
    if(obj.chain&&obj.chain.length){for(var i=0;i<obj.chain.length;i++){pick(obj.chain[i]&&obj.chain[i].ability);}}
    var eks=Object.keys(extras);
    if(eks.length){payload.x={ability:extras};}
  }
  var code=diyLabel(type)+':'+name+'|'+diyEncode(JSON.stringify(payload));
  if(!code){diyMsg('生成分享码失败');return;}
  clearBack();
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">分享'+esc(diyLabel(type))+'：'+esc(name)+'</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="row block"><span class="k">分享码（对方粘贴导入即可）</span><span class="v" style="word-break:break-all;user-select:all">'+esc(code)+'</span></div><div class="action-btns" style="margin-top:10px"><button class="act-btn" data-copy-code="'+esc(code)+'">📋 复制分享码</button></div></div></div>';
  overlay.classList.add('open');
}
function diyImportHTML(){
  return '<div class="info-frame plain-frame"><div class="info-inner"><div class="info-title">导入分享码</div><div style="display:flex;gap:6px"><input type="text" id="diy-import-code" placeholder="粘贴分享码，自动加入自创并写入世界书" style="flex:1;min-width:0;box-sizing:border-box;padding:6px 10px;font-family:inherit;font-size:.85rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none"><button class="btn-small" data-diy-import>导入</button></div></div></div>';
}
function diyImport(){
  var code=diyVal('diy-import-code');
  if(!code){diyMsg('请先粘贴分享码');return;}
  var c=String(code),ci=c.lastIndexOf('|');if(ci>=0){c=c.slice(ci+1);}
var raw=diyDecode(c);
  if(!raw){diyMsg('分享码无效或格式错误');return;}
  var o=null;
  try{o=JSON.parse(raw);}catch(e){o=null;}
  if(!o||typeof o!=='object'||!o.t||!o.n||!o.d||typeof o.d!=='object'){diyMsg('分享码内容不完整');return;}
  if(['move','ability','item','pokemon'].indexOf(o.t)<0){diyMsg('分享码类型不受支持');return;}
  var t=o.t,n=String(o.n);
  diyData[t]=diyData[t]||{};
  diyData[t][n]=o.d;
  var bundledAbiNames=[];
  if(o.x&&o.x.ability&&typeof o.x.ability==='object'){
    diyData.ability=diyData.ability||{};
    var aks=Object.keys(o.x.ability);
    for(var ai=0;ai<aks.length;ai++){
      var an=aks[ai],av=o.x.ability[an];
      if(av&&typeof av==='object'){bundledAbiNames.push(an);if(!diyData.ability[an]){diyData.ability[an]=av;}}
    }
  }
  diySave();
  diyType=t;
  var f=document.getElementById('diy-form');if(f)f.innerHTML=diyFormHTML(diyType);
  var l=document.getElementById('diy-list');if(l)l.innerHTML=diyListHTML(diyType);
  var tabs=document.querySelectorAll('[data-diy-tab]');
  for(var i=0;i<tabs.length;i++){tabs[i].classList.toggle('active',tabs[i].getAttribute('data-diy-tab')===t);}
  var inp=document.getElementById('diy-import-code');if(inp)inp.value='';
  /* 分开写世界书：先写精灵，再把捆绑的特性各自单独写一条（错开执行，避免连续发送被吞） */
  diyWriteLorebook(t,n);
  var abiDelay=600;
  for(var k=0;k<bundledAbiNames.length;k++){
    (function(abName,d){hudScope.setTimeout(function(){diyWriteLorebook('ability',abName,'',true);},d);})(bundledAbiNames[k],abiDelay);
    abiDelay+=600;
  }
  diyRefreshTeam();
}
function diyChainText(obj){
  var c=obj.chain;
  if(!c||c.length<=1)return '';
  var s='';
  for(var i=0;i<c.length;i++){
    var st=c[i];
    s+='\n  '+(i+1)+'. '+st.name+'（属性：'+(st.types&&st.types.length?st.types.join('/'):'-')+'，特性：'+(st.ability||'-')+'，种族值：'+diyStatsText(st.stats)+'）';
    if(st.desc){s+='　外观描述：'+st.desc;}
    if(st.evos&&st.evos.length){s+='　进化分支：'+st.evos.map(function(e){return (e.cond||'?')+'→'+(e.to||'?');}).join('、');}
  }
  return s;
}
function diyEvoTypesHTML(p){
  var n=diyEvoTypeCounts[p]||2;
  var opts='<option value="">无</option>'+TYPE_LIST.map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('');
  var selStyle='flex:1;min-width:0;box-sizing:border-box;padding:6px 8px;font-family:inherit;font-size:.85rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none';
  var h='';
  for(var i=1;i<=n;i++){h+='<select id="evo-type-'+p+'-'+i+'" style="'+selStyle+'">'+opts+'</select>';}
  h+='<button class="btn-small" data-diy-evo-add-type="'+p+'" style="background:rgba(43,74,111,.7)">＋ 添加属性</button>';
  return h;
}
function diyEvoAddType(p){
  p=parseInt(p,10);
  var cnt=diyEvoTypeCounts[p]||2;
  var vals=[];
  for(var i=1;i<=cnt;i++){var e=document.getElementById('evo-type-'+p+'-'+i);vals.push(e?e.value:'');}
  diyEvoTypeCounts[p]=cnt+1;
  var tc=document.getElementById('evo-types-'+p);
  if(tc){tc.innerHTML=diyEvoTypesHTML(p);}
  for(var j=0;j<vals.length;j++){var e2=document.getElementById('evo-type-'+p+'-'+(j+1));if(e2)e2.value=vals[j];}
}
function diyEvoAbiWrapHTML(p){
  var cat=diyEvoAbiCats[p]||'';
  if(cat==='diy'){
    var diy=Object.keys(diyData.ability||{}).sort();
    var diyHtml=diy.length?diy.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join(''):'<option value="" disabled>暂无DIY特性</option>';
    return '<select id="evo-abi-'+p+'" style="'+DIY_INPUT_STYLE+'"><option value="">无</option>'+diyHtml+'</select>';
  }
  if(cat==='orig'){
    var orig=abiListCache||[];
    var origHtml=orig.length?orig.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join(''):'<option value="" disabled>加载中...</option>';
    return '<input id="evo-abi-search-'+p+'" placeholder="搜索原有特性" style="'+DIY_INPUT_STYLE+'"><select id="evo-abi-'+p+'" style="'+DIY_INPUT_STYLE+'"><option value="">无</option>'+origHtml+'</select>';
  }
  return '';
}
function diyEvoAbiHTML(p){
  var cat=diyEvoAbiCats[p]||'';
  var sel='<option value="">选择特性类型</option><option value="orig"'+(cat==='orig'?' selected':'')+'>原有特性</option><option value="diy"'+(cat==='diy'?' selected':'')+'>DIY特性</option>';
  return '<select id="evo-abi-cat-'+p+'" style="'+DIY_INPUT_STYLE+'">'+sel+'</select><div id="evo-abi-wrap-'+p+'">'+diyEvoAbiWrapHTML(p)+'</div>';
}
function diyEvoFilterAbility(p){
  var q=(document.getElementById('evo-abi-search-'+p)||{}).value||'';
  q=q.trim().toLowerCase();
  var sel=document.getElementById('evo-abi-'+p);
  if(!sel)return;
  var opts=sel.querySelectorAll('option');
  for(var i=0;i<opts.length;i++){
    var o=opts[i];
    if(!o.value){o.hidden=false;continue;}
    o.hidden=(q&&o.value.toLowerCase().indexOf(q)<0);
  }
}
function diyEvoLoadAbiOptions(p){
  fetchAbiList(function(list){
    if(diyEvoAbiCats[p]!=='orig')return;
    var sel=document.getElementById('evo-abi-'+p);
    if(!sel)return;
    var cur=sel.value;
    sel.innerHTML='<option value="">无</option>'+(list&&list.length?list.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join(''):'<option value="" disabled>加载失败</option>');
    sel.value=cur;
  });
}
function diyEvoLoadAbi(){
  fetchAbiList(function(list){
    if(!list||!list.length)return;
    for(var p=0;p<diyEvoCount;p++){
      if(diyEvoAbiCats[p]==='orig'){
        var sel=document.getElementById('evo-abi-'+p);
        if(sel){var cur=sel.value;sel.innerHTML='<option value="">无</option>'+list.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join('');sel.value=cur;}
      }
    }
  });
}
function diyEvoBranchesHTML(p){
  var n=diyEvoBranchCounts[p]||0;
  var st='flex:1;min-width:0;box-sizing:border-box;padding:6px 10px;font-family:inherit;font-size:.85rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none';
  if(!n)return '<div class="dim" style="font-size:.72rem">暂无进化分支（可进化为多个形态）</div>';
  var h='';
  for(var b=0;b<n;b++){
    h+='<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center"><input type="text" id="evo-cond-'+p+'-'+b+'" placeholder="进化条件，如 水之石 / 亲密度" style="'+st+'"><input type="text" id="evo-to-'+p+'-'+b+'" placeholder="进化成（精灵名）" style="'+st+'"><button class="btn-small" data-diy-evo-delbranch="'+p+'|'+b+'">✕</button></div>';
  }
  return h;
}
function diyEvoAddBranch(p){
  p=parseInt(p,10);
  if(!diyEvoBranchCounts[p])diyEvoBranchCounts[p]=0;
  diyEvoBranchCounts[p]++;
  var c=document.getElementById('evo-branches-'+p);
  if(c){c.innerHTML=diyEvoBranchesHTML(p);}
}
function diyEvoDelBranch(p,b){
  p=parseInt(p,10);b=parseInt(b,10);
  var n=diyEvoBranchCounts[p]||0;
  var keep=[];
  for(var i=0;i<n;i++){if(i===b)continue;keep.push({cond:diyVal('evo-cond-'+p+'-'+i),to:diyVal('evo-to-'+p+'-'+i)});}
  diyEvoBranchCounts[p]=keep.length;
  var c=document.getElementById('evo-branches-'+p);
  if(c){c.innerHTML=diyEvoBranchesHTML(p);}
  for(var j=0;j<keep.length;j++){
    var c1=document.getElementById('evo-cond-'+p+'-'+j);if(c1)c1.value=keep[j].cond;
    var c2=document.getElementById('evo-to-'+p+'-'+j);if(c2)c2.value=keep[j].to;
  }
}
function diyEvoDescHTML(p){
  if(!diyEvoDescShow[p])return '';
  var v=diyEvoDescCache[p]||'';
  var st='width:100%;box-sizing:border-box;padding:8px 10px;font-family:inherit;font-size:.85rem;line-height:1.6;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none;min-height:140px;resize:vertical';
  return '<textarea id="evo-desc-'+p+'" placeholder="外观描述，如 全身覆盖蓝色鳞片…" style="'+st+'">'+esc(v)+'</textarea>';
}
function diyEvoDescAutosize(p){
  var ta=document.getElementById('evo-desc-'+p);
  if(!ta)return;
  ta.style.height='auto';
  var h=Math.max(140,Math.min(ta.scrollHeight+2,420));
  ta.style.height=h+'px';
}
function diyEvoToggleDesc(p){
  p=parseInt(p,10);
  if(diyEvoDescShow[p]){
    var e=document.getElementById('evo-desc-'+p);
    if(e)diyEvoDescCache[p]=e.value;
  }
  diyEvoDescShow[p]=!diyEvoDescShow[p];
  var c=document.getElementById('evo-desc-wrap-'+p);
  if(c){c.innerHTML=diyEvoDescHTML(p);if(diyEvoDescShow[p])diyEvoDescAutosize(p);}
  var btn=document.getElementById('evo-desc-btn-'+p);
  if(btn){btn.textContent=diyEvoDescShow[p]?'✕ 收起外观描述':'＋ 外观描述';}
}
function diyEvoSyncNext(){
  for(var p=0;p<diyEvoCount-1;p++){
    var next=document.getElementById('evo-name-'+(p+1));
    var sp=document.getElementById('evo-next-'+p);
    if(sp&&next){sp.textContent='进化为：'+(next.value.trim()||'（请填下一页精灵名）');}
  }
}
function diyEvoAddPage(){
  if(diyEvoCount>=5){diyMsg('进化链最多 5 页');return;}
  var vals={};
  for(var p=0;p<diyEvoCount;p++){
    var ids=['name','abi','img'];
    for(var a=0;a<ids.length;a++){vals['evo-'+ids[a]+'-'+p]=diyVal('evo-'+ids[a]+'-'+p);}
    var tc=diyEvoTypeCounts[p]||2;
    for(var ti=1;ti<=tc;ti++){vals['evo-type-'+p+'-'+ti]=diyVal('evo-type-'+p+'-'+ti);}
    var st=['hp','atk','def','spa','spd','spe'];
    for(var b2=0;b2<st.length;b2++){vals['evo-'+st[b2]+'-'+p]=diyVal('evo-'+st[b2]+'-'+p);}
    var bn=diyEvoBranchCounts[p]||0;
    for(var b=0;b<bn;b++){
      vals['evo-cond-'+p+'-'+b]=diyVal('evo-cond-'+p+'-'+b);
      vals['evo-to-'+p+'-'+b]=diyVal('evo-to-'+p+'-'+b);
    }
    if(diyEvoDescShow[p]){var de=document.getElementById('evo-desc-'+p);if(de)diyEvoDescCache[p]=de.value;}
  }
  diyEvoCount++;
  var f=document.getElementById('diy-form');
  if(f){f.innerHTML=diyPkmFormHTML()+diyBtnsHTML();}
  for(var id in vals){var el=document.getElementById(id);if(el)el.value=vals[id];}
  for(var q=0;q<diyEvoCount;q++){if(diyEvoDescShow[q])diyEvoDescAutosize(q);}
  diyEvoSyncNext();
  diyEvoLoadAbi();
}
function diyBtnsHTML(){
  return '<div style="display:flex;gap:8px;margin-top:4px"><button class="btn-small" style="background:#2e7d32;border-color:#4ade80;color:#fff" data-diy-add>✔ 确认</button><button class="btn-small" style="background:#b71c1c;border-color:#f05060;color:#fff" data-diy-clear>✖ 清空</button></div>';
}
function diyPkmFormHTML(){
  var cn=['一','二','三','四','五','六','七','八','九','十'];
  var h='<div class="set-title" style="margin-left:8px">新增精灵</div><div style="display:flex;align-items:center;gap:8px;margin:0 0 8px 8px"><button class="btn-small" data-diy-evo-add>＋ 进化链</button><span class="dim" style="font-size:.72rem">请按页数填写精灵信息（当前 '+diyEvoCount+' 页）</span></div>';
  for(var p=0;p<diyEvoCount;p++){
    if(!diyEvoTypeCounts[p])diyEvoTypeCounts[p]=2;
    if(!diyEvoBranchCounts[p])diyEvoBranchCounts[p]=0;
    var title=diyEvoCount===1?'精灵信息':'第'+(cn[p]||(p+1))+'页'+(p===0?'（基础形态）':'（进化形态）');
    h+='<div class="fold-box" style="margin-bottom:8px"><div class="fold-head" style="cursor:default">'+title+'</div><div class="fold-inner">';
    h+=diyInput('evo-name-'+p,'精灵名称（必填）');
    h+='<div class="set-title" style="margin-left:0;font-size:.78rem">属性</div><div id="evo-types-'+p+'" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">'+diyEvoTypesHTML(p)+'</div>';
    h+='<div class="set-title" style="margin-left:0;font-size:.78rem">特性</div><div style="margin-bottom:6px">'+diyEvoAbiHTML(p)+'</div>';
    h+='<div class="set-title" style="margin-left:0;font-size:.78rem">种族值</div><div style="display:flex;gap:6px;margin-bottom:6px">'+diyStatInput('evo-hp-'+p,'HP')+diyStatInput('evo-atk-'+p,'攻击')+diyStatInput('evo-def-'+p,'防御')+'</div><div style="display:flex;gap:6px;margin-bottom:6px">'+diyStatInput('evo-spa-'+p,'特攻')+diyStatInput('evo-spd-'+p,'特防')+diyStatInput('evo-spe-'+p,'速度')+'</div>';
    h+='<div class="set-title" style="margin-left:0;font-size:.78rem">图片</div>';
    h+=diyInput('evo-img-'+p,'图片链接（可选，或点下方上传本地图片/GIF）');
    h+='<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap"><button type="button" class="btn-small" data-diy-evo-upload="'+p+'" style="background:rgba(43,74,111,.7)">📁 上传本地图/GIF</button><button type="button" class="btn-small" data-diy-evo-vision="'+p+'" style="background:rgba(43,74,111,.7)">🤖 AI识图填入外观</button><span class="dim" style="font-size:.7rem">支持 PNG/JPG/GIF，建议 ≤2MB</span></div>';
    h+='<input type="file" id="evo-img-file-'+p+'" accept="image/*" style="display:none">';
    h+='<div class="set-title" style="margin-left:0;font-size:.78rem">外观描述</div><button id="evo-desc-btn-'+p+'" class="btn-small" data-diy-evo-adddesc="'+p+'" style="background:rgba(43,74,111,.7);margin-bottom:6px">'+(diyEvoDescShow[p]?'✕ 收起外观描述':'＋ 外观描述')+'</button><div id="evo-desc-wrap-'+p+'" style="margin-bottom:6px">'+diyEvoDescHTML(p)+'</div>';
    h+='<div class="set-title" style="margin-left:0;font-size:.78rem">进化分支</div><div id="evo-branches-'+p+'">'+diyEvoBranchesHTML(p)+'</div><button class="btn-small" data-diy-evo-addbranch="'+p+'" style="background:rgba(43,74,111,.7);margin-bottom:6px">＋ 进化分支</button>';
    h+='</div></div>';
  }
  return h;
}
function diyListHTML(type){
  var t=diyData[type]||{},ks=Object.keys(t);
  var head='<div class="set-title" style="margin-left:8px">已自创的'+diyLabel(type)+(ks.length?'（'+ks.length+'）':'')+'</div>';
  if(!ks.length)return head+'<div class="empty">暂无</div>';
  return head+ks.map(function(name){
    return '<div class="nearby-item" style="cursor:default"><div class="nearby-info"><div class="nearby-name" data-diy-view="'+esc(name)+'" style="cursor:pointer;color:#7cc4f8">'+esc(name)+'</div></div><button class="btn-small" data-diy-share="'+esc(name)+'" style="display:none" aria-hidden="true">分享</button><button class="btn-small" data-diy-del="'+esc(name)+'">✕</button></div>';
  }).join('');
}
function diyHTML(){
  var tabs=['move','ability','item','pokemon'].map(function(t){
    return '<button class="bag-tab'+(diyType===t?' active':'')+'" data-diy-tab="'+t+'">'+diyLabel(t)+'</button>';
  }).join('');
  return diyLorebookHTML()+diyVisionBtnHTML()+frameP('DIY 自创','<div class="bag-tabs">'+tabs+'</div><div id="diy-form">'+diyFormHTML(diyType)+'</div><div id="diy-list">'+diyListHTML(diyType)+'</div>')+diyImportHTML();
}
function diyBuildObj(type,name){
  var obj;
  if(type==='move'){
    obj={name:name,type:diyVal('diy-type'),cat:diyVal('diy-cat'),power:diyVal('diy-power'),acc:diyVal('diy-acc'),desc:diyVal('diy-desc'),eff:diyVal('diy-eff')};
  }else if(type==='ability'){
    obj={name:name,text:diyVal('diy-effect'),detail:diyVal('diy-detail')};
  }else if(type==='item'){
    obj={name:name,text:diyVal('diy-effect'),img:diyVal('diy-img')};
  }else{
    var chain=[];
    for(var p=0;p<diyEvoCount;p++){
      var pn=diyVal('evo-name-'+p);
      if(!pn)continue;
      var pts=[];
      var tcn=diyEvoTypeCounts[p]||2;for(var ti=1;ti<=tcn;ti++){var tv=diyVal('evo-type-'+p+'-'+ti);if(tv)pts.push(tv);}
      var st={name:pn,types:pts,ability:diyVal('evo-abi-'+p),stats:{hp:diyVal('evo-hp-'+p),atk:diyVal('evo-atk-'+p),def:diyVal('evo-def-'+p),spa:diyVal('evo-spa-'+p),spd:diyVal('evo-spd-'+p),spe:diyVal('evo-spe-'+p)},img:diyVal('evo-img-'+p)};
      var _dv=(diyEvoDescShow[p]?diyVal('evo-desc-'+p):(diyEvoDescCache[p]||'')).trim();
      if(_dv)st.desc=_dv;
      var evs=[];
var bn=diyEvoBranchCounts[p]||0;
for(var b=0;b<bn;b++){var cond=diyVal('evo-cond-'+p+'-'+b),to=diyVal('evo-to-'+p+'-'+b);if(cond||to)evs.push({cond:cond,to:to});}
if(evs.length)st.evos=evs;
      chain.push(st);
    }
    var base=chain[0]||{name:name,types:[],ability:'',stats:{},img:'',desc:''};
    obj={name:base.name,types:base.types,ability:base.ability,stats:base.stats,img:base.img,desc:base.desc,chain:chain};
  }
  return obj;
}
function diyAdd(type){
  var name=diyVal(type==='pokemon'?'evo-name-0':'diy-name');
  if(!name){diyMsg('名字不能为空');return;}
  var obj=diyBuildObj(type,name);
  diyData[type]=diyData[type]||{};
  var editing=diyEditingName;
  if(editing && diyData[type][editing]){
    if(name!==editing){delete diyData[type][editing];}
    diyData[type][name]=obj;
    diySave();
    diyEditingName='';
    var f=document.getElementById('diy-form');if(f)f.innerHTML=diyFormHTML(type);
    var l=document.getElementById('diy-list');if(l)l.innerHTML=diyListHTML(type);
    diyWriteLorebook(type,name,editing);
    diyRefreshTeam();
    return;
  }
  diyData[type][name]=obj;
  diySave();
  var f2=document.getElementById('diy-form');if(f2)f2.innerHTML=diyFormHTML(type);
  var l2=document.getElementById('diy-list');if(l2)l2.innerHTML=diyListHTML(type);
  diyWriteLorebook(type,name);
  diyRefreshTeam();
}
function diyMsg(t){
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">DIY</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="row"><span class="v">'+esc(t)+'</span></div></div></div>';
  overlay.classList.add('open');
}
function diyDoneMsg(){
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">DIY</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="row"><span class="v">请自行添加世界书信息</span></div><div class="action-btns"><button class="act-btn" data-close>我知道了</button></div></div></div>';
  overlay.classList.add('open');
}
function diyView(type,name){
  var obj=diyGet(type,name);
  if(!obj)return;
  var body='';
  if(type==='move'){
    body=infoRow('属性',esc(obj.type||'-'))+infoRow('分类',esc(obj.cat||'-'))+infoRow('威力',esc(obj.power||'-'))+infoRow('命中',esc(obj.acc||'-'));
    if(obj.desc)body+='<div class="row block"><span class="k">描述</span><span class="v">'+esc(obj.desc).replace(/\n/g,'<br>')+'</span></div>';
    if(obj.eff)body+='<div class="row block"><span class="k">详细效果</span><span class="v">'+esc(obj.eff).replace(/\n/g,'<br>')+'</span></div>';
  }else if(type==='pokemon'){
  if(obj.img)body='<div style="text-align:center;margin-bottom:8px"><img '+hudDiyImgAttrs(obj.img)+' style="max-width:96px;max-height:96px;object-fit:contain;image-rendering:pixelated" onerror="this.remove()"></div>';
  var types=(obj.types&&obj.types.length)?obj.types:(obj.type?[obj.type]:[]);
  if(types.length)body+='<div class="row"><span class="k">属性</span><div class="types">'+types.map(function(t){return typeChipHTML(t);}).join('')+'</div></div>';
  body+=infoRow('特性',esc(obj.ability||'-'));
  if(obj.stats)body+='<div class="row block"><span class="k">种族值</span><span class="v">'+esc(diyStatsText(obj.stats))+'</span></div>';
  if(obj.desc)body+='<div class="row block"><span class="k">外观描述</span><span class="v">'+esc(obj.desc).replace(/\n/g,'<br>')+'</span></div>';
if(obj.chain&&obj.chain.length>1){body+='<div class="row block"><span class="k">进化链</span><span class="v">'+obj.chain.map(function(st,i){return esc((i+1)+'. '+st.name+'（属性：'+(st.types&&st.types.length?st.types.join('/'):'-')+'，特性：'+(st.ability||'-')+'，种族值：'+diyStatsText(st.stats)+'）'+(st.desc?('　外观描述：'+st.desc):'')+(st.evos&&st.evos.length?('　进化分支：'+st.evos.map(function(e){return (e.cond||'?')+'→'+(e.to||'?');}).join('、')):''));}).join('<br>')+'</span></div>';}
}else if(type==='ability'){
  body='<div class="row block"><span class="k">介绍</span><span class="v">'+esc(obj.text||'-').replace(/\n/g,'<br>')+'</span></div>'+(obj.detail?'<div class="row block"><span class="k">详细效果</span><span class="v">'+esc(obj.detail).replace(/\n/g,'<br>')+'</span></div>':'');
}else{
  if(obj.img){
    body='<div style="text-align:center;margin-bottom:8px"><img '+hudDiyImgAttrs(obj.img)+' style="max-width:96px;max-height:96px;object-fit:contain;image-rendering:pixelated" onerror="this.remove()"></div>';
  }
  body+='<div class="row block"><span class="k">介绍</span><span class="v">'+esc(obj.text||'-').replace(/\n/g,'<br>')+'</span></div>';
}
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">'+esc(name)+'</div><button class="close" data-close>✕</button></div><div class="modal-body">'+body+'<div class="action-btns" style="margin-top:10px"><button class="act-btn" data-diy-copy="'+esc(name)+'" data-diy-copy-type="'+type+'">📋 一键复制</button><button class="act-btn" data-diy-edit="'+esc(name)+'" data-diy-edit-type="'+type+'">✏️ 编辑</button></div></div></div>';
  overlay.classList.add('open');
  hudResolvePkidbImages(overlay);
}
function diyEvoSetAbiAfterLoad(p,ability){
  fetchAbiList(function(list){
    var sel=document.getElementById('evo-abi-'+p);
    if(!sel)return;
    var h='<option value="">无</option>'+(list&&list.length?list.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join(''):'<option value="" disabled>加载失败</option>');
    sel.innerHTML=h;
    sel.value=ability;
  });
}
function diyEdit(type,name){
  var obj=diyGet(type,name);
  if(!obj){diyMsg('未找到该自创内容');return;}
  diyType=type;
  diyEditingName=name;
  overlay.classList.remove('open');
  var tabs=document.querySelectorAll('[data-diy-tab]');
  for(var i=0;i<tabs.length;i++){tabs[i].classList.toggle('active',tabs[i].getAttribute('data-diy-tab')===type);}
  var f=document.getElementById('diy-form');
  if(!f)return;
  if(type==='pokemon'){
    var chain=(obj.chain&&obj.chain.length)?obj.chain:[obj];
    diyEvoCount=chain.length;
    diyEvoTypeCounts=[];diyEvoBranchCounts=[];diyEvoAbiCats=[];diyEvoDescShow=[];diyEvoDescCache=[];
    for(var p=0;p<chain.length;p++){
      var st=chain[p]||{};
      diyEvoTypeCounts[p]=Math.max(2,(st.types&&st.types.length)?st.types.length:1);
      diyEvoBranchCounts[p]=(st.evos&&st.evos.length)?st.evos.length:0;
      diyEvoDescShow[p]=!!(st.desc&&String(st.desc).trim());
      diyEvoDescCache[p]=st.desc||'';
      var abi=st.ability||'';
      diyEvoAbiCats[p]=abi?(diyData.ability&&diyData.ability[abi]?'diy':'orig'):'';
    }
    f.innerHTML=diyPkmFormHTML()+diyBtnsHTML();
    for(var q=0;q<chain.length;q++){
      var s=chain[q]||{};
      var nm=document.getElementById('evo-name-'+q);if(nm)nm.value=s.name||'';
      if(s.types){for(var ti=0;ti<s.types.length;ti++){var te=document.getElementById('evo-type-'+q+'-'+(ti+1));if(te)te.value=s.types[ti];}}
      var st2=s.stats||{};
      ['hp','atk','def','spa','spd','spe'].forEach(function(k){var e=document.getElementById('evo-'+k+'-'+q);if(e)e.value=st2[k]||'';});
      var im=document.getElementById('evo-img-'+q);if(im)im.value=s.img||'';
      if(s.desc){var de=document.getElementById('evo-desc-'+q);if(de)de.value=s.desc;}
      var cat=document.getElementById('evo-abi-cat-'+q);if(cat)cat.value=diyEvoAbiCats[q]||'';
      var abiSel=document.getElementById('evo-abi-'+q);
      if(abiSel){
        if(diyEvoAbiCats[q]==='diy'){abiSel.value=s.ability||'';}
        else if(diyEvoAbiCats[q]==='orig'&&s.ability){diyEvoSetAbiAfterLoad(q,s.ability);}
      }
      if(s.evos&&s.evos.length){for(var b=0;b<s.evos.length;b++){var ce=document.getElementById('evo-cond-'+q+'-'+b);if(ce)ce.value=s.evos[b].cond||'';var to=document.getElementById('evo-to-'+q+'-'+b);if(to)to.value=s.evos[b].to||'';}}
    }
    diyEvoSyncNext();
  }else{
    f.innerHTML=diyFormHTML(type);
    var set=function(id,v){var e=document.getElementById(id);if(e)e.value=v||'';};
    if(type==='move'){set('diy-name',obj.name);set('diy-type',obj.type);set('diy-cat',obj.cat);set('diy-power',obj.power);set('diy-acc',obj.acc);set('diy-desc',obj.desc);set('diy-eff',obj.eff);}
    else if(type==='ability'){set('diy-name',obj.name);set('diy-effect',obj.text);set('diy-detail',obj.detail);}
    else if(type==='item'){set('diy-name',obj.name);set('diy-effect',obj.text);set('diy-img',obj.img);}
  }
  var addBtn=document.querySelector('[data-diy-add]');
  if(addBtn)addBtn.textContent='✔ 保存修改';
  resizeFrame();
}
function diyCopy(type,name){
  var obj=diyGet(type,name);
  if(!obj)return;
  var txt='';
  if(type==='move'){
    txt='技能：'+name+'\n属性：'+(obj.type||'-')+'\n分类：'+(obj.cat||'-')+'\n威力：'+(obj.power||'-')+'\n命中：'+(obj.acc||'-');
    if(obj.desc)txt+='\n描述：'+obj.desc;
    if(obj.eff)txt+='\n详细效果：'+obj.eff;
  }else if(type==='ability'){
  txt='特性：'+name+'\n介绍：'+(obj.text||'-');
  if(obj.detail)txt+='\n详细效果：'+obj.detail;
}else if(type==='item'){
  txt='道具：'+name+'\n介绍：'+(obj.text||'-');
}else{
  var types=(obj.types&&obj.types.length)?obj.types:(obj.type?[obj.type]:[]);
  txt='精灵：'+name+'\n属性：'+(types.length?types.join('/'):'-')+'\n特性：'+(obj.ability||'-');
  if(obj.stats)txt+='\n种族值：'+diyStatsText(obj.stats);
  if(obj.desc)txt+='\n外观描述：'+obj.desc;
if(obj.chain&&obj.chain.length>1)txt+='\n进化链：'+diyChainText(obj);
}
  function done(ok){var b=document.querySelector('[data-diy-copy]');if(b)b.textContent=ok?'✔ 已复制':'复制失败';}
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){done(true);},function(){diyCopyFallback(txt,done);});
    }else{diyCopyFallback(txt,done);}
  }catch(e){diyCopyFallback(txt,done);}
}
function diyCopyFallback(txt,done){
  try{
    var ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();var ok=document.execCommand('copy');document.body.removeChild(ta);done(!!ok);
  }catch(e){done(false);}
}
function diyDelStart(type,name){
  diyDelType=type;diyDelName=name;diyDelStep=1;
  diyConfirmModal();
}
function diyConfirmModal(){
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">确认删除（'+diyDelStep+'/2）</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="row"><span class="v">确认删除自创'+diyLabel(diyDelType)+'「'+esc(diyDelName)+'」？</span></div><div class="action-btns"><button class="act-btn" data-diy-confirm>✔ 确认（第 '+diyDelStep+' 次）</button><button class="act-btn" data-close>取消</button></div></div></div>';
  overlay.classList.add('open');
}
function diyDelConfirm(){
  diyDelStep++;
  if(diyDelStep>=3){
    var type=diyDelType, name=diyDelName;
    var t=diyData[type]||{};
    if(t[name]){delete t[name];diySave();}
    diyDisableLorebook(type,name);
    overlay.classList.remove('open');
    var l=document.getElementById('diy-list');if(l)l.innerHTML=diyListHTML(diyType);
    diyRefreshTeam();
  }else{
    diyConfirmModal();
  }
}
function diyClearStart(){
  diyClearStep=1;
  diyClearConfirmModal();
}
function diyClearConfirmModal(){
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">确认清空（'+diyClearStep+'/2）</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="row"><span class="v">确认清空当前填写的'+diyLabel(diyType)+'内容？</span></div><div class="action-btns"><button class="act-btn" data-diy-clear-confirm>✔ 确认（第 '+diyClearStep+' 次）</button><button class="act-btn" data-close>取消</button></div></div></div>';
  overlay.classList.add('open');
}
function diyClearConfirm(){
  diyClearStep++;
  if(diyClearStep>=3){
    var f=document.getElementById('diy-form');
    if(f)f.innerHTML=diyFormHTML(diyType);
    overlay.classList.remove('open');
  }else{
    diyClearConfirmModal();
  }
}

var PK_PNG={'ogerpon':1,'ogerpon-wellspring':1,'ogerpon-hearthflame':1,'ogerpon-cornerstone':1,'egg':1};
var TYPE_COLORS={一般:'#A8A878',格斗:'#C03028',飞行:'#A890F0',毒:'#A040A0',地面:'#E0C068',岩石:'#B8A038',虫:'#A8B820',幽灵:'#705898',钢:'#B8B8D0',火:'#F08030',水:'#6890F0',草:'#78C850',电:'#F8D030',超能力:'#F85888',冰:'#98D8D8',龙:'#7038F8',恶:'#705848',妖精:'#EE99AC','normal':'#A8A878','fighting':'#C03028','flying':'#A890F0','poison':'#A040A0','ground':'#E0C068','rock':'#B8A038','bug':'#A8B820','ghost':'#705898','steel':'#B8B8D0','fire':'#F08030','water':'#6890F0','grass':'#78C850','electric':'#F8D030','psychic':'#F85888','ice':'#98D8D8','dragon':'#7038F8','dark':'#705848','fairy':'#EE99AC'};
var TYPE_CN={'normal':'一般','fighting':'格斗','flying':'飞行','poison':'毒','ground':'地面','rock':'岩石','bug':'虫','ghost':'幽灵','steel':'钢','fire':'火','water':'水','grass':'草','electric':'电','psychic':'超能力','ice':'冰','dragon':'龙','dark':'恶','fairy':'妖精'};
var MOVE_TYPE={};
var ITEM_CN={'路卡利欧进化石':'lucarionite','力量头巾':'choice-band','讲究头带':'choice-band','讲究眼镜':'choice-specs','讲究围巾':'choice-scarf','生命宝珠':'life-orb','剩饭':'leftovers','吃剩的东西':'leftovers','气势披带':'focus-sash','突击背心':'assault-vest','进化奇石':'eviolite','弱点保险':'weakness-policy','达人带':'expert-belt','黑色污泥':'black-sludge','护符金币':'amulet-coin','先制之爪':'quick-claw','凸凸头盔':'rocky-helmet','红牌':'red-card','逃生按钮':'eject-button'};
var BALL_EN={'精灵球':'poke-ball','超级球':'great-ball','高级球':'ultra-ball','大师球':'master-ball','纪念球':'premier-ball','治愈球':'heal-ball','捕网球':'net-ball','巢穴球':'nest-ball','潜水球':'dive-ball','黑暗球':'dusk-ball','计时球':'timer-ball','先机球':'quick-ball','重复球':'repeat-ball','豪华球':'luxury-ball','狩猎球':'safari-ball','等级球':'level-ball','诱饵球':'lure-ball','月亮球':'moon-ball','友友球':'friend-ball','甜蜜球':'love-ball','沉重球':'heavy-ball','速度球':'fast-ball','竞赛球':'sport-ball','公园球':'park-ball','梦境球':'dream-ball','究极球':'beast-ball','贵重球':'cherish-ball','GS球':'gs-ball'};
var ITEM_ICON={'一般Z':'normalium-z','格斗Z':'fightinium-z','飞行Z':'flyinium-z','毒Z':'poisonium-z','地面Z':'groundium-z','岩石Z':'rockium-z','虫Z':'buginium-z','幽灵Z':'ghostium-z','钢Z':'steelium-z','火Z':'firium-z','水Z':'waterium-z','草Z':'grassium-z','电Z':'electrium-z','超能力Z':'psychium-z','冰Z':'icium-z','龙Z':'dragonium-z','恶Z':'darkinium-z','妖精Z':'fairium-z','皮卡丘Z':'pikanium-z','小智皮卡丘Z':'pikashunium-z','卡比兽Z':'snorlium-z','伊布Z':'eevium-z','阿罗拉雷丘Z':'aloraichium-z','狙射树枭Z':'decidium-z','炽焰咆哮虎Z':'incinium-z','西狮海壬Z':'primarium-z','杖尾鳞甲龙Z':'kommonium-z','露奈雅拉Z':'lunalium-z','鬃岩狼人Z':'lycanium-z','玛夏多Z':'marshadium-z','梦幻Z':'mewnium-z','谜拟QZ':'mimikium-z','谜拟ＱＺ':'mimikium-z','索尔迦雷欧Z':'solganium-z','卡璞Z':'tapunium-z','究极奈克洛兹玛Z':'ultranecrozium-z','极巨腕带':'dynamax-band','钥石':'key-stone','极巨汤':'max-soup','许愿星块':'wishing-piece'};
function ballEnName(c){var b=BALL_EN[c.ball]||c.ballEn||'';return String(b).toLowerCase().replace(/\.png$/,'');}
var BERRY_CN={'樱子果':'cheri-berry','零余果':'chesto-berry','桃桃果':'pecha-berry','莓莓果':'rawst-berry','利木果':'aspear-berry','苹野果':'leppa-berry','橙橙果':'oran-berry','柿仔果':'persim-berry','木子果':'lum-berry','文柚果':'sitrus-berry','勿花果':'figy-berry','异奇果':'wiki-berry','芒芒果':'mago-berry','乐芭果':'aguav-berry','芭亚果':'iapapa-berry','蔓莓果':'razz-berry','墨莓果':'bluk-berry','蕉香果':'nanab-berry','西梨果':'wepear-berry','凰梨果':'pinap-berry','榴石果':'pomeg-berry','藻根果':'kelpsy-berry','比巴果':'qualot-berry','哈密果':'hondew-berry','葡萄果':'grepa-berry','茄番果':'tamato-berry','玉黍果':'cornn-berry','岳竹果':'magost-berry','茸丹果':'rabuta-berry','檬柠果':'nomel-berry','刺角果':'spelon-berry','霹霹果':'pamtre-berry','刺耳果':'watmel-berry','巧可果':'durin-berry','千香果':'belue-berry','烛木果':'occa-berry','罗子果':'passho-berry','番荔果':'wacan-berry','莲蒲果':'rindo-berry','苦通果':'yache-berry','腰木果':'chople-berry','通通果':'kebia-berry','福禄果':'shuca-berry','扁樱果':'coba-berry','草蚕果':'payapa-berry','佛柑果':'tanga-berry','莓榴果':'charti-berry','刺梨果':'kasib-berry','蜜腰果':'haban-berry','灯浆果':'colbur-berry','枝荔果':'babiri-berry','香罗果':'chilan-berry','释陀果':'liechi-berry','奇秘果':'ganlon-berry','沙鳞果':'salac-berry','龙火果':'petaya-berry','杏仔果':'apicot-berry','兰萨果':'lansat-berry','星桃果':'starf-berry','谜芝果':'enigma-berry','奇拉果':'micle-berry','嘉珍果':'custap-berry','雾莲果':'jaboca-berry','洛玫果':'rowap-berry','亚开果':'roseli-berry','香藻果':'kee-berry','玛瑙果':'maranga-berry'};
var BERRY_BASE={};
for(var b in BERRY_CN){BERRY_BASE[BERRY_CN[b].replace(/-berry$/,'')]=1;}
function itemIconName(name){
  var n=String(name||'');
  if(ITEM_ICON[n])return ITEM_ICON[n];
  if(BALL_EN[n])return BALL_EN[n];
  if(BERRY_CN[n])return BERRY_CN[n];
  if(ITEM_CN[n])return ITEM_CN[n];
  for(var k in ITEM_ICON){if(n.indexOf(k)>=0)return ITEM_ICON[k];}
  for(var k2 in BALL_EN){if(n.indexOf(k2)>=0)return BALL_EN[k2];}
  for(var k3 in BERRY_CN){if(n.indexOf(k3)>=0)return BERRY_CN[k3];}
  for(var k4 in ITEM_CN){if(n.indexOf(k4)>=0)return ITEM_CN[k4];}
  var slug=normSlug(n);
  if(/berry$/.test(slug))return slug;
  if(BERRY_BASE[slug])return slug+'-berry';
  return '';
}
var ITEM_IMG={
  'Mega手镯':'https://media.52poke.com/wiki/7/70/Bag_%E8%B6%85%E7%BA%A7%E6%89%8B%E9%95%AF_Sprite.png',
  'Z强力手环':'https://media.52poke.com/wiki/8/85/%EF%BC%BA%E5%BC%BA%E5%8A%9B%E6%89%8B%E7%8E%AF.png',
  'Z手环':'https://img.baibai.cv/f/ZrDmSV/IMG_20260829_202216.png',
  '洛托姆手机':'https://media.52poke.com/wiki/a/ab/%E6%89%8B%E6%9C%BA%E6%B4%9B%E6%89%98%E5%A7%86_SV.png',
  '太晶珠':'https://media.52poke.com/wiki/d/d0/%E5%A4%AA%E6%99%B6%E7%8F%A0_SV.png',
  '钥石':'https://media.52poke.com/wiki/2/2e/%E9%92%A5%E7%9F%B3_ZA.png',
  '极巨腕带':'https://media.52poke.com/wiki/1/14/%E6%A5%B5%E5%B7%A8%E8%85%95%E5%B8%B6_%E7%B9%AA%E5%9C%96_SWSH.png',
  '宝可梦图鉴':'https://media.52poke.com/wiki/2/2d/%E5%AF%B6%E5%8F%AF%E5%A4%A2%E5%9C%96%E9%91%91_LPLE.png'
};
var ITEM_TEXT={'宝可梦图鉴':'宝可梦图鉴'};
function itemImgOf(name){
  if(!name)return undefined;
  if(ITEM_IMG[name]!==undefined)return ITEM_IMG[name];
  var ks=Object.keys(ITEM_IMG).sort(function(a,b){return b.length-a.length;});
  for(var i=0;i<ks.length;i++){
    if(ITEM_IMG[ks[i]]&&name.indexOf(ks[i])>=0)return ITEM_IMG[ks[i]];
  }
  return undefined;
}
var PS_ITEM_OUTLINE=false;
var PS_MIRRORS=[
  'https://cdn.jsdelivr.net/gh/msikma/pokesprite@master/',
  'https://fastly.jsdelivr.net/gh/msikma/pokesprite@master/',
  'https://raw.gitmirror.com/msikma/pokesprite/master/',
  'https://raw.githubusercontent.com/msikma/pokesprite/master/'
];
var PA_MIRRORS=[
  'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/',
  'https://fastly.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/',
  'https://raw.gitmirror.com/PokeAPI/sprites/master/sprites/items/',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/'
];
var PS_CAT={
  'poke-ball':'ball','great-ball':'ball','ultra-ball':'ball','master-ball':'ball','premier-ball':'ball','heal-ball':'ball','net-ball':'ball','nest-ball':'ball','dive-ball':'ball','dusk-ball':'ball','timer-ball':'ball','quick-ball':'ball','repeat-ball':'ball','luxury-ball':'ball','safari-ball':'ball','level-ball':'ball','lure-ball':'ball','moon-ball':'ball','friend-ball':'ball','love-ball':'ball','heavy-ball':'ball','fast-ball':'ball','sport-ball':'ball','park-ball':'ball','dream-ball':'ball','beast-ball':'ball','cherish-ball':'ball','gs-ball':'ball',
  'normalium-z':'z-crystals','fightinium-z':'z-crystals','flyinium-z':'z-crystals','poisonium-z':'z-crystals','groundium-z':'z-crystals','rockium-z':'z-crystals','buginium-z':'z-crystals','ghostium-z':'z-crystals','steelium-z':'z-crystals','firium-z':'z-crystals','waterium-z':'z-crystals','grassium-z':'z-crystals','electrium-z':'z-crystals','psychium-z':'z-crystals','icium-z':'z-crystals','dragonium-z':'z-crystals','darkinium-z':'z-crystals','fairium-z':'z-crystals','pikanium-z':'z-crystals','pikashunium-z':'z-crystals','snorlium-z':'z-crystals','eevium-z':'z-crystals','aloraichium-z':'z-crystals','decidium-z':'z-crystals','incinium-z':'z-crystals','primarium-z':'z-crystals','kommonium-z':'z-crystals','lunalium-z':'z-crystals','lycanium-z':'z-crystals','marshadium-z':'z-crystals','mewnium-z':'z-crystals','mimikium-z':'z-crystals','solganium-z':'z-crystals','tapunium-z':'z-crystals','ultranecrozium-z':'z-crystals',
  'dynamax-band':'key-item','key-stone':'key-item','max-soup':'key-item','wishing-piece':'key-item'
};
function ballNorm(s){var m={'pokeball':'poke-ball','greatball':'great-ball','ultraball':'ultra-ball','masterball':'master-ball','safariball':'safari-ball','premierball':'premier-ball','healball':'heal-ball','netball':'net-ball','nestball':'nest-ball','diveball':'dive-ball','duskball':'dusk-ball','timerball':'timer-ball','quickball':'quick-ball','repeatball':'repeat-ball','luxuryball':'luxury-ball','levelball':'level-ball','lureball':'lure-ball','moonball':'moon-ball','friendball':'friend-ball','loveball':'love-ball','heavyball':'heavy-ball','fastball':'fast-ball','sportball':'sport-ball','parkball':'park-ball','dreamball':'dream-ball','beastball':'beast-ball','cherishball':'cherish-ball','gsball':'gs-ball'};return m[s]||s;}
function normSlug(s){return String(s==null?'':s).toLowerCase().replace(/é/g,'e').replace(/\.(png|gif|jpe?g|webp)$/,'').replace(/'/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
function psCat(slug){
  if(PS_CAT[slug])return PS_CAT[slug];
  if(/-z$/.test(slug))return 'z-crystals';
  if(/ite(-[xy])?$/.test(slug))return 'mega-stone';
  if(/^tm-/.test(slug))return 'tm';
  if(/^tr-/.test(slug))return 'tr';
  if(/^hm-/.test(slug))return 'hm';
  if(/^(town-map|bicycle|escape-rope|exp-share|itemfinder|poke-flute|good-rod|super-rod|vs-seeker|pokeradar|mega-ring|z-ring|tera-orb)$/.test(slug))return 'key-item';
  if(/^(potion|super-potion|hyper-potion|max-potion|full-restore|revive|max-revive|antidote|burn-heal|ice-heal|awakening|paralyze-heal|full-heal|ether|max-ether|elixir|max-elixir|fresh-water|soda-pop|lemonade|moomoo-milk|energy-powder|energy-root|heal-powder|revival-herb|berry-juice|sacred-ash|sweet-heart|rare-candy|hp-up|protein|iron|calcium|zinc|carbos|pp-up|pp-max)$/.test(slug))return 'medicine';
  if(/^(fire-stone|water-stone|thunder-stone|leaf-stone|moon-stone|sun-stone|shiny-stone|dusk-stone|dawn-stone|ice-stone|oval-stone|everstone)$/.test(slug))return 'evo-item';
  if(/berry$/.test(slug))return 'berry';
  if(/-plate$/.test(slug))return 'plate';
  if(/-gem$/.test(slug))return 'gem';
  if(/-memory$/.test(slug))return 'memory';
  if(/-mint$/.test(slug))return 'mint';
  if(/-fossil$/.test(slug))return 'fossil';
  if(/-incense$/.test(slug))return 'incense';
  if(/-flute$/.test(slug))return 'flute';
  if(/-shard$/.test(slug))return 'shard';
  if(/-scarf$/.test(slug))return 'scarf';
  if(/-mail$/.test(slug))return 'mail';
  if(/-mulch$/.test(slug))return 'mulch';
  if(/-apricorn$/.test(slug))return 'apricorn';
  return '';
}
function psItemUrl(slug,kind){
  var s=ballNorm(normSlug(slug));
  var cat=psCat(s);
  if(cat==='ball')s=s.replace(/-ball$/,'');
  else if(cat==='tm')s=s.replace(/^tm-/,'');
  else if(cat==='tr')s=s.replace(/^tr-/,'');
  else if(cat==='hm')s=s.replace(/^hm-/,'');
  else if(cat==='z-crystals')s+=(kind==='held'?'--held':'--bag');
  else if(cat==='plate')s=s.replace(/-plate$/,'');
  else if(cat==='gem')s=s.replace(/-gem$/,'');
  else if(cat==='memory')s=s.replace(/-memory$/,'');
  else if(cat==='mint')s=s.replace(/-mint$/,'');
  else if(cat==='fossil')s=s.replace(/-fossil$/,'');
  else if(cat==='incense')s=s.replace(/-incense$/,'');
  else if(cat==='flute')s=s.replace(/-flute$/,'');
  else if(cat==='shard')s=s.replace(/-shard$/,'');
  else if(cat==='scarf')s=s.replace(/-scarf$/,'');
  else if(cat==='mail')s=s.replace(/-mail$/,'');
  else if(cat==='mulch')s=s.replace(/-mulch$/,'');
  else if(cat==='apricorn')s=s.replace(/-apricorn$/,'');
  else if(cat==='berry')s=s.replace(/-berry$/,'');
  if(cat)return PS_MIRRORS[0]+(PS_ITEM_OUTLINE?'items-outline/':'items/')+cat+'/'+s+'.png';
  return PA_MIRRORS[0]+s+'.png';
}
function itemImgErr(el){
  var src=String(el.getAttribute('src')||'');
  var isPS=(src.indexOf('pokesprite')>=0);
  var all=isPS?PS_MIRRORS:PA_MIRRORS;
  var cur=-1,rel='';
  for(var i=0;i<all.length;i++){
    if(src.indexOf(all[i])===0){cur=i;rel=src.slice(all[i].length);break;}
  }
  if(cur<0){el.outerHTML='<span class="item-icon placeholder">?</span>';return;}
  if(cur<all.length-1){el.src=all[cur+1]+rel;return;}
  if(isPS){
    var parts=rel.split('/');
    var dir=parts[1]||'';
    var slug=(parts[parts.length-1]||'').replace(/\.(png|gif|jpe?g|webp)$/,'').replace(/--(held|bag)$/,'');
    if(dir==='tm')slug='tm-'+slug;
    else if(dir==='tr')slug='tr-'+slug;
    else if(dir==='hm')slug='hm-'+slug;
    else if(dir==='ball')slug+='-ball';
    else if(dir==='plate')slug+='-plate';
    else if(dir==='gem')slug+='-gem';
    else if(dir==='memory')slug+='-memory';
    else if(dir==='mint')slug+='-mint';
    else if(dir==='fossil')slug+='-fossil';
    else if(dir==='incense')slug+='-incense';
    else if(dir==='flute')slug+='-flute';
    else if(dir==='shard')slug+='-shard';
    else if(dir==='scarf')slug+='-scarf';
    else if(dir==='mail')slug+='-mail';
    else if(dir==='mulch')slug+='-mulch';
    else if(dir==='apricorn')slug+='-apricorn';
    else if(dir==='berry')slug+='-berry';
    el.src=PA_MIRRORS[0]+ballNorm(slug)+'.png';
  }else{
    el.outerHTML='<span class="item-icon placeholder">?</span>';
  }
}

var NAME_EN={'蛋':'egg','皮卡丘':'pikachu','伊布':'eevee','喷火龙':'charizard','路卡利欧':'lucario','烈咬陆鲨':'garchomp','巨金怪':'metagross','班基拉斯':'tyranitar','快龙':'dragonite'};
function pkmEnName(n){if(!n)return '';var b=baseName(String(n).trim());return NAME_EN[b]||'';}
var pkmSlugCache={};
var pkmDexCache={};
var pkmSpriteCache={};
function spriteCacheKey(name,shiny){return (shiny?'s:':'n:')+baseName(String(name||'').trim());}
function cachedSpriteCss(name,shiny){
  var k=spriteCacheKey(name,shiny);
  if(!k)return '';
  if(pkmSpriteCache[k]!==undefined)return pkmSpriteCache[k];
  try{
    var v=lsGet('pk_sprite_'+k,'');
    if(v){pkmSpriteCache[k]=v;return v;}
  }catch(e){}
  return '';
}
function setCachedSprite(name,shiny,url){
  var k=spriteCacheKey(name,shiny);
  if(!k||!url)return;
  var css="url('"+url+"')";
  pkmSpriteCache[k]=css;
  try{lsSet('pk_sprite_'+k,css);}catch(e){}
}
function pkImgSmart(species,icon,shiny){
  var d=diyPokemonSprite(species);if(d)return {img:d};
  if(diyHas('pokemon',species))return null;
  /* 通讯交换/外部导入的精灵可能直接携带 http/data/pkidb 图片。 */
  var rawIcon=String(icon||'').trim();
  if(rawIcon.indexOf(HUD_DIY_SCHEME)===0){var ru=hudDiyAssetResolveSync(rawIcon);if(ru)return {img:ru};hudDiyAssetResolve(rawIcon);return null;}
  if(/^(?:https?:\/\/|data:image\/)/i.test(rawIcon)){return {img:rawIcon};}
  if(icon){var u=pkImg(icon,shiny);if(u)return {bg:u};}
  var c=cachedSpriteCss(species,shiny);if(c)return {bg:c};
  return {bg:pkImg(species,shiny)};
}
/* 统一生成精灵图片元素：DIY/直链图用 <img>（确定能显示），百科图用背景图。 */
function pkImgHTML(species,icon,shiny,cls){
  cls=cls||'';
  var r=pkImgSmart(species,icon,shiny);
  if(r&&r.img){
    return '<div class="pk-img '+cls+'"><img src="'+esc(r.img)+'" alt="" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated" onerror="this.remove();this.parentNode.classList.add(\'no-img\');this.parentNode.textContent=\'?\'"></div>';
  }
  if(r&&r.bg){
    return '<div class="pk-img '+cls+'" style="background-image:'+r.bg+'"></div>';
  }
  return '<div class="pk-img '+cls+' no-img" data-pkm="'+esc(species)+'" data-shiny="'+(shiny?'1':'0')+'">?</div>';
}
function diyPokemonImageRef(name){
  if(!name)return '';
  try{diySyncFromStorage(false);}catch(e){}
  var hit=hudDiyLookup(name);
  if(hit){var root=hit.root||{},stage=hit.stage||root,img=String(stage.img||root.img||'').trim();if(!img&&Array.isArray(root.chain)){for(var i=0;i<root.chain.length;i++){if(root.chain[i]&&root.chain[i].img){img=String(root.chain[i].img);break;}}}if(img)return img;}
  /* 仅保留旧版模糊兜底，用于名称轻微偏差；找到后仍返回 canonical 引用。 */
  var p=diyData.pokemon||{},bn=baseName(String(name).trim());
  for(var k in p){var o=p[k];if(!o)continue;var bk=baseName(String(k));if(bk&&bn&&bk.length>=2&&bn.length>=2&&(bn.indexOf(bk)>=0||bk.indexOf(bn)>=0)){var img2=o.img||'';if(!img2&&o.chain&&o.chain.length)img2=o.chain[0].img||'';if(img2)return String(img2);}}
  return '';
}
function diyPokemonSprite(name){
  var ref=diyPokemonImageRef(name);if(!ref)return '';
  if(ref.indexOf(HUD_DIY_SCHEME)===0)return hudDiyAssetResolveSync(ref);
  return ref;
}
function fetchPkmSlug(name,cb){
  if(!name){cb&&cb('');return;}
  var b=baseName(String(name).trim());
  if(!b){cb&&cb('');return;}
  if(NAME_EN[b]){cb&&cb(NAME_EN[b]);return;}
  if(pkmSlugCache[b]){cb&&cb(pkmSlugCache[b]);return;}
  var _c=lsGet('pk_slug_'+b,'');
  if(_c){pkmSlugCache[b]=_c;cb&&cb(_c);return;}
  function finish(slug){
    pkmSlugCache[b]=slug;
    if(slug)lsSet('pk_slug_'+b,slug);
    cb&&cb(slug);
  }
  function parsePage(title,onFail){
    hudFetch('https://wiki.52poke.com/api.php?action=parse&page='+encodeURIComponent(title)+'&format=json&prop=wikitext&variant=zh-hans&origin=*')
      .then(function(r){return r.ok?r.json():Promise.reject();})
      .then(function(j){
        var wt=(j&&j.parse&&j.parse.wikitext)?j.parse.wikitext['*']:'';
        var d=wt?parsePkmn(wt):null;
        var slug=(d&&d.enname)?String(d.enname).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,''):'';
        if(d&&d.ndex){pkmDexCache[b]=String(d.ndex);lsSet('pk_ndex_'+b,String(d.ndex));}
        if(slug){finish(slug);}else{onFail();}
      })
      .catch(onFail);
  }
  function searchThen(){
    hudFetch('https://wiki.52poke.com/api.php?action=query&list=search&srsearch='+encodeURIComponent(t2s(b))+'&srnamespace=0&srlimit=6&format=json&origin=*')
      .then(function(r){return r.json();})
      .then(function(j){
        var rs=(j&&j.query&&j.query.search)||[];
        var i=0;
        function tryNext(){
          if(i>=rs.length){finish('');return;}
          parsePage(rs[i++].title,tryNext);
        }
        tryNext();
      })
      .catch(function(){finish('');});
  }
  parsePage(t2s(b),searchThen);
}
function resolvePkmImgs(scope){
  var els=(scope||document).querySelectorAll('.pk-img[data-pkm]');
  for(var i=0;i<els.length;i++){
    (function(el){
      var name=el.getAttribute('data-pkm');
      var shiny=el.getAttribute('data-shiny')==='1';
      if(diyHas('pokemon',name))return;
var c=cachedSpriteCss(name,shiny);
if(c){el.style.backgroundImage=c;el.classList.remove('no-img');el.textContent='';el.removeAttribute('data-pkm');return;}
fetchPkmSlug(name,function(slug){
        if(slug){resolvePkmBg(el,slug,shiny,name);}
      });
    })(els[i]);
  }
}
var SLUG_FIX={'hooh':'ho-oh'};
function fixSlug(n){return SLUG_FIX[n]||n;}
function slugCandidates(n){
  var out=[n];
  var noH=n.replace(/[-:]/g,'');
  if(noH!==n)out.push(noH);
  var m=n.match(/^([a-z]+)(\d+)$/);
  if(m)out.push(m[1]+'-'+m[2]);
  if(/oo$/.test(n)&&n.length>3)out.push(n.slice(0,-1)+'-'+n.slice(-1));
  var sf=['galar','alola','hisui','paldea','mega','gmax','complete','attack','defense','speed','zen','school','busted','dawn','dusk','ultra','origin','sky','therian','crowned','white','black','ice','shadow','hero','stellar','terastal','rapid','single','resolute','wash','heat','mow','frost','fan','pau','sensu','baile','sunny','rainy','snowy','amped','low-key','pom-pom'];
  for(var i=0;i<sf.length;i++){
    var idx=n.indexOf(sf[i]);
    if(idx>0&&n.charAt(idx-1)!=='-'){out.push(n.slice(0,idx)+'-'+n.slice(idx));}
  }
  var seen={},res=[];
  for(var j=0;j<out.length;j++){if(!seen[out[j]]){seen[out[j]]=1;res.push(out[j]);}}
  return res;
}
var PKM_SPRITE_BASE='https://play.pokemonshowdown.com/sprites/';
var PA_POKE_MIRRORS=[
  'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/',
  'https://fastly.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/',
  'https://raw.gitmirror.com/PokeAPI/sprites/master/sprites/pokemon/',
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'
];

/* v1.8.3：向 Phone Suite 暴露 HUD 当前精灵图库 URL 规则。
 * 只返回模板/构造后的公开 URL，不共享私有状态；调用方可独立选择图库来源。 */
function hudSpriteProviders(){
  var sb=String(PKM_SPRITE_BASE||'https://play.pokemonshowdown.com/sprites/');
  var pm=(PA_POKE_MIRRORS&&PA_POKE_MIRRORS.length)?PA_POKE_MIRRORS.slice():[
    'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/',
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'
  ];
  var out=[
    {id:'hud-showdown-ani',name:'HUD · Pokémon Showdown 动态 GIF',site:'Pokémon Showdown',kind:'gif',dynamic:true,normalTemplate:sb+'ani/{slug}.gif',shinyTemplate:sb+'ani-shiny/{slug}.gif',baseUrl:sb},
    {id:'hud-showdown-gen5',name:'HUD · Pokémon Showdown Gen5 PNG',site:'Pokémon Showdown',kind:'png',dynamic:false,normalTemplate:sb+'gen5/{slug}.png',shinyTemplate:sb+'gen5-shiny/{slug}.png',baseUrl:sb}
  ];
  for(var i=0;i<pm.length;i++){
    var id=i===0?'hud-pokeapi-jsdelivr':(i===1?'hud-pokeapi-fastly':(i===2?'hud-pokeapi-gitmirror':'hud-pokeapi-raw'));
    var nm=i===0?'HUD · PokeAPI jsDelivr':(i===1?'HUD · PokeAPI Fastly':(i===2?'HUD · PokeAPI GitMirror':'HUD · PokeAPI Raw GitHub'));
    out.push({id:id,name:nm,site:'PokeAPI sprites',kind:'png',dynamic:false,normalTemplate:pm[i]+'{id}.png',shinyTemplate:pm[i]+'shiny/{id}.png',baseUrl:pm[i]});
  }
  return out;
}
function hudBuildPokemonSpriteUrls(opt){
  opt=opt&&typeof opt==='object'?opt:{};
  var providerId=String(opt.providerId||'hud-showdown-ani');
  var rawSlug=String(opt.slug||opt.pokemonSlug||opt.englishName||opt.name||'').trim();
  var slug=fixSlug(normSlug(rawSlug));
  var cands=slug?slugCandidates(slug):[];
  if(!cands.length&&slug)cands=[slug];
  var id=parseInt(opt.pokemonApiId||opt.id||opt.speciesDex||opt.dex||0,10)||0;
  var providers=hudSpriteProviders(),p=null;
  for(var i=0;i<providers.length;i++){if(providers[i].id===providerId){p=providers[i];break;}}
  if(!p)p=providers[0];
  function fill(tpl,s){return String(tpl||'').replace(/\{slug\}/g,s||'').replace(/\{id\}/g,String(id||''));}
  var primarySlug=cands[0]||slug,normal=fill(p.normalTemplate,primarySlug),shiny=fill(p.shinyTemplate,primarySlug);
  var normalCandidates=[],shinyCandidates=[];
  if(String(p.normalTemplate||'').indexOf('{slug}')>=0){
    for(var j=0;j<cands.length;j++){normalCandidates.push(fill(p.normalTemplate,cands[j]));shinyCandidates.push(fill(p.shinyTemplate,cands[j]));}
  }else if(id){normalCandidates=[normal];shinyCandidates=[shiny];}
  return {providerId:p.id,providerName:p.name,site:p.site||'',kind:p.kind||'',dynamic:!!p.dynamic,slug:primarySlug,pokemonApiId:id,normal:normal,shiny:shiny,normalCandidates:normalCandidates,shinyCandidates:shinyCandidates};
}
function noRefImg(){var im=new Image();try{im.referrerPolicy='no-referrer';}catch(e){}return im;}
function resolvePkmBg(el,slug,shiny,name){
  var cands=slugCandidates(fixSlug(slug));
  var i=0;
  var dexNo='';
  if(name){var bn=baseName(String(name).trim());dexNo=(pkmDexCache[bn]||lsGet('pk_ndex_'+bn,''))||'';}
  function apply(url){
    el.style.backgroundImage="url('"+url+"')";
    el.classList.remove('no-img');
    el.textContent='';
    el.removeAttribute('data-pkm');
    if(name){setCachedSprite(name,shiny,url);}
  }
  function fail(){el.classList.add('no-img');el.style.backgroundImage='none';el.textContent='?';}
  function tryPokeApi(mi){
    var n=parseInt(dexNo,10);
    if(!n||mi>=PA_POKE_MIRRORS.length){fail();return;}
    var u=PA_POKE_MIRRORS[mi]+(shiny?'shiny/':'')+n+'.png';
    var im=noRefImg();
    im.onload=function(){apply(u);};
    im.onerror=function(){tryPokeApi(mi+1);};
    im.src=u;
  }
  function next(){
    if(i>=cands.length){tryPokeApi(0);return;}
    var s=cands[i++];
    var ani=PKM_SPRITE_BASE+(shiny?'ani-shiny/':'ani/')+s+'.gif';
    var png=PKM_SPRITE_BASE+(shiny?'gen5-shiny/':'gen5/')+s+'.png';
    var im=noRefImg();
    im.onload=function(){apply(ani);};
    im.onerror=function(){
      var im2=noRefImg();
      im2.onload=function(){apply(png);};
      im2.onerror=next;
      im2.src=png;
    };
    im.src=ani;
  }
  next();
}
function pkImg(e,t){
  if(!e)return '';
  var s=String(e).toLowerCase();
  var n=s;
  if(n.slice(-4)==='.png'||n.slice(-4)==='.gif'){n=n.slice(0,-4);}
  if(/[\u4e00-\u9fff]/.test(n)){n=pkmEnName(n);if(!n)return '';}
n=fixSlug(n);
var a='https://play.pokemonshowdown.com/sprites/';
  var isPng=(s.slice(-4)==='.png')||(PK_PNG[n]===1);
  var pre=t?'gen5-shiny/':'gen5/';
  if(!isPng){pre=t?'ani-shiny/':'ani/';}
  return "url('"+a+pre+n+(isPng?'.png':'.gif')+"')";
}
function pkImgFix(scope){
  var els=(scope||document).querySelectorAll('.pk-img');
  for(var i=0;i<els.length;i++){
    (function(el){
      var bg=el.style.backgroundImage||'';
      var m=bg.match(/url\u0028['"]?([^'")]+)['"]?\u0029/);
      if(!m)return;
      var u=m[1];
      if(u.indexOf('play.pokemonshowdown.com/sprites/ani')<0)return;
      var fn=u.split('/').pop().replace(/\.(png|gif)$/,'');
      var shiny=u.indexOf('/ani-shiny/')>=0;
      resolvePkmBg(el,fn,shiny);
    })(els[i]);
  }
}
var BADGE_MIRRORS=[
  'https://cdn.jsdelivr.net/gh/feixianer/pokemon-badges@main/',
  'https://fastly.jsdelivr.net/gh/feixianer/pokemon-badges@main/',
  'https://raw.gitmirror.com/feixianer/pokemon-badges/main/',
  'https://raw.githubusercontent.com/feixianer/pokemon-badges/main/'
];
var BADGE_DIR={'关都':'guandu','城都':'chengdu','丰缘':'fengyuan','神奥':'shenao','合众':'hezhong','卡洛斯':'kaluosi','伽勒尔':'jialeer','帕底亚':'padiya'};
var BADGE_MAP={'关都':[[1,'岩石','灰色徽章','深灰市'],[2,'水','蓝色徽章','华蓝市'],[3,'电','橙色徽章','枯叶市'],[4,'草','彩虹徽章','玉虹市'],[5,'毒','粉红徽章','浅红市'],[6,'超能力','金黄徽章','金黄市'],[7,'火','深红徽章','红莲镇'],[8,'地面','绿色徽章','常青市']],'城都':[[1,'飞行','飞翼徽章','桔梗市'],[2,'虫','昆虫徽章','桧皮镇'],[3,'一般','常规徽章','满金市'],[4,'幽灵','幻影徽章','圆珠市'],[5,'格斗','打击徽章','湛蓝市'],[6,'钢','钢铁徽章','浅葱市'],[7,'冰','冰雪徽章','卡吉镇'],[8,'龙','升龙徽章','烟墨市']],'丰缘':[[1,'岩石','岩石徽章','卡那兹市'],[2,'格斗','拳击徽章','武斗镇'],[3,'电','电力徽章','紫堇市'],[4,'火','烈焰徽章','釜炎镇'],[5,'一般','天秤徽章','橙华市'],[6,'飞行','白羽徽章','茵郁市'],[7,'超能力','心灵徽章','绿岭市'],[8,'水','雨滴徽章','琉璃市']],'神奥':[[1,'岩石','石炭徽章','黑金市'],[2,'草','森林徽章','百代市'],[3,'格斗','铺石徽章','帷幕市'],[4,'水','湿地徽章','野原市'],[5,'幽灵','遗迹徽章','家缘市'],[6,'钢','矿山徽章','水脉市'],[7,'冰','冰河徽章','雪峰市'],[8,'电','灯塔徽章','滨海市']],'合众':[[1,'草/火/水','三元徽章','三曜市'],[2,'一般','基础徽章','七宝市'],[3,'毒','毒烟徽章','立涌市'],[4,'虫','甲虫徽章','飞云市'],[5,'电','伏特徽章','雷文市'],[6,'地面','震动徽章','帆巴市'],[7,'飞行','喷射徽章','吹寄市'],[8,'冰','冰柱徽章','雪花市'],[9,'龙','传说徽章','双龙市'],[10,'水','海浪徽章','青海波市']],'卡洛斯':[[1,'虫','虫虫徽章','白檀市'],[2,'岩石','崖壁徽章','遥香市'],[3,'格斗','战斗徽章','娑罗市'],[4,'草','植物徽章','比翼市'],[5,'电','电压徽章','密阿雷市'],[6,'妖精','妖精徽章','香薰市'],[7,'超能力','幻彩徽章','百刻市'],[8,'冰','冰山徽章','映雪市']],'伽勒尔':[[1,'草','草之徽章','草路镇'],[2,'水','水之徽章','水舟镇'],[3,'火','火之徽章','机擎市'],[4,'格斗','格斗徽章','溯传镇'],[5,'幽灵','幽灵徽章','溯传镇'],[6,'妖精','妖精徽章','舞姿镇'],[7,'岩石','岩石徽章','战竞镇'],[8,'冰','冰之徽章','战竞镇'],[9,'恶','恶之徽章','尖钉镇'],[10,'龙','龙之徽章','拳关市']],'帕底亚':[[1,'虫','虫之徽章','圆模镇'],[2,'草','草之徽章','深钵镇'],[3,'水','水之徽章','玻瓶市'],[4,'电','电之徽章','酿光市'],[5,'一般','一般徽章','锦汇市'],[6,'冰','冰之徽章','霜抹山'],[7,'幽灵','幽灵徽章','冰柜镇'],[8,'超能力','超能徽章','焙固镇']]};
var badgeSel=null;
var badgeMinHCache=0;
function badgeMinH(){if(badgeMinHCache)return badgeMinHCache;var d=document.createElement('div');d.className='badge-grid';d.style.cssText='position:absolute;visibility:hidden;left:-9999px;top:0;width:100%;';var tab=BADGE_MAP['合众']||[];var rec={region:'合众',list:[],cnt:0};d.innerHTML=tab.map(function(e,i){return badgeImg('合众',e,badgeGot(rec,e,i),true);}).join('');document.body.appendChild(d);badgeMinHCache=d.offsetHeight||0;if(d.parentNode)d.parentNode.removeChild(d);return badgeMinHCache;}
function cityKey(s){var t=String(s||'').trim();if(t.length>1&&'市镇岛村町山'.indexOf(t.charAt(t.length-1))>=0)t=t.slice(0,-1);var A={'超能':'超能力','念力':'超能力','普通':'一般','电气':'电','鬼':'幽灵','暗':'恶','仙子':'妖精','武斗':'格斗','钢铁':'钢','岩':'岩石','昆虫':'虫','冰系':'冰','大地':'地面'};if(A[t])t=A[t];return t;}
function badgeCands(e){var out=[];String(e[1]).split('/').forEach(function(t){out.push(cityKey(t));});out.push(cityKey(e[2]));out.push(cityKey(String(e[2]).replace('徽章','')));out.push(cityKey(e[3]));return out;}
function badgeUrl(region,no){var d=BADGE_DIR[region];return d?BADGE_MIRRORS[0]+d+'/'+no+'.png':'';}
function badgeImgErr(el){
  var src=String(el.getAttribute('src')||'');
  var cur=-1,rel='';
  for(var i=0;i<BADGE_MIRRORS.length;i++){
    if(src.indexOf(BADGE_MIRRORS[i])===0){cur=i;rel=src.slice(BADGE_MIRRORS[i].length);break;}
  }
  if(cur<0){el.style.visibility='hidden';return;}
  if(cur<BADGE_MIRRORS.length-1){el.src=BADGE_MIRRORS[cur+1]+rel;return;}
  el.style.visibility='hidden';
}
try{WIN.badgeImgErr=badgeImgErr;WIN.itemImgErr=itemImgErr;}catch(e){}
if(WIN!==window){try{window.badgeImgErr=badgeImgErr;window.itemImgErr=itemImgErr;}catch(e){}}
function parseBadges(){var raw=String((stat_data.训练家&&stat_data.训练家.徽章)||''),out=[];raw.split('｜').join('|').split('|').forEach(function(seg){seg=String(seg).trim();if(!seg)return;var i=seg.indexOf(':');if(i<0)i=seg.indexOf('：');var region=(i<0?seg:seg.slice(0,i)).trim();var body=(i<0?'':seg.slice(i+1)).trim();var list=[],cnt=0;body.split('，').join(',').split('、').join(',').split(',').forEach(function(x){x=String(x).trim();if(!x)return;if(!isNaN(Number(x))){cnt=Number(x);}else{list.push(x);}});if(region)out.push({region:region,list:list,cnt:cnt});});return out;}
function badgeGot(r,e,idx){if(r.list.length){var c=badgeCands(e);for(var i=0;i<r.list.length;i++){if(c.indexOf(cityKey(r.list[i]))>=0)return true;}return false;}return idx<r.cnt;}
function badgeCount(r){var t=BADGE_MAP[r.region]||[];if(r.list.length)return r.list.length;return t.length?Math.min(r.cnt,t.length):r.cnt;}
function badgeTotal(rs){var n=0;rs.forEach(function(r){n+=badgeCount(r);});return n;}
function pickRegion(rs){if(!rs.length)return '';var saved=null;try{saved=JSON.parse(localStorage.getItem('pk_badge_sel')||'null');}catch(e){}if(saved&&saved.region){for(var i=0;i<rs.length;i++){if(rs[i].region===saved.region)return saved.region;}}return rs[rs.length-1].region;}
function badgeImg(region,e,got,big){var u=badgeUrl(region,e[0]),cls=got?'':' off';if(!u)return '<span class="badge-cell'+cls+'">·</span>';if(big)return '<div class="badge-item'+cls+'"><img src="'+esc(u)+'" onerror="badgeImgErr(this)"><span class="badge-name">'+esc(e[2])+'<br>'+esc(e[3])+'</span></div>';return '<span class="badge-cell'+cls+'" title="'+esc(e[2]+' · '+e[3]+' · '+e[1])+'"><img src="'+esc(u)+'" onerror="badgeImgErr(this)"></span>';}
function badgeRowHTML(){var rs=parseBadges();if(!rs.length)return '<div class="info-row" id="badge-entry"><span class="k">徽章</span><span class="v"><span class="dim">尚无徽章</span></span></div>';var reg=pickRegion(rs),cur=rs[0],i;for(i=0;i<rs.length;i++){if(rs[i].region===reg)cur=rs[i];}var tab=BADGE_MAP[cur.region]||[],cells='';if(tab.length){for(i=0;i<tab.length;i++){cells+=badgeImg(cur.region,tab[i],badgeGot(cur,tab[i],i),false);}}else{cells='<span class="dim">'+esc(cur.list.join(' '))+'</span>';}var more=rs.length>1?'<span class="badge-more">+'+(rs.length-1)+'个地区</span>':'';return '<div class="info-row block" id="badge-entry"><span class="k">徽章</span><span class="v"><div class="badge-line"><span class="badge-region" id="badge-cycle" title="点击切换地区">'+esc(cur.region)+(rs.length>1?' ⇄':'')+'<span class="badge-cnt"> '+badgeCount(cur)+'/'+(tab.length||badgeCount(cur))+'</span></span><span class="badge-row">'+cells+'</span>'+more+'<button class="btn-small" data-badge-open style="margin-left:auto;padding:2px 8px;font-size:.7rem">🏅 查看</button></div></span></div>';}
function badgePageHTML(){var rs=parseBadges(),regions=Object.keys(BADGE_MAP);var cur=badgeSel||pickRegion(rs)||regions[0];if(regions.indexOf(cur)<0)cur=regions[0];var tabs=regions.map(function(r){return '<button class="badge-tab'+(r===cur?' active':'')+'" data-bregion="'+esc(r)+'">'+esc(r)+'</button>';}).join('');var rec=null;rs.forEach(function(r){if(r.region===cur)rec=r;});if(!rec)rec={region:cur,list:[],cnt:0};var tab=BADGE_MAP[cur]||[],cells=tab.map(function(e,i){return badgeImg(cur,e,badgeGot(rec,e,i),true);}).join('');var mh=badgeMinH();return frame('徽章盒 '+esc(cur)+' '+badgeCount(rec)+'/'+tab.length,'<div class="badge-tabs">'+tabs+'</div><div class="badge-grid" style="min-height:'+mh+'px">'+cells+'</div>');}
function baseName(s){var t=String(s||'').trim(),i=t.indexOf('-');if(i>0)t=t.slice(0,i);var pre=['搭档','头目','霸主','闪光','原始回归','原始','超极巨化','超极巨','极巨化','极巨','太晶化','太晶','阿罗拉','伽勒尔','洗翠','帕底亚','Mega','mega'],go=true;while(go){go=false;for(var k=0;k<pre.length;k++){if(t.indexOf(pre[k])===0&&t.length>pre[k].length){t=t.slice(pre[k].length).trim();go=true;}}}return t;}
function addSpecies(o,n){n=baseName(n);if(n)o[n]=1;}
function ownedSpecies(){var o={},t=stat_data.队伍||{},k;for(k in t){if(t[k]&&t[k].名字&&t[k].名字!=='空')addSpecies(o,t[k].名字);}var b=stat_data.盒子||{};for(var bx in b){var sl=b[bx]||{};for(var p in sl){if(sl[p]&&sl[p].名字&&sl[p].名字!=='空')addSpecies(o,sl[p].名字);}}return o;}
function chatKey(){try{var w=WIN,ST=w&&w.SillyTavern,ctx=ST&&ST.getContext?ST.getContext():null;var cid=(ctx&&ctx.chatId)||'';return String(cid).replace(/[^a-zA-Z0-9_-]/g,'_');}catch(e){return '';}}
function seenKey(){return 'pk_seen_'+String((stat_data.训练家&&stat_data.训练家.名字)||'default')+'_'+chatKey();}
function loadSeen(){try{var o=JSON.parse(localStorage.getItem(seenKey())||'{}');return (o&&typeof o==='object')?o:{};}catch(e){return {};}}
function seenFullKey(){return 'pk_seenfull2_'+String((stat_data.训练家&&stat_data.训练家.名字)||'default')+'_'+chatKey();}
function loadSeenFull(){try{var o=JSON.parse(localStorage.getItem(seenFullKey())||'{}');return (o&&typeof o==='object')?o:{};}catch(e){return {};}}
function addFull(o,n,ic){
  var t=t2s(String(n||'').trim());
  var pre=['搭档','头目','霸主','闪光','太晶化','太晶','极巨化','极巨'],go=true;
  while(go){go=false;for(var k=0;k<pre.length;k++){if(t.indexOf(pre[k])===0&&t.length>pre[k].length){t=t.slice(pre[k].length).trim();go=true;}}}
  if(t)o[t]=1;
  var si=String(ic||'').toLowerCase(),rg='';
  if(si.indexOf('-alola')>=0||t.indexOf('阿罗拉')>=0||t.indexOf('阿羅拉')>=0)rg='阿罗拉';
  else if(si.indexOf('-galar')>=0||t.indexOf('伽勒尔')>=0||t.indexOf('伽勒爾')>=0)rg='伽勒尔';
  else if(si.indexOf('-hisui')>=0||t.indexOf('洗翠')>=0)rg='洗翠';
  else if(si.indexOf('-paldea')>=0||t.indexOf('帕底亚')>=0||t.indexOf('帕底亞')>=0)rg='帕底亚';
  if(rg){var b=baseName(t);if(b&&b!==t)o[b+'-'+rg]=1;}
}
function ownedFull(){
  var o={},t=stat_data.队伍||{},k;
  for(k in t){if(t[k]&&t[k].名字&&t[k].名字!=='空')addFull(o,t[k].名字,t[k].图标);}
  var b=stat_data.盒子||{};
  for(var bx in b){var sl=b[bx]||{};for(var p in sl){if(sl[p]&&sl[p].名字&&sl[p].名字!=='空')addFull(o,sl[p].名字,sl[p].图标);}}
  return o;
}
function recordSeen(){
  var s=loadSeen(),sf=loadSeenFull(),o=ownedSpecies(),of=ownedFull(),k;
  for(k in o){s[k]=1;}
  for(k in of){sf[k]=1;}
  var nb=stat_data.附近宝可梦||{};
  for(k in nb){if(nb[k]&&nb[k].名字){addSpecies(s,nb[k].名字);addFull(sf,nb[k].名字,nb[k].图标);}}
  var f=(stat_data.战场&&stat_data.战场.场上)||{};
  for(k in f){var sg=String(k).split('·');if(sg.length>1){var n=sg[1].split('(')[0].split('（')[0];addSpecies(s,n);addFull(sf,n,'');}}
  try{localStorage.setItem(seenKey(),JSON.stringify(s));}catch(e){}
  try{localStorage.setItem(seenFullKey(),JSON.stringify(sf));}catch(e){}
}
function hitSpecies(set,name){if(!name)return false;if(set[name])return true;if(name.length<2)return false;for(var k in set){if(k.indexOf(name)===0&&k.length>name.length){if(!/[\u4e00-\u9fff]/.test(k.slice(name.length)))return true;}}return false;}
function formSeen(set,f,base){
  if(f.region){
    var rk={'alola':'阿罗拉','galar':'伽勒尔','hisui':'洗翠','paldea':'帕底亚'}[f.region]||'';
    var rt={'alola':'阿羅拉','galar':'伽勒爾','hisui':'洗翠','paldea':'帕底亞'}[f.region]||'';
    if(!rk)return !!set[f.name];
    for(var k in set){
      if((k.indexOf(rk)>=0||(rt&&k.indexOf(rt)>=0))&&k.indexOf(base)>=0)return true;
    }
    return false;
  }
  if(f.formKey){
    if(set[f.name])return true;
    return false;
  }
  if(set[base])return true;
  for(var k2 in set){
    if(k2.indexOf(base)===0&&k2.length>base.length&&!/[\u4e00-\u9fff]/.test(k2.slice(base.length))){
      if(k2.indexOf('阿罗拉')<0&&k2.indexOf('阿羅拉')<0&&k2.indexOf('伽勒尔')<0&&k2.indexOf('伽勒爾')<0&&k2.indexOf('洗翠')<0&&k2.indexOf('帕底亚')<0&&k2.indexOf('帕底亞')<0)return true;
    }
  }
  return false;
}
function num(v,d){var n=parseInt(v,10);return isNaN(n)?d:n;}
function esc(s){s=String(s==null?'':s);s=s.replace(/&/g,'&amp;');s=s.replace(/</g,'&lt;');s=s.replace(/>/g,'&gt;');return s;}
function parseHP(s){var p=String(s||'0/0').split('/');return{cur:num(p[0],0),max:num(p[1],0)};}
function genderOf(g){var s=String(g||'');if(s==='♂'||s==='雄性'||s==='男'||s==='公'||s==='M'||s==='m'||s==='male')return{sym:'♂',cls:'m'};if(s==='♀'||s==='雌性'||s==='女'||s==='母'||s==='F'||s==='f'||s==='female')return{sym:'♀',cls:'f'};return{sym:'',cls:'none'};}
function statusTag(s){s=String(s||'').trim();if(!s||s==='无'||s==='正常')return '';var m={'麻痹':'par','剧毒':'psn','中毒':'psn','灼伤':'brn','烧伤':'brn','睡眠':'slp','冰冻':'frz','混乱':'cnf','畏缩':'cnf'},c='bad';for(var k in m){if(s.indexOf(k)>=0){c=m[k];break;}}return '<span class="ailment '+c+'">'+esc(s)+'</span>';}
function battleStatusFor(pkm){
  try{
    var field=(stat_data.战场&&stat_data.战场.场上)||{};
    var name=String(pkm.名字||'');
    if(!name)return '';
    var bare=name.replace(/^(头目|霸主|搭档)\s*/,'');
    for(var key in field){
      if(key.indexOf('我方')<0)continue;
      if(key.indexOf(name)<0&&(!bare||key.indexOf(bare)<0))continue;
      var segs=String(field[key]||'').split(/[｜|]/);
      for(var j=0;j<segs.length;j++){
        var s=segs[j].trim();
        if(s.indexOf('状态')===0){
          var st=s.replace(/^状态[：:\s]*/,'').trim();
          return (st&&st!=='无')?st:'';
        }
      }
      return '';
    }
  }catch(e){}
  return '';
}
function cardFromPkm(p,slot,where,boxName){var hp=parseHP(p.HP);return{slot:slot||'',where:where||'team',boxName:boxName||'',empty:false,name:p.昵称||p.名字,species:p.名字,level:num(p.等级,1),hpCur:hp.cur,hpMax:hp.max,gender:p.性别||'',shiny:!!p.是否闪光,status:battleStatusFor(p),icon:p.图标||'',exp:p.经验||'',attr1:p.属性1||'',attr2:p.属性2||'',skills:p.技能||'',nature:p.性格||'',ability:p.特性||'',item:p.携带道具||'',itemEn:p.携带道具英文||'',iv:p.个体值||'',ball:p.精灵球||'',ballEn:p.精灵球英文||'',partner:p.搭档倾向||'',intimacy:p.亲密度||'',hatch:p.孵化剩余||''};}
function buildCards(){var out=[];for(var i=1;i<=6;i++){var p=(stat_data.队伍&&stat_data.队伍[String(i)])||{名字:'空'};if(p.名字&&p.名字!=='空'){out.push(cardFromPkm(p,i,'team',''));}else{out.push({slot:i,empty:true});}}return out;}

var svgFrame='<svg class="card-bg-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="7,1.5 98.5,1.5 98.5,74 93,98.5 1.5,98.5 1.5,26" fill="rgba(127,116,232,0.25)" stroke="#7d95b5" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';

function cardHTML(c){
  if(c.empty){return '<div class="empty-frame">'+svgFrame+'<div class="empty-inner"><span class="empty-txt">空位 '+c.slot+'</span></div></div>';}
  var gi=genderOf(c.gender);var ail=statusTag(c.status);var pct=c.hpMax>0?Math.max(0,Math.min(100,c.hpCur/c.hpMax*100)):0;var hpCls=pct>=50?'hp-high':pct>=20?'hp-mid':'hp-low';
  var dead=c.hpMax>0&&c.hpCur<=0;
  var fnt=dead?'<span class="ailment fnt">圈圈眼</span>':'';
  var ex=parseHP(c.exp);var expPct=ex.max>0?Math.max(0,Math.min(100,ex.cur/ex.max*100)):0;
  var img=pkImgHTML(c.species,c.icon,c.shiny,(dead?'fainted':''));
  var itName=(c.item&&c.item!=='无')?c.item:'';
  var isMega=/mega|超级|超进化|超級|超進化/i.test(c.name+' '+c.species);
  var isGmax=/极巨|極巨|gmax|dynamax/i.test(c.name+' '+c.species);
  var isGigantamax=/超极巨|超極巨|gmax|gigantamax/i.test(c.name+' '+c.species);
  var isTotem=/霸主|头目|頭目/i.test(c.name+' '+c.species);
var ov=itemImgOf(itName);
var itemImg;
if(!itName){itemImg='';}
else if(ov!==undefined){itemImg=ov?'<img class="item-badge" src="'+esc(ov)+'" onerror="itemImgErr(this)">':'<span class="item-badge">?</span>';}
else{itemImg='<span class="item-badge item-wiki" data-item="'+esc(itName)+'" data-cls="item-badge">?</span>';}
  return '<div class="card-frame" data-slot="'+c.slot+'">'+(isGmax?'<svg class="card-bg-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="7,1.5 98.5,1.5 98.5,74 93,98.5 1.5,98.5 1.5,26" fill="#D70645" fill-opacity="0.65" stroke="#7d95b5" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>':svgFrame)+'<div class="card-inner"><div class="pk-top"><div class="pk-side">'+img+'</div><div class="pk-info"><div class="name-row"><span class="pk-left"><span class="pk-name">'+esc(c.name)+(c.shiny?'<span class="shiny">✦</span>':'')+'</span>'+(isMega?'<img class="mega-ic" src="https://img.baibai.cv/f/YNBKTy/1788349081288.png" onerror="this.remove()">':'')+(isGigantamax?'<img class="mega-ic" src="https://img.baibai.cv/f/GKpwto/1788410257587.png" onerror="this.remove()">':'')+(isTotem?'<img class="mega-ic" src="https://img.baibai.cv/f/yeRrTj/1788410175968.png" onerror="this.remove()">':'')+'</span><span class="gender-side">'+fnt+(ail||'')+'<span class="gender-sym '+gi.cls+'">'+gi.sym+'</span></span></div><div class="bar-row"><span class="hp-label">HP</span><div class="bar-stack"><div class="hp-bar"><div class="hp-fill '+hpCls+'" style="width:'+pct+'%"></div></div><div class="exp-bar"><div class="exp-fill" style="width:'+expPct+'%"></div></div></div></div></div></div><div class="bottom-row"><span class="pk-lv-wrap"><span class="pk-level">Lv.'+c.level+'</span>'+itemImg+'</span><span class="hp-num">'+c.hpCur+'/'+c.hpMax+'</span></div></div></div>';
}
function frame(title,content){return '<div class="info-frame plain-frame"><div class="info-inner"><div class="info-title">'+title+'</div>'+content+'</div></div>';}function frameP(title,content){return '<div class="info-frame plain-frame"><div class="info-inner"><div class="info-title">'+title+'</div>'+content+'</div></div>';}
function infoRow(k,v){return '<div class="info-row"><span class="k">'+k+'</span><span class="v">'+v+'</span></div>';}

function teamHTML(){var cards=buildCards();var left=cards.slice(0,3).map(cardHTML).join('');var right=cards.slice(3,6).map(cardHTML).join('');return '<div class="grid"><div class="col col-left">'+left+'</div><div class="col col-right">'+right+'</div></div>';}
function trainerHTML(){var tr=stat_data.训练家||{};var hearts='';for(var i=0;i<num(tr.活力上限,3);i++){hearts+='<span class="heart'+(i<num(tr.活力,3)?'':' empty')+'">♥</span>';}var content=infoRow('名字',esc(tr.名字||'???')+' '+hearts)+infoRow('金钱','¥'+num(tr.金钱,0).toLocaleString())+badgeRowHTML()+infoRow('身份',esc(tr.身份||'-'))+infoRow('声望',esc(tr.声望||'-'))+'<div class="info-row block"><span class="k">气场</span><span class="v">'+esc(tr.气场||'-')+'</span></div>'+'<div class="info-row cmd"><span class="k">可命令等级</span><span class="v">Lv.'+num(tr.可命令等级,0)+'</span></div>';var ev=stat_data.环境||{},en='';if(ev.当前地点)en+='<span>📍 '+esc(ev.当前地点)+'</span>';if(ev.日期||ev.时间)en+='<span>🕐 '+esc(ev.日期||'')+(ev.日期&&ev.时间?' ':'')+esc(ev.时间||'')+'</span>';return '<div class="info-frame trainer-frame"><div class="info-inner"><div class="info-title"><span>个人信息</span>'+refreshBtnHTML()+'<span class="tr-right">'+(en?'<span class="tr-env">'+en+'</span>':'')+'</span></div>'+content+'</div></div>';}
function envStripHTML(){var e=stat_data.环境||{};if(!e.赛程)return '';return '<div class="env-strip"><div class="env-line"><span class="env-item">🏁 '+esc(e.赛程)+'</span></div></div>';}
function nearbyHTML(){var obj=stat_data.附近宝可梦||{};var keys=Object.keys(obj);if(!keys.length)return frame('附近宝可梦','<div class="empty">暂无</div>');var show=nearbyOpen?keys:keys.slice(0,6);var cells=show.map(function(key){var p=obj[key];var img=pkImgHTML(p.名字,p.图标,p.是否闪光,'nb-icon');var tags=(p.是否闪光?'<span class="tag shiny">闪</span>':'')+(p.状态&&p.状态!=='普通'?'<span class="tag boss">'+esc(p.状态)+'</span>':'');return '<div class="nb-cell" data-nearby-open="'+esc(key)+'">'+img+'<div class="nb-name">'+esc(p.名字)+(/霸主|头目|頭目/.test(p.名字+' '+p.状态)?'<img class="mega-ic" src="https://img.baibai.cv/f/yeRrTj/1788410175968.png" onerror="this.remove()">':'')+tags+'</div><div class="nb-cnt">×'+num(p.数量,1)+'</div></div>';}).join('');var more=keys.length>6?'<span class="nb-toggle" data-nearby-toggle>'+(nearbyOpen?'收起 ▲':'展开全部('+keys.length+') ▼')+'</span>':'';return '<div class="info-frame nearby-frame">'+svgFrame+'<div class="info-inner"><div class="info-title">附近宝可梦'+more+'</div><div class="nb-grid">'+cells+'</div></div></div>';}
function nearbyPageHTML(){var obj=stat_data.附近宝可梦||{};var keys=Object.keys(obj);if(!keys.length)return '<div class="nearby-wrap"><div class="nearby-title">附近宝可梦</div><div class="empty">暂无</div></div>';var cells=keys.map(function(key){var p=obj[key];var img=pkImgHTML(p.名字,p.图标,p.是否闪光,'box-icon');var nm=esc(p.名字)+(/霸主|头目|頭目/.test(p.名字+' '+p.状态)?'<img class="mega-ic" src="https://img.baibai.cv/f/yeRrTj/1788410175968.png" onerror="this.remove()">':'')+(p.是否闪光?'<span class="tag shiny">闪光</span>':'')+(p.状态&&p.状态!=='普通'?'<span class="tag boss">'+esc(p.状态)+'</span>':'')+' ×'+num(p.数量,1);return '<div class="box-cell nearby-cell" data-nearby="'+esc(key)+'">'+img+'<div class="box-name">'+nm+'</div></div>';}).join('');return '<div class="nearby-wrap"><div class="nearby-title">附近宝可梦</div><div class="nearby-grid">'+cells+'</div></div>';}
function openNearbyPage(){pageOverlayPopout(false);pageOverlay.innerHTML='<div class="page nearby-page"><div class="page-head"><button class="page-close" data-page-close>✕</button></div><div class="page-body nearby-body">'+nearbyPageHTML()+'</div></div>';pageOverlay.classList.add('open');bindPageInteractions();pkImgFix(pageOverlay);}

function bagCategories(){var cats=[{key:'道具',label:'道具',items:[]},{key:'精灵球',label:'精灵球',items:[]},{key:'重要物品',label:'重要物品',items:[]}];var bag=stat_data.背包||{};Object.keys(bag).forEach(function(name){var it=bag[name];if(!it||typeof it!=='object'||!(('类型')in it))return;var c=cats.find(function(x){return x.key===it.类型;});if(c)c.items.push({name:name,count:Number(it.数量)||0,icon:String(it.图标||'')});});return cats;}
var activeBag='道具';
function bagItemsHTML(){var cats=bagCategories();var cur=cats.find(function(c){return c.key===activeBag;})||cats[0];if(!cur.items.length)return '<div class="empty">这里什么都没有...</div>';return cur.items.map(function(it){var isTM=(it.name.indexOf('技能机')>=0);var icon;if(isTM){var iconName=(itemIconName(it.name)||String(it.icon||'')).toLowerCase();if(iconName.slice(-4)==='.png'){iconName=iconName.slice(0,-4);}icon=iconName?'<span class="item-icon-wrap"><img class="item-icon" src="'+esc(psItemUrl(iconName,'bag'))+'" onerror="itemImgErr(this)"></span>':'<span class="item-icon-wrap"><span class="item-icon placeholder">?</span></span>';}else{var ov=itemImgOf(it.name);
if(ov!==undefined){icon=ov?'<span class="item-icon-wrap"><img class="item-icon" src="'+esc(ov)+'" onerror="itemImgErr(this)"></span>':'<span class="item-icon-wrap"><span class="item-icon placeholder">?</span></span>';}else{icon='<span class="item-icon-wrap"><span class="item-icon placeholder item-wiki" data-item="'+esc(it.name)+'" data-cls="item-icon">?</span></span>';}}var click=(isTM||!itemClickEnabled)?'':' data-item="'+esc(it.name)+'" style="cursor:pointer"';return '<div class="item-entry"'+click+'>'+icon+'<span class="item-name">'+esc(it.name)+'</span><span class="item-count">×'+it.count+'</span><button class="btn-small" data-bag-discard="'+esc(it.name)+'">丢弃</button></div>';}).join('');}
function bagHTML(){var tabs=bagCategories().map(function(c){return '<button class="bag-tab'+(c.key===activeBag?' active':'')+'" data-bag="'+c.key+'">'+c.label+'</button>';}).join('');return frame('背包','<div class="bag-tabs">'+tabs+'</div><div class="bag-list" id="bag-list">'+bagItemsHTML()+'</div>');}
/* ===== 地图功能（坐标内置，用户直接看） ===== */
var MAPS_DATA=[
  {
  name:'关都',
  img:'https://img.baibai.cv/f/OMKnsy/CI_NSwitch_PokemonLetsGoPikachuPokemonLetsGoEevee_01_Map.jpeg',
  towns:[
    {name:'真新镇',x:23.9,y:64.9},
    {name:'常青市',x:24.4,y:45.4},
    {name:'深灰市',x:25.1,y:20.9},
    {name:'华蓝市',x:64.7,y:17.6},
    {name:'紫苑镇',x:88.8,y:36.1},
    {name:'金黄市',x:64.6,y:34.9},
    {name:'玉虹市',x:47.7,y:35.1},
    {name:'浅红市',x:50.5,y:74.5},
    {name:'枯叶市',x:64.4,y:56},
    {name:'红莲镇',x:23.8,y:91.4},
    {name:'霓虹镇',x:49.9,y:83.6}
  ],
  roads:[
    {name:'1号道路',x:23.9,y:56.2},
    {name:'2号道路',x:24.8,y:33.6},
    {name:'3号道路',x:36.4,y:20.8},
    {name:'4号道路',x:52.4,y:17.8},
    {name:'5号道路',x:64.7,y:26.3},
    {name:'6号道路',x:64.7,y:45},
    {name:'7号道路',x:56.9,y:35.3},
    {name:'8号道路',x:77,y:35.4},
    {name:'9号道路',x:77.3,y:16.6},
    {name:'10号道路',x:88.2,y:29.8},
    {name:'11号道路',x:78.5,y:54.8},
    {name:'12号道路',x:89.5,y:55},
    {name:'13号道路',x:79.3,y:69.5},
    {name:'14号道路',x:72.9,y:73.3},
    {name:'15号道路',x:65,y:76.4},
    {name:'16号道路',x:37.4,y:35.4},
    {name:'17号道路',x:35.9,y:52.1},
    {name:'18号道路',x:38.2,y:75.8},
    {name:'19号水道',x:49.6,y:89.8},
    {name:'20号水道',x:33.3,y:93},
    {name:'21号水道',x:23.9,y:78},
    {name:'22号道路',x:16.6,y:45.9},
    {name:'24号道路',x:64.6,y:9.2},
    {name:'25号道路',x:73.5,y:5.9}
  ],
  specials:[
    {name:'月见山',x:42.9,y:11.6},
    {name:'常青森林',x:23.5,y:31.3},
    {name:'伙伴公园',x:50.4,y:62.3},
    {name:'正辉灯塔',x:81.3,y:4.7},
    {name:'圣特安努号',x:64.5,y:66.3},
    {name:'小明的道馆',x:64.5,y:43.3},
    {name:'宝可梦研究学院',x:64.6,y:47.5},
    {name:'胜利之路',x:12.5,y:32.3},
    {name:'白银山',x:5,y:6.4},
    {name:'蓝普尔其',x:59.7,y:56.2},
    {name:'少女峡',x:69.6,y:58.5},
    {name:'大傻谷',x:34.2,y:92.4},
    {name:'石英高原',x:12.9,y:5.2},
    {name:'自行车道',x:35.6,y:58.2},
    {name:'地鼠洞穴出入口',x:26.6,y:27.6},
    {name:'地鼠洞穴出入口',x:66.2,y:44.3},
    {name:'双子岛',x:38.5,y:92.8},
    {name:'华蓝洞窟',x:56.3,y:12.8},
    {name:'岩山隧道',x:86.4,y:19.6}
  ]
},
  {
    name:'丰缘',
    img:'https://img.baibai.cv/f/ovRNiO/%E4%B8%B0%E7%BC%98.jpg',
    towns:[
      {name:'末白镇',x:20.1,y:70.8},
      {name:'古玫镇',x:20.2,y:62.1},
      {name:'橙华市',x:13,y:62.7},
      {name:'卡那兹市',x:8.5,y:45.8},
      {name:'武斗镇',x:11.4,y:89.8},
      {name:'凯那市',x:30.9,y:66.8},
      {name:'紫堇市',x:31.4,y:38.3},
      {name:'绿茵镇',x:20.3,y:37.7},
      {name:'釜炎镇',x:23.7,y:21.8},
      {name:'秋叶镇',x:20.4,y:8.4},
      {name:'茵郁市',x:46,y:11.4},
      {name:'水静市',x:68,y:22.5},
      {name:'绿岭市',x:88.2,y:25.3},
      {name:'琉璃市',x:76,y:43.8},
      {name:'暮水镇',x:63.5,y:64.3},
      {name:'彩悠市',x:94,y:46.6}
    ],
    roads:[
      {name:'101号道路',x:20.1,y:67.1},
      {name:'102号道路',x:16.8,y:62.5},
      {name:'103号道路',x:24.2,y:54.4},
      {name:'104号道路',x:8.7,y:63.2},
      {name:'105号水路',x:7.6,y:74.2},
      {name:'106号水路',x:10.9,y:84.5},
      {name:'107号水路',x:17,y:89.4},
      {name:'108号水路',x:24.6,y:88.5},
      {name:'109号水路',x:31.6,y:83.5},
      {name:'110号道路',x:31.2,y:47.5},
      {name:'111号道路',x:34.4,y:17},
      {name:'112号道路',x:29.3,y:21.8},
      {name:'113号道路',x:28.6,y:8.7},
      {name:'114号道路',x:15,y:13.7},
      {name:'115号道路',x:9.8,y:34.2},
      {name:'116号道路',x:13.2,y:41.4},
      {name:'117号道路',x:26.5,y:38.7},
      {name:'118号道路',x:41.7,y:38.1},
      {name:'119号道路',x:40,y:21.1},
      {name:'120号道路',x:54.6,y:18.2},
      {name:'121号道路',x:59.4,y:23.3},
      {name:'122号水路',x:58.4,y:29.3},
      {name:'123号道路',x:50.7,y:39.1},
      {name:'124号水路',x:75.2,y:22.5},
      {name:'125号水路',x:80.9,y:26.4},
      {name:'126号水路',x:77.7,y:39.1},
      {name:'127号水路',x:83.9,y:46.4},
      {name:'128号水路',x:85.3,y:54.5},
      {name:'129号水路',x:83.8,y:64.8},
      {name:'130号水路',x:75.7,y:65.1},
      {name:'131号水路',x:69.6,y:65.5},
      {name:'132号水路',x:53.9,y:64.1},
      {name:'133号水路',x:45.7,y:65.3},
      {name:'134号水路',x:38.6,y:64.2}
    ],
    specials:[
      {name:'橙华森林',x:7,y:57.6},
      {name:'石之洞窟',x:7.4,y:86.1},
      {name:'海紫堇',x:23.9,y:83},
      {name:'新紫堇',x:33.9,y:42.4},
      {name:'卡绿隧道',x:16.3,y:38.7},
      {name:'烟囱山',x:24.6,y:11},
      {name:'凹凸山道',x:24.5,y:14.9},
      {name:'烈焰小径',x:27.5,y:17.8},
      {name:'流星瀑布',x:11.3,y:22.5},
      {name:'狩猎地带',x:59.1,y:19.2},
      {name:'送神山',x:61,y:29},
      {name:'浅滩洞穴',x:88.8,y:14.8},
      {name:'天空之柱',x:75.1,y:60.5},
      {name:'南方孤岛',x:46.8,y:85.7},
      {name:'秘密海滨',x:86.2,y:68.7},
      {name:'冠军之路',x:93.9,y:39.9},
      {name:'起源洞窟',x:84,y:47.7},
      {name:'对战度假地',x:78.7,y:77.2},
      {name:'幻影岛',x:61,y:91.6},
      {name:'觉醒神殿',x:76,y:43},
      {name:'秘密小岛',x:71,y:49.4}
    ]
  },
  {
    name:'神奥',
    img:'https://img.baibai.cv/f/apYeHR/%E7%A5%9E%E5%A5%A5.png',
    towns:[
      {name:'双叶镇',x:15.8,y:87.7},
      {name:'水脉市',x:11.6,y:66},
      {name:'真砂镇',x:22.9,y:82.8},
      {name:'祝庆市',x:22.4,y:71.1},
      {name:'黑金市',x:36.1,y:70.4},
      {name:'家缘市',x:53.7,y:61.3},
      {name:'野原市',x:66.9,y:76.4},
      {name:'滨海市',x:91,y:71.5},
      {name:'帷幕市',x:74.7,y:50.4},
      {name:'雪峰市',x:43.8,y:8.9},
      {name:'神和镇',x:51.4,y:41.8},
      {name:'百代市',x:38.7,y:42},
      {name:'花苑镇',x:24.8,y:56.3},
      {name:'随意镇',x:61.9,y:56}
    ],
    roads:[
      {name:'201号道路',x:16.1,y:83.2},
      {name:'202号道路',x:23.4,y:79.1},
      {name:'203号道路',x:29.1,y:70.3},
      {name:'204号道路',x:24.5,y:61.7},
      {name:'205号道路',x:29.1,y:50.9},
      {name:'206号道路',x:37.5,y:52.5},
      {name:'207号道路',x:40.2,y:63.2},
      {name:'208号道路',x:46.6,y:65.2},
      {name:'209号道路',x:60.9,y:64.4},
      {name:'210号道路',x:59.1,y:41},
      {name:'211号道路',x:45.7,y:41.3},
      {name:'212号道路',x:57.1,y:83},
      {name:'213号道路',x:71,y:77},
      {name:'214号道路',x:77.6,y:62.4},
      {name:'215号道路',x:65.8,y:48.6},
      {name:'216号道路',x:43.6,y:27.4},
      {name:'217号道路',x:39,y:19.3},
      {name:'218号道路',x:15.8,y:69.3},
      {name:'219号道路',x:23.1,y:87.3},
      {name:'220号水路',x:23.1,y:94.3},
      {name:'221号道路',x:31,y:92.8},
      {name:'222号道路',x:82.4,y:73.1},
      {name:'223号水路',x:88.7,y:58.2},
      {name:'224号道路',x:92.3,y:40.9},
      {name:'225号道路',x:67.5,y:23.5},
      {name:'226号水路',x:74.8,y:21.8},
      {name:'227号道路',x:74.9,y:16.5},
      {name:'228号道路',x:79,y:24.5},
      {name:'229号道路',x:81.7,y:30.7},
      {name:'230号水路',x:74.5,y:32.5}
    ],
    specials:[
      {name:'睿智湖',x:40,y:9.3},
      {name:'钢铁岛',x:21.2,y:37.3},
      {name:'新月岛',x:17.6,y:13.7},
      {name:'满月岛',x:7.2,y:14.7},
      {name:'多多罗铁工厂',x:24.3,y:46.2},
      {name:'百代森林',x:29,y:41.4},
      {name:'山谷发电站',x:32.8,y:54.7},
      {name:'心齐湖',x:11.9,y:79.3},
      {name:'伙伴公园',x:36.1,y:86.2},
      {name:'天冠山',x:44.5,y:41.6},
      {name:'立志湖',x:74.8,y:69},
      {name:'宝可梦联盟',x:88,y:41.7},
      {name:'隐泉之路',x:81,y:61.8},
      {name:'战斗区',x:66.7,y:29.1},
      {name:'生存区',x:67.4,y:19.9},
      {name:'名胜区',x:82.5,y:35.2},
      {name:'严酷山',x:70,y:7.4},
      {name:'花之乐园',x:75.6,y:14.3},
      {name:'冠军之路',x:87.4,y:46.9}
    ]
  },
  {
    name:'伽勒尔',
    img:'https://img.baibai.cv/f/GkBXIo/%E4%BC%BD%E5%8B%92%E5%B0%94.png',
    towns:[
      {name:'宫门市',x:51.8,y:17},
      {name:'舞姿镇',x:35.7,y:29},
      {name:'溯传镇',x:33.9,y:36.5},
      {name:'拳关市',x:51.9,y:36.4},
      {name:'战竞镇',x:69.1,y:30.6},
      {name:'尖钉镇',x:75.8,y:37.3},
      {name:'水舟镇',x:60,y:45.4},
      {name:'草路镇',x:37.5,y:45.4},
      {name:'机擎市',x:43.9,y:53.2},
      {name:'木杆镇',x:49.8,y:84.8},
      {name:'化朗镇',x:48.6,y:91.6}
    ],
    roads:[
      {name:'10号道路',x:52.9,y:23.8},
      {name:'6号道路',x:38.8,y:37.2},
      {name:'7号道路',x:62.7,y:37},
      {name:'8号道路',x:66.5,y:34},
      {name:'9号道路',x:72.8,y:34},
      {name:'5号道路',x:48.7,y:46},
      {name:'4号道路',x:37.2,y:47.8},
      {name:'3号道路',x:31.7,y:52.2},
      {name:'2号道路',x:58.5,y:81.5},
      {name:'1号道路',x:49.1,y:88.4}
    ],
    specials:[
      {name:'对战塔',x:51.8,y:12.7},
      {name:'迷光森林',x:38.6,y:31.3},
      {name:'九路隧道',x:69.2,y:37.1},
      {name:'拳关丘陵',x:53.8,y:40.4},
      {name:'宝可梦寄放屋',x:46.8,y:45.4},
      {name:'伽勒尔矿山',x:28,y:48.6},
      {name:'逆鳞湖',x:43.5,y:40.1},
      {name:'沙尖洼地',x:52.1,y:43.7},
      {name:'巨人帽岩',x:47.6,y:41.3},
      {name:'巨人镜池',x:59.3,y:41.6},
      {name:'巨石原野',x:53.8,y:45.2},
      {name:'桥间空地',x:51.8,y:49.7},
      {name:'第二矿山',x:66.8,y:50.3},
      {name:'机擎市郊外',x:54.3,y:52.7},
      {name:'机擎河岸',x:52.3,y:56.7},
      {name:'瞭望塔旧址',x:34.9,y:60.5},
      {name:'牙牙湖',x:40.9,y:63.1},
      {name:'美纳斯湖',x:51.2,y:64.3},
      {name:'沐光森林',x:37.2,y:69.9},
      {name:'照丽草原',x:42.2,y:67.8},
      {name:'巨人凳岩',x:60.7,y:66.6},
      {name:'集汇空地',x:45.4,y:73.1},
      {name:'微寐森林',x:38.5,y:91.5},
      {name:'铠之孤岛',x:97,y:35.9},
      {name:'王冠雪原',x:50.6,y:98.2}
    ]
  },
  {
    name:'阿罗拉',
    img:'https://img.baibai.cv/f/pNj7uE/%E9%98%BF%E7%BD%97%E6%8B%89.png',
    islands:[
      {name:'美乐美乐岛',x:32.8,y:26.2,img:'https://img.baibai.cv/f/jmjdcX/%E7%BE%8E%E4%B9%90%E7%BE%8E%E4%B9%90%E5%B2%9B.png',
        towns:[
          {name:'利利小镇',x:32.9,y:27.8},
          {name:'好奥乐市',x:27.9,y:71}
        ],
        roads:[
          {name:'2号道路',x:10.2,y:46.8},
          {name:'1号道路',x:48.3,y:31.9},
          {name:'3号道路',x:41.1,y:12.9}
        ],
        specials:[
          {name:'大浪海滩',x:5,y:32.5},
          {name:'卡拉蔚湾',x:54.4,y:17.6},
          {name:'美乐美乐海',x:83.9,y:45.5},
          {name:'好奥乐墓园',x:21.2,y:51.7},
          {name:'马哈罗山路',x:29.6,y:8.6},
          {name:'十克拉山丘',x:64.1,y:46.5},
          {name:'美乐美乐花园',x:35.5,y:9.1},
          {name:'通海洞穴',x:32.4,y:14.5},
          {name:'树果园',x:5.9,y:48.1},
          {name:'葱郁洞窟',x:21.6,y:15.7},
          {name:'战争遗迹',x:30.6,y:20.9},
          {name:'海滩洞穴',x:1.6,y:48.9}
        ]
      },
      {name:'乌拉乌拉岛',x:80.6,y:68.6,img:'https://img.baibai.cv/f/3r1zhe/%E4%B9%8C%E6%8B%89%E4%B9%8C%E6%8B%89%E5%B2%9B.png',
        towns:[
          {name:'马利埃静市',x:69.6,y:25.5},
          {name:'卡璞村',x:58,y:39.4},
          {name:'魄镇',x:31.6,y:9.5}
        ],
        roads:[
          {name:'10号道路',x:52,y:17.7},
          {name:'17号道路',x:35.7,y:18.1},
          {name:'16号道路',x:28.8,y:30.4},
          {name:'15号水路',x:21.8,y:70.3},
          {name:'14号道路',x:48.2,y:81},
          {name:'13号道路',x:71.3,y:52.6},
          {name:'11号道路',x:73.9,y:33.4},
          {name:'12号道路',x:83,y:45.3}
        ],
        specials:[
          {name:'乌拉乌拉海滩',x:94.2,y:57.9},
          {name:'辉克拉尼山',x:47.7,y:18},
          {name:'拉纳基拉山',x:53,y:31.8},
          {name:'哈伊纳沙漠',x:70.4,y:46.5},
          {name:'乌拉乌拉花园',x:23.5,y:33.1},
          {name:'以太之家',x:46.1,y:68},
          {name:'辉克拉尼天文台',x:51.1,y:13.2},
          {name:'超值超市旧址',x:62.6,y:81.6},
          {name:'宝可梦联盟',x:52.6,y:26.6},
          {name:'丰收遗迹',x:68.6,y:41.3}
        ]
      },
      {name:'阿卡拉岛',x:61.5,y:30,img:'https://img.baibai.cv/f/Xm1yUd/%E9%98%BF%E5%8D%A1%E6%8B%89%E5%B2%9B.png',
        towns:[
          {name:'可霓可市',x:17,y:81},
          {name:'欧哈纳镇',x:33.7,y:32.6},
          {name:'慷待市',x:22.7,y:59.2},
          {name:'豪诺豪诺度假地',x:64,y:56.1},
          {name:'皇家大道',x:55.5,y:28.8}
        ],
        roads:[
          {name:'8号道路',x:24.2,y:3.9},
          {name:'5号道路',x:26.5,y:14.3},
          {name:'7号道路',x:59.7,y:12.5},
          {name:'4号道路',x:29.3,y:45.2},
          {name:'6号道路',x:41.9,y:35.3},
          {name:'9号道路',x:32.1,y:89.8}
        ],
        specials:[
          {name:'慷待海滩',x:16.1,y:47.8},
          {name:'豪诺豪诺海滩',x:76.1,y:59.8},
          {name:'潺潺之丘',x:14.8,y:15.8},
          {name:'维拉火山公园',x:64.2,y:18.2},
          {name:'树荫丛林',x:32.1,y:10.7},
          {name:'地鼠隧道',x:33.1,y:70.4},
          {name:'回忆之丘',x:35.9,y:88.6},
          {name:'生命遗迹',x:43.7,y:84.6},
          {name:'皮卡丘山谷',x:26.9,y:43.9},
          {name:'分隔岭隧道',x:55.1,y:7.3},
          {name:'欧哈纳牧场',x:32,y:25.3}
        ]
      },
      {name:'波尼岛',x:17.2,y:50.2,img:'https://img.baibai.cv/f/B6RYfX/%E6%B3%A2%E5%B0%BC%E5%B2%9B.png',
        towns:[
          {name:'海洋居民之村',x:39.9,y:83.8}
        ],
        roads:[],
        specials:[
          {name:'波尼险路',x:39.4,y:20.5},
          {name:'波尼海岸',x:80.9,y:30.6},
          {name:'波尼旷野',x:57.4,y:33.6},
          {name:'波尼树林',x:61.7,y:42},
          {name:'波尼鼓浪岩岸',x:77.9,y:51.3},
          {name:'波尼古道',x:54,y:52.5},
          {name:'波尼原野',x:27.6,y:63.2},
          {name:'波尼海滩',x:15.2,y:76.1},
          {name:'椰蛋树岛',x:7.1,y:93.8},
          {name:'波尼大峡谷',x:44,y:43.8},
          {name:'日轮祭坛',x:21,y:30.1},
          {name:'月轮祭坛',x:23.2,y:31.7},
          {name:'彼岸遗迹',x:79.8,y:42.6},
          {name:'波尼花园',x:74.5,y:30.8},
          {name:'旷野洞窟',x:53.3,y:26.7},
          {name:'终结洞窟',x:49.3,y:22.2},
          {name:'对战树',x:26.1,y:16.8}
        ]
      },
      {name:'以太乐园',x:44,y:45.1,img:'',
        towns:[],
        roads:[],
        specials:[]
      }
    ]
  }

];
var MAPS=pkmHudClone(MAPS_DATA);
/* ===== 地图底图缓存（IndexedDB 持久化，避免每次打开地图都重新下载） ===== */
var _mapImgBlobUrl={};
var _MAP_IMG_TTL=30*24*60*60*1000;
var _MAP_IMG_MAX_BYTES=30*1024*1024;
var _mapImgDbP=null;
function _mapImgDb(){
  if(_mapImgDbP)return _mapImgDbP;
  _mapImgDbP=new Promise(function(res,rej){
    var done=false,tm=0;
    function fin(ok,v){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);if(!ok)_mapImgDbP=null;ok?res(v):rej(v);}
    try{
      var idb=WIN.indexedDB||window.indexedDB;if(!idb){fin(false,new Error('no-idb'));return;}
      var rq=idb.open('pkm_hud_mapcache',1);
      tm=WIN.setTimeout(function(){fin(false,new Error('地图缓存 IndexedDB 打开超时'));},6000);
      rq.onupgradeneeded=function(){var db=rq.result;if(!db.objectStoreNames.contains('img'))db.createObjectStore('img');};
      rq.onblocked=function(){fin(false,new Error('地图缓存 IndexedDB 被阻塞'));};
      rq.onsuccess=function(){if(done){try{rq.result.close();}catch(e){}return;}var db=rq.result;db.onversionchange=function(){try{db.close();}catch(e){}_mapImgDbP=null;};fin(true,db);};
      rq.onerror=function(){fin(false,rq.error||new Error('idb-open'));};
    }catch(e){fin(false,e);}
  });
  return _mapImgDbP;
}
function _mapImgGet(url){
  return _mapImgDb().then(function(db){return new Promise(function(res,rej){var tx=null,done=false,tm=0;function fin(ok,v){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);ok?res(v):rej(v);}try{tx=db.transaction('img','readonly');var rq=tx.objectStore('img').get(url);tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}fin(false,new Error('地图缓存读取超时'));},6000);rq.onsuccess=function(){fin(true,rq.result||null);};rq.onerror=function(){fin(false,rq.error||new Error('地图缓存读取失败'));};tx.onabort=function(){if(!done)fin(false,tx.error||new Error('地图缓存读取中止'));};}catch(e){fin(false,e);}});});
}
function _mapImgPut(url,blob){
  return _mapImgDb().then(function(db){return new Promise(function(res,rej){var tx=null,done=false,tm=0;function fin(ok,v){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);ok?res(v):rej(v);}try{tx=db.transaction('img','readwrite');tx.objectStore('img').put({b:blob,t:Date.now()},url);tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}fin(false,new Error('地图缓存写入超时'));},6000);tx.oncomplete=function(){hudScope.setTimeout(_mapImgPrune,30);fin(true,true);};tx.onerror=function(){fin(false,tx.error||new Error('地图缓存写入失败'));};tx.onabort=function(){if(!done)fin(false,tx.error||new Error('地图缓存写入中止'));};}catch(e){fin(false,e);}});});
}
function _mapImgPrune(){
  return _mapImgDb().then(function(db){return new Promise(function(res){var rows=[],tx=null,done=false,tm=0;function fin(){if(done)return;done=true;if(tm)WIN.clearTimeout(tm);res();}try{tx=db.transaction('img','readonly');var rq=tx.objectStore('img').openCursor();tm=WIN.setTimeout(function(){try{tx.abort();}catch(e){}fin();},7000);rq.onsuccess=function(){var c=rq.result;if(!c){var total=rows.reduce(function(a,r){return a+r.size;},0);if(total<=_MAP_IMG_MAX_BYTES){fin();return;}rows.sort(function(a,b){return a.t-b.t;});var del=[];for(var i=0;i<rows.length&&total>_MAP_IMG_MAX_BYTES;i++){del.push(rows[i].key);total-=rows[i].size;}if(!del.length){fin();return;}var tx2=db.transaction('img','readwrite'),st=tx2.objectStore('img');del.forEach(function(k){st.delete(k);var u=_mapImgBlobUrl[k];if(u){try{URL.revokeObjectURL(u);}catch(e){}delete _mapImgBlobUrl[k];}});tx2.oncomplete=function(){hudDiagInc('mapCachePruned',del.length);fin();};tx2.onerror=tx2.onabort=fin;return;}var v=c.value||{};rows.push({key:c.key,size:Number(v.b&&v.b.size||0),t:Number(v.t||0)});c.continue();};rq.onerror=fin;tx.onabort=fin;}catch(e){fin();}});}).catch(function(e){hudDiagError('map cache prune',e);});
}
hudScope.cleanup(function(){Object.keys(_mapImgBlobUrl||{}).forEach(function(k){try{URL.revokeObjectURL(_mapImgBlobUrl[k]);}catch(e){}});_mapImgBlobUrl={};try{if(_mapImgDbP)_mapImgDbP.then(function(db){try{db.close();}catch(e){}});}catch(e){}_mapImgDbP=null;});
function mapImgSrc(url){
  if(!url)return '';
  return _mapImgBlobUrl[url]||url;
}
function _mapImgApply(url,blob){
  if(!url||!blob||typeof blob.size!=='number'||blob.size<1)return;
  var old=_mapImgBlobUrl[url];
  var u;
  try{u=URL.createObjectURL(blob);}catch(e){return;}
  _mapImgBlobUrl[url]=u;
  if(old){try{URL.revokeObjectURL(old);}catch(e){}}
  try{
    var els=document.querySelectorAll('.map-img[data-src]');
    for(var i=0;i<els.length;i++){
      var el=els[i];
      if(el.getAttribute('data-src')===url)el.src=u;
    }
  }catch(e){}
}
function _mapImgFetch(url){
  try{
    hudFetch(url,{mode:'cors'}).then(function(resp){
      if(!resp.ok)throw new Error('http '+resp.status);
      var ct=(resp.headers.get('content-type')||'').toLowerCase();
      if(ct.indexOf('image/')!==0)throw new Error('not-image');
      return resp.blob();
    }).then(function(blob){
      _mapImgPut(url,blob).catch(function(){});
      _mapImgApply(url,blob);
    }).catch(function(){});
  }catch(e){}
}
function _mapImgPreload(url){
  if(!url||_mapImgBlobUrl[url])return;
  _mapImgGet(url).then(function(rec){
    if(rec&&rec.b&&typeof rec.b.size==='number'&&rec.b.size>0&&(Date.now()-rec.t<_MAP_IMG_TTL)){_mapImgApply(url,rec.b);_mapImgPut(url,rec.b).catch(function(){});}
    else{_mapImgFetch(url);}
  }).catch(function(){_mapImgFetch(url);});
}
MAPS.forEach(function(m){if(m.img)_mapImgPreload(m.img);if(m.islands){m.islands.forEach(function(is){if(is.img)_mapImgPreload(is.img);});}});
var activeMap='';
var alolaIsland=-1;
var mapSpotOn=false;
var mapFilter={town:false,road:false,special:false};
var mapLabelSize=10;
var mapManualControlsOpen=false;
var mapViewerResizeObserver=null,mapViewerWindowResizeHandler=null,mapViewerVisualViewportHandler=null,mapViewerVisualViewport=null;
try{var _mls=parseInt(localStorage.getItem('pk_maplabelsize'),10);if(_mls>=6&&_mls<=24)mapLabelSize=_mls;}catch(e){}
function updateMapLabels(wrap){
  if(!wrap)return;
  var scale=wrap._mapScale||1;
  var tx=wrap._mapTx||0;
  var ty=wrap._mapTy||0;
  var stage=wrap.querySelector('.map-stage');
  var sw=(stage&&stage.offsetWidth)||wrap.clientWidth||1;
  var sh=(stage&&stage.offsetHeight)||1;
  var els=wrap.querySelectorAll('[data-x][data-y]');
  for(var i=0;i<els.length;i++){
    var el=els[i];
    var x=parseFloat(el.getAttribute('data-x'))||0;
    var y=parseFloat(el.getAttribute('data-y'))||0;
    el.style.left=(x/100*sw*scale+tx)+'px';
    el.style.top=(y/100*sh*scale+ty)+'px';
  }
  var lbls=wrap.querySelectorAll('.map-spot-label,.map-pin-label');
for(var j=0;j<lbls.length;j++){lbls[j].style.fontSize=mapLabelSize+'px';}
}
function mapAllSpots(map){
  var out=[];
  var cats=[['towns','town'],['roads','road'],['specials','special']];
  function pushList(list,cat,island){
    if(!list)return;
    for(var j=0;j<list.length;j++){
      var s=list[j];
      var o={name:s.name,x:s.x,y:s.y,cat:cat};
      if(island){o.island=island.idx;o.islandName=island.name;}
      out.push(o);
    }
  }
  if(map.islands){
    for(var i=0;i<map.islands.length;i++){
      var is=map.islands[i];
      for(var ci=0;ci<cats.length;ci++){
        pushList(is[cats[ci][0]],cats[ci][1],{idx:i,name:is.name});
      }
    }
    return out;
  }
  for(var ci2=0;ci2<cats.length;ci2++){
    pushList(map[cats[ci2][0]],cats[ci2][1],null);
  }
  return out;
}
function normLoc(s){return t2s(String(s||'').trim());}
function findSpot(map,loc){
  if(!map||!loc)return null;
  var l=normLoc(loc);
  if(!l)return null;
  var all=mapAllSpots(map);
  for(var i=0;i<all.length;i++){if(normLoc(all[i].name)===l)return all[i];}
  for(var j=0;j<all.length;j++){
    var n=normLoc(all[j].name);
    if(n&&(l.indexOf(n)>=0||n.indexOf(l)>=0))return all[j];
  }
  return null;
}
function regionOfLocation(loc){
  var s=String(loc||'').trim();
  if(!s)return '';
  var r=regionFromLocation(s);
  if(r)return r;
  var l=normLoc(s);
  var hits=[];
  for(var i=0;i<MAPS.length;i++){
    var all=mapAllSpots(MAPS[i]);
    for(var j=0;j<all.length;j++){
      if(normLoc(all[j].name)===l){hits.push(MAPS[i].name);break;}
    }
  }
  if(hits.length===1)return hits[0];
  if(!hits.length){
    var hits2=[];
    for(var i2=0;i2<MAPS.length;i2++){
      var all2=mapAllSpots(MAPS[i2]);
      for(var j2=0;j2<all2.length;j2++){
        var n=normLoc(all2[j2].name);
        if(n&&(l.indexOf(n)>=0||n.indexOf(l)>=0)){hits2.push(MAPS[i2].name);break;}
      }
    }
    if(hits2.length===1)return hits2[0];
  }
  return '';
}
function mapSpotLabelsHTML(all,curName){
  return all.map(function(sp){
    if(curName&&normLoc(sp.name)===curName)return '';
    return '<div class="map-spot-label" data-cat="'+esc(sp.cat)+'" data-x="'+sp.x+'" data-y="'+sp.y+'">'+esc(sp.name)+'</div>';
  }).join('');
}
function mapControlsHTML(){
  var filterBar='<div class="map-filter'+(mapSpotOn?' show':'')+'" data-map-filter>'+
  '<button class="map-tab'+(mapFilter.town?' active':'')+'" data-mcat="town">🏙 城镇</button>'+
  '<button class="map-tab'+(mapFilter.road?' active':'')+'" data-mcat="road">🛣 道路</button>'+
  '<button class="map-tab'+(mapFilter.special?' active':'')+'" data-mcat="special">✨ 特殊地点</button>'+
  '</div>';
  var sizeBtn='<button class="map-size-btn" data-map-size-btn>🔤 字号 '+mapLabelSize+'</button>';
  var sizePop='<div class="map-size-pop" data-map-size-pop><span class="dim">名称字号</span><input type="range" min="6" max="24" step="1" value="'+mapLabelSize+'" data-map-size><span class="dim" data-map-size-val>'+mapLabelSize+'px</span><button class="map-size-done" data-map-size-done>✓</button></div>';
  return '<div class="map-controls">'+sizeBtn+filterBar+sizePop+'</div>';
}
function mapToolbarHTML(tabs,extraRight){
  return '<div class="map-toolbar"><div class="map-tabs">'+tabs+'</div>'+(extraRight||'')+'</div>';
}
function mapManualControlsHTML(){
  return '<div class="map-manual-controls" data-map-manual-controls aria-hidden="'+(mapManualControlsOpen?'false':'true')+'">'+
    '<div class="map-dpad" aria-label="视角方向控制">'+
      '<button type="button" class="map-manual-btn" data-map-pan="up" title="视角向上移动" aria-label="视角向上移动">↑</button>'+
      '<button type="button" class="map-manual-btn" data-map-pan="left" title="视角向左移动" aria-label="视角向左移动">←</button>'+
      '<span class="map-dpad-core" aria-hidden="true"></span>'+
      '<button type="button" class="map-manual-btn" data-map-pan="right" title="视角向右移动" aria-label="视角向右移动">→</button>'+
      '<button type="button" class="map-manual-btn" data-map-pan="down" title="视角向下移动" aria-label="视角向下移动">↓</button>'+
    '</div>'+
    '<div class="map-zoom-pad" aria-label="地图缩放控制">'+
      '<button type="button" class="map-manual-btn" data-map-zoom="out" title="缩小地图" aria-label="缩小地图">−</button>'+
      '<button type="button" class="map-manual-btn" data-map-zoom="in" title="放大地图" aria-label="放大地图">＋</button>'+
    '</div>'+
  '</div>';
}
function mapViewerFrameHTML(wrapHtml){
  return '<div class="map-viewer-frame'+(mapManualControlsOpen?' manual-open':'')+'" data-map-viewer-frame>'+wrapHtml+mapManualControlsHTML()+'</div>';
}
function mapWrapHTML(v,spot,loc,pinNote){
  var all=mapAllSpots(v);
  var curName=spot?normLoc(spot.name):'';
  var spotLabels=mapSpotLabelsHTML(all,curName);
  var wrapCls='map-wrap';
  if(mapSpotOn){
    wrapCls+=' show-all';
    for(var k in mapFilter){if(mapFilter[k])wrapCls+=' show-'+k;}
  }
  if(v.img){
    var pin='';
    if(spot){
      pin='<div class="map-pin-label" data-x="'+spot.x+'" data-y="'+spot.y+'">'+esc(spot.name)+'</div><div class="map-pin" data-x="'+spot.x+'" data-y="'+spot.y+'"></div>';
    }
    var inner='<div class="'+wrapCls+'" data-mapwrap><div class="map-stage"><img class="map-img" data-src="'+esc(v.img)+'" src="'+esc(mapImgSrc(v.img))+'" draggable="false" onerror="this.style.display=\'none\'"></div><div class="map-labels">'+spotLabels+pin+'</div></div>';
    var framed=mapViewerFrameHTML(inner);
    if(!spot)framed+='<div class="map-no-loc">📍 当前位置：'+esc(loc||'未知')+(pinNote||'（本图未匹配到坐标）')+'</div>';
    return framed;
  }
  return '<div class="empty">该地图没配图片链接</div>';
}
function mapHTML(){
  if(!MAPS.length)return '<div class="map-page"><div class="empty">暂未配置地图</div></div>';
  if(!MAPS.some(function(x){return x.name===activeMap;}))activeMap=MAPS[0].name;
  var m=MAPS.filter(function(x){return x.name===activeMap;})[0]||MAPS[0];
  var loc=(stat_data.环境&&stat_data.环境.当前地点)||'';
  var locRegion=regionOfLocation(loc);
  var tabs=MAPS.map(function(x){return '<button class="map-tab'+(x.name===m.name?' active':'')+'" data-map="'+esc(x.name)+'">'+esc(x.name)+'</button>';}).join('');
  var hint='<div class="map-zoom-hint">👁 开启地点显示 · 城镇/道路/特殊地点可组合点选 · 点击「字号」弹出滑条 · 单指/鼠标拖动 · 双指/滚轮缩放 · 右上角「🎮」可展开方向/缩放按键 · 双击复位</div>';
  var eye='<button class="map-eye'+(mapSpotOn?' on':'')+'" data-map-eye title="点击显示/隐藏地点">👁</button>';

  if(m.islands){
    if(alolaIsland<0||!m.islands[alolaIsland]||!m.islands[alolaIsland].img){
      if(alolaIsland>=0)alolaIsland=-1;
      var spot=null,pinNote='';
      if(locRegion){
        if(m.name===locRegion)spot=findSpot(m,loc);
        else pinNote='（当前位置在'+esc(locRegion)+'，不在此图）';
      }else{spot=findSpot(m,loc);}
      var labels=m.islands.map(function(is,i){
        var hl=(spot&&spot.island===i);
        var cls='map-island-label'+(hl?' hl':'')+(is.img?'':' no-sub');
        var inner='<span class="il-dot"></span>'+esc(is.name)+(hl?' 📍':'');
        var tip=is.img?is.name:is.name+'（无子地图）';
        return '<div class="'+cls+'" data-island="'+i+'" data-x="'+is.x+'" data-y="'+is.y+'" title="'+esc(tip)+'">'+inner+'</div>';
      }).join('');
      var inner2='';
      if(m.img){
        inner2=mapViewerFrameHTML('<div class="map-wrap" data-mapwrap><div class="map-stage"><img class="map-img" data-src="'+esc(m.img)+'" src="'+esc(mapImgSrc(m.img))+'" draggable="false" onerror="this.style.display=\'none\'"></div><div class="map-labels">'+labels+'</div></div>');
      }else{
        inner2='<div class="empty">该地图没配图片链接</div>';
      }
      var status='';
      if(spot&&m.islands[spot.island])status='<div class="map-no-loc">📍 当前位置：'+esc(spot.name)+'（'+esc(m.islands[spot.island].name)+'）</div>';
      else if(pinNote)status='<div class="map-no-loc">📍 当前位置：'+esc(loc||'未知')+pinNote+'</div>';
      else status='<div class="map-no-loc">📍 当前位置：'+esc(loc||'未知')+'（大图未匹配到坐标）</div>';
      return '<div class="map-page">'+mapToolbarHTML(tabs,'')+inner2+status+'<div class="map-zoom-hint">👆 点击岛屿进入该岛地图 · 发光的岛屿是当前所在 · 单指/鼠标拖动 · 双指/滚轮缩放 · 右上角「🎮」可展开方向/缩放按键 · 双击复位</div></div>';
    }
    var is=m.islands[alolaIsland];
    var v={name:is.name,img:is.img,towns:is.towns||[],roads:is.roads||[],specials:is.specials||[]};
    var spot2=null,pinNote2='';
    if(locRegion){
      if(m.name===locRegion)spot2=findSpot(v,loc);
      else pinNote2='（当前位置在'+esc(locRegion)+'，不在此图）';
    }else{spot2=findSpot(v,loc);}
    var backBtn='<button class="map-back-btn" data-map-back>← 返回阿罗拉大图</button>';
    return '<div class="map-page">'+mapToolbarHTML(tabs,backBtn+eye)+mapControlsHTML()+mapWrapHTML(v,spot2,loc,pinNote2)+hint+'</div>';
  }

  var spot3=null,pinNote3='';
  if(locRegion){
    if(m.name===locRegion)spot3=findSpot(m,loc);
    else pinNote3='（当前位置在'+esc(locRegion)+'，不在此图）';
  }else{spot3=findSpot(m,loc);}
  return '<div class="map-page">'+mapToolbarHTML(tabs,eye)+mapControlsHTML()+mapWrapHTML(m,spot3,loc,pinNote3)+hint+'</div>';
}
function bindMapViewer(wrap){
  if(!wrap||wrap._mapViewerBound)return;
  var stage=wrap.querySelector('.map-stage');
  if(!stage)return;
  wrap._mapViewerBound=true;
  var fitScale=1,scale=1,tx=0,ty=0,MAX=8,fitted=false;
  function computeFit(){
    var rw=wrap.clientWidth||1,rh=wrap.clientHeight||1;
    var sw=stage.offsetWidth||1,sh=stage.offsetHeight||1;
    var f=Math.min(rw/sw,rh/sh);
    if(!isFinite(f)||f<0.02)f=1;
    if(f>1)f=1;
    return f;
  }
  function apply(){
    var rw=wrap.clientWidth||1,rh=wrap.clientHeight||1;
    var sw=(stage.offsetWidth||rw)*scale,sh=(stage.offsetHeight||rh)*scale;
    if(sw<=rw){tx=(rw-sw)/2;}else{tx=Math.min(0,Math.max(tx,rw-sw));}
    if(sh<=rh){ty=(rh-sh)/2;}else{ty=Math.min(0,Math.max(ty,rh-sh));}
    stage.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')';
    wrap._mapScale=scale;wrap._mapTx=tx;wrap._mapTy=ty;
    updateMapLabels(wrap);
  }
  function zoomAt(factor,ox,oy){
    factor=Number(factor)||1;
    var ns=Math.max(fitScale,Math.min(MAX,scale*factor));
    if(Math.abs(ns-scale)<0.0001)return;
    ox=Number.isFinite(Number(ox))?Number(ox):(wrap.clientWidth||1)/2;
    oy=Number.isFinite(Number(oy))?Number(oy):(wrap.clientHeight||1)/2;
    var k=ns/scale;
    tx=ox-(ox-tx)*k;ty=oy-(oy-ty)*k;scale=ns;apply();
  }
  function zoomBy(factor){zoomAt(factor,(wrap.clientWidth||1)/2,(wrap.clientHeight||1)/2);}
  function panBy(dx,dy){tx+=Number(dx)||0;ty+=Number(dy)||0;apply();}
  function resetView(){scale=fitScale;tx=0;ty=0;apply();}
  var pts={},panStart=null,pinchStart=null;
  function npts(){return Object.keys(pts).length;}
  function dist(a,b){var dx=a.x-b.x,dy=a.y-b.y;return Math.sqrt(dx*dx+dy*dy);}
  function pointerDown(e){
    try{wrap.setPointerCapture(e.pointerId);}catch(err){}
    pts[e.pointerId]={x:e.clientX,y:e.clientY};
    if(npts()===1){panStart={x:e.clientX,y:e.clientY,tx:tx,ty:ty};pinchStart=null;wrap.classList.add('dragging');}
    else if(npts()===2){panStart=null;var ks=Object.keys(pts);pinchStart={d:dist(pts[ks[0]],pts[ks[1]]),scale:scale};}
    if(e.cancelable)e.preventDefault();
  }
  function pointerMove(e){
    if(!pts[e.pointerId])return;
    pts[e.pointerId]={x:e.clientX,y:e.clientY};
    if(npts()===1&&panStart){tx=panStart.tx+(e.clientX-panStart.x);ty=panStart.ty+(e.clientY-panStart.y);apply();}
    else if(npts()===2&&pinchStart){
      var ks=Object.keys(pts),d=dist(pts[ks[0]],pts[ks[1]]);
      if(pinchStart.d>0){
        var ns=Math.max(fitScale,Math.min(MAX,pinchStart.scale*d/pinchStart.d));
        var mid={x:(pts[ks[0]].x+pts[ks[1]].x)/2,y:(pts[ks[0]].y+pts[ks[1]].y)/2};
        var r=wrap.getBoundingClientRect(),ox=mid.x-r.left,oy=mid.y-r.top,k=ns/scale;
        tx=ox-(ox-tx)*k;ty=oy-(oy-ty)*k;scale=ns;apply();
      }
    }
    if(e.cancelable)e.preventDefault();
  }
  function rel(e){
    delete pts[e.pointerId];
    if(npts()===0){panStart=null;pinchStart=null;wrap.classList.remove('dragging');}
    else if(npts()===1){pinchStart=null;var k0=Object.keys(pts)[0];panStart={x:pts[k0].x,y:pts[k0].y,tx:tx,ty:ty};}
  }
  if('PointerEvent' in WIN||'onpointerdown' in wrap){
    wrap.addEventListener('pointerdown',pointerDown,{passive:false});
    wrap.addEventListener('pointermove',pointerMove,{passive:false});
    wrap.addEventListener('pointerup',rel);
    wrap.addEventListener('pointercancel',rel);
    wrap.addEventListener('lostpointercapture',rel);
  }else{
    var touchPan=null,touchPinch=null;
    wrap.addEventListener('touchstart',function(e){
      var ts=e.touches||[];
      if(ts.length===1){touchPan={x:ts[0].clientX,y:ts[0].clientY,tx:tx,ty:ty};touchPinch=null;wrap.classList.add('dragging');}
      else if(ts.length>=2){touchPan=null;touchPinch={d:dist({x:ts[0].clientX,y:ts[0].clientY},{x:ts[1].clientX,y:ts[1].clientY}),scale:scale};}
      if(e.cancelable)e.preventDefault();
    },{passive:false});
    wrap.addEventListener('touchmove',function(e){
      var ts=e.touches||[];
      if(ts.length===1&&touchPan){tx=touchPan.tx+(ts[0].clientX-touchPan.x);ty=touchPan.ty+(ts[0].clientY-touchPan.y);apply();}
      else if(ts.length>=2&&touchPinch&&touchPinch.d>0){
        var a={x:ts[0].clientX,y:ts[0].clientY},b={x:ts[1].clientX,y:ts[1].clientY},d=dist(a,b),ns=Math.max(fitScale,Math.min(MAX,touchPinch.scale*d/touchPinch.d));
        var r=wrap.getBoundingClientRect(),ox=(a.x+b.x)/2-r.left,oy=(a.y+b.y)/2-r.top,k=ns/scale;
        tx=ox-(ox-tx)*k;ty=oy-(oy-ty)*k;scale=ns;apply();
      }
      if(e.cancelable)e.preventDefault();
    },{passive:false});
    function touchEnd(e){if(!(e.touches&&e.touches.length)){touchPan=null;touchPinch=null;wrap.classList.remove('dragging');}}
    wrap.addEventListener('touchend',touchEnd);wrap.addEventListener('touchcancel',touchEnd);
  }
  wrap.addEventListener('wheel',function(e){
    e.preventDefault();
    var r=wrap.getBoundingClientRect();
    zoomAt(e.deltaY<0?1.15:1/1.15,e.clientX-r.left,e.clientY-r.top);
  },{passive:false});
  wrap.addEventListener('dblclick',function(e){if(e)e.preventDefault();resetView();});
  var mapImgEl=wrap.querySelector('.map-img');
  /* v1.8.1：按真实图片比例 + visualViewport 尺寸自适应；手机竖/横屏均完整居中，不裁剪。 */
  function fitMap(reset){
    var vp=vpSize(),compact=Math.min(vp.w,vp.h)<=600;
    var page=wrap.closest('.page');
    var maxW=Math.min(Math.floor(vp.w*(compact?0.92:0.94)),compact?760:900);
    var availW=maxW-8;if(availW<120)availW=120;
    var availH=Math.floor(vp.h*(compact?0.90:0.82));
    if(page){
      var pr=page.getBoundingClientRect(),wr=wrap.getBoundingClientRect();
      var hint=page.querySelector('.map-zoom-hint'),noLoc=page.querySelector('.map-no-loc');
      var manual=page.querySelector('[data-map-manual-controls]');
      var above=Math.max(0,wr.top-pr.top);
      var below=(hint?hint.offsetHeight:0)+(noLoc?noLoc.offsetHeight:0)+((manual&&mapManualControlsOpen)?manual.offsetHeight:0)+(compact?20:34);
      availH=Math.floor(vp.h*(compact?0.90:0.82))-above-below;
      if(availH<(compact?140:120))availH=compact?140:120;
    }
    var nw=mapImgEl&&mapImgEl.naturalWidth||0,nh=mapImgEl&&mapImgEl.naturalHeight||0;
    var imgW=availW,imgH=Math.round(availW*0.75);
    if(nw>0&&nh>0){var ar=nw/nh;imgH=Math.round(availW/ar);if(imgH>availH){imgH=availH;imgW=Math.round(imgH*ar);}if(imgW<40)imgW=40;if(imgH<40)imgH=40;}
    else if(imgH>availH)imgH=availH;
    wrap.style.width=imgW+'px';wrap.style.height=imgH+'px';wrap.style.margin='0 auto';
    var frame=wrap.closest('[data-map-viewer-frame]');if(frame){frame.style.width=imgW+'px';frame.style.maxWidth='100%';}
    fitScale=computeFit();
    if(!fitted||reset===true){scale=fitScale;tx=0;ty=0;fitted=true;}
    else{scale=Math.max(fitScale,Math.min(MAX,scale));}
    apply();
  }
  wrap._mapApi={panBy:panBy,zoomBy:zoomBy,reset:resetView,refit:function(reset){fitMap(reset===true);},getState:function(){return {scale:scale,fitScale:fitScale,tx:tx,ty:ty};}};
  if(mapImgEl){if(mapImgEl.complete&&mapImgEl.naturalWidth)fitMap(true);mapImgEl.addEventListener('load',function(){fitMap(true);});}
  fitMap(true);
  var _fitT=null;
  function _scheduleFit(){if(_fitT)return;_fitT=hudScope.setTimeout(function(){_fitT=null;try{hudSyncMapPopoutHeight();}catch(_e){}if(wrap&&wrap.isConnected!==false)fitMap(false);},100);}
  try{
    if(mapViewerResizeObserver){try{mapViewerResizeObserver.disconnect();}catch(e){}}
    var RO=(typeof ResizeObserver!=='undefined')?ResizeObserver:null;
    if(RO){var _ro=new RO(_scheduleFit),_pg=wrap.closest('.page');if(_pg)_ro.observe(_pg);mapViewerResizeObserver=_ro;hudScope.cleanup(function(){try{if(mapViewerResizeObserver===_ro){_ro.disconnect();mapViewerResizeObserver=null;}}catch(e){}});}
  }catch(e){}
  try{
    if(mapViewerWindowResizeHandler)WIN.removeEventListener('resize',mapViewerWindowResizeHandler);
    mapViewerWindowResizeHandler=_scheduleFit;WIN.addEventListener('resize',_scheduleFit);
    hudScope.cleanup(function(){try{if(mapViewerWindowResizeHandler===_scheduleFit){WIN.removeEventListener('resize',_scheduleFit);mapViewerWindowResizeHandler=null;}}catch(e){}});
  }catch(e2){}
  try{
    var vv=WIN.visualViewport||window.visualViewport;
    if(mapViewerVisualViewport&&mapViewerVisualViewportHandler){try{mapViewerVisualViewport.removeEventListener('resize',mapViewerVisualViewportHandler);}catch(e){}}
    if(vv&&vv.addEventListener){mapViewerVisualViewport=vv;mapViewerVisualViewportHandler=_scheduleFit;vv.addEventListener('resize',_scheduleFit);hudScope.cleanup(function(){try{if(mapViewerVisualViewport===vv&&mapViewerVisualViewportHandler===_scheduleFit){vv.removeEventListener('resize',_scheduleFit);mapViewerVisualViewport=null;mapViewerVisualViewportHandler=null;}}catch(e){}});}
  }catch(e3){}
}


var activeBox='1';var nearbyOpen=false;var foldState={};function foldHTML(key,label,fn){var open=!!foldState[key];return '<div class="fold-box"><div class="fold-head" data-fold="'+key+'"><span>'+label+'</span><span class="fold-arrow">'+(open?'▾':'▸')+'</span></div>'+(open?'<div class="fold-body">'+fn()+'</div>':'')+'</div>';}function bagPlainHTML(){var tabs=bagCategories().map(function(c){return '<button class="bag-tab'+(c.key===activeBag?' active':'')+'" data-bag="'+c.key+'">'+c.label+'</button>';}).join('');return '<div class="fold-inner"><div class="bag-tabs">'+tabs+'</div><div class="bag-list" id="bag-list">'+bagItemsHTML()+'</div></div>';}function relPlainHTML(){var rel=stat_data.人际关系||{};var ks=Object.keys(rel);if(!ks.length)return '<div class="fold-inner"><div class="empty">暂无</div></div>';return '<div class="fold-inner">'+ks.map(function(k){var val=rel[k];var score=(typeof val==='object'&&val)?num(val.好感度,0):(typeof val==='number'?val:0);return '<div class="rel-item"><span class="rel-name">'+esc(k)+'</span><div class="rel-bar"><div class="rel-fill" style="width:'+Math.max(0,Math.min(100,score))+'%"></div></div><span class="rel-val">'+score+'</span></div>';}).join('')+'</div>';}
function quickHTML(){var Q=[['box','q-box','https://media.52poke.com/wiki/d/dd/Bag_%E5%AE%9D%E5%8F%AF%E6%A2%A6%E7%9B%92_Sprite.png','盒子'],['pokedex','q-pokedex','https://media.52poke.com/wiki/2/2d/%E5%AF%B6%E5%8F%AF%E5%A4%A2%E5%9C%96%E9%91%91_LPLE.png','图鉴'],['breeding','q-breeding','https://media.52poke.com/wiki/1/1e/Spr_6x_Egg.png','繁育'],['typechart','q-typechart','⚡','克制表'],['map','q-map','🗺️','地图']];return '<div class="quick-bar">'+Q.map(function(q){var sz=getIconSize(q[1]);var ic=q[2].indexOf('http')===0?'<img src="'+esc(q[2])+'" style="width:'+sz+'px;height:'+sz+'px;object-fit:contain;image-rendering:pixelated">':'<span class="quick-emoji" style="font-size:'+sz+'px">'+q[2]+'</span>';return '<span class="menu-item quick-chip" data-page="'+q[0]+'">'+ic+q[3]+'</span>';}).join('')+'</div>';}function homeFoldHTML(){return foldHTML('bagfold','<span style="display:inline-flex;align-items:center;gap:4px"><img src="https://img.baibai.cv/f/3o2qte/1788188339193.png" style="width:20px;height:20px;object-fit:contain;image-rendering:pixelated">背包</span>',bagPlainHTML)+foldHTML('relfold','💬 人际关系',relPlainHTML);}function boxHTML(){var box=stat_data.盒子||{};var keys=Object.keys(box);if(!keys.length)return frame('<span>盒子</span><button class="btn-small" data-box-new style="display:inline-block;vertical-align:middle;margin-left:6px;padding:2px 7px;font-size:.7rem;line-height:1.3">＋ 新建盒子</button>','<div class="empty">这里是空的</div>');if(!box[activeBox])activeBox=keys[0];var sel='<select class="box-select" id="box-select" style="float:left;margin-bottom:5px;min-width:0;width:auto;max-width:100%">'+keys.map(function(k){return '<option value="'+esc(k)+'"'+(k===activeBox?' selected':'')+'>'+esc(String(k).replace(/^盒子/,''))+'</option>';}).join('')+'</select>';var pokemons=box[activeBox]||{};var entries=Object.keys(pokemons).filter(function(s){var p=pokemons[s];return p&&p.名字&&p.名字!=='空';}).map(function(s){return{slot:s,data:pokemons[s]};});var cells=entries.length?entries.map(function(e){var p=e.data;var img=pkImgHTML(p.名字,p.图标,p.是否闪光,'box-icon');return '<div class="box-cell" data-box="'+esc(activeBox)+'" data-slot="'+esc(e.slot)+'">'+img+'<div class="box-name">'+esc(p.昵称||p.名字)+'</div></div>';}).join(''):'<div class="empty">这里是空的</div>';return frame('<span>盒子</span><button class="btn-small" data-box-new style="display:inline-block;vertical-align:middle;margin-left:6px;padding:2px 7px;font-size:.7rem;line-height:1.3">＋ 新建盒子</button><button class="btn-small" data-box-del style="display:inline-block;vertical-align:middle;margin-left:4px;padding:2px 7px;font-size:.7rem;line-height:1.3;background:rgba(150,50,50,.65);border-color:#c06060">删除盒子</button>',sel+'<div class="box-grid">'+cells+'</div>');}

function tasksHTML(){var t=stat_data.任务||{},html='';if(t.主线)html+='<div class="task-item"><span class="task-tag main">主线</span><div class="task-text">'+esc(t.主线)+'</div></div>';if(t.传说)html+='<div class="task-item"><span class="task-tag legend">传说</span><div class="task-text">'+esc(t.传说)+'</div></div>';if(t.支线)html+='<div class="task-item"><span class="task-tag random">支线</span><div class="task-text">'+esc(t.支线).split(/[；;\n]/).join('<br>')+'</br></div></div>';if(!html)html='<div class="empty">暂无任务</div>';return frameP('任务',html);}
function worldHTML(){var w=stat_data.世界事件||{},html='';function ln(v){return esc(String(v||'')).split(/[；;]/).join('<br>');}if(w.附近遭遇)html+='<div class="event-item"><span class="event-type">📍 附近遭遇</span><p>'+ln(w.附近遭遇)+'</p></div>';if(w.地区新闻)html+='<div class="event-item"><span class="event-type">📰 地区新闻</span><p>'+ln(w.地区新闻)+'</p></div>';if(w.区域动态)html+='<div class="event-item"><span class="event-type">🌍 区域动态</span><p>'+ln(w.区域动态)+'</p></div>';if(!html)html='<div class="empty">暂无世界事件</div>';return '<div class="info-frame world-frame plain-frame"><div class="info-inner"><div class="info-title">世界动态</div>'+html+'</div></div>';}
function relHTML(){var rel=stat_data.人际关系||{};var entries=Object.entries(rel);if(!entries.length)return frame('人际关系','<div class="empty">暂无</div>');var html=entries.map(function(kv){var val=kv[1];var score=(typeof val==='object'&&val)?num(val.好感度,0):(typeof val==='number'?val:0);return '<div class="rel-item"><span class="rel-name">'+esc(kv[0])+'</span><div class="rel-bar"><div class="rel-fill" style="width:'+Math.max(0,Math.min(100,score))+'%"></div></div><span class="rel-val">'+score+'</span></div>';}).join('');return frame('人际关系',html);}
function rivalsHTML(){var r=stat_data.劲敌||{};var entries=Object.entries(r);if(!entries.length)return frameP('劲敌','<div class="empty">尚未遭遇劲敌</div>');var html=entries.map(function(kv){return '<div class="nearby-item" style="cursor:default"><div class="nearby-info"><div class="nearby-name">'+esc(kv[0])+'</div><div class="nearby-sub">'+esc(kv[1])+'</div></div></div>';}).join('');return frameP('劲敌',html);}
function breedingHTML(){var b=stat_data.繁育||{};return frame('繁育',infoRow('蛋',esc(b.蛋||'无蛋'))+infoRow('剩余步数',num(b.剩余步数,0)+'步')+infoRow('存放',esc(b.存放||'-')));}
function sideOf(k){if(k.indexOf('敌方')>=0)return 'foe';if(k.indexOf('友方')>=0)return 'ally';if(k.indexOf('中立')>=0)return 'neu';return 'self';}function btCard(k,v){var side=sideOf(k),segs=String(v||'').split(/[｜|]/),nm=String(k).replace(/[（(](我方|友方|中立|敌方)[)）]/,'').trim(),tr='',pk=nm,di=nm.indexOf('·');if(di>0){tr=nm.slice(0,di);pk=nm.slice(di+1);}var lv='',hpc=0,hpm=0,rest=[];for(var i=0;i<segs.length;i++){var s=segs[i].trim();if(!s)continue;if(i===0){var lm=s.match(/Lv\.?\s*(\d+)/i);if(lm)lv=lm[1];var hm=s.match(/(\d+)\s*\/\s*(\d+)/);if(hm){hpc=parseInt(hm[1],10);hpm=parseInt(hm[2],10);}continue;}if(s.indexOf('阶级')===0){var bd=s.replace(/^阶级[：:\s]*/,'').trim();if(bd&&bd!=='无')rest.push('<div class="bt-line"><span class="bt-k">阶级</span>'+esc(bd).replace(/([+\-])(\d)/g,function(a,g,n){return '<b class="'+(g==='-'?'st-dn':'st-up')+'">'+g+n+'</b>';})+'</div>');continue;}if(s.indexOf('状态')===0){var stx=s.replace(/^状态[：:\s]*/,'').trim();if(stx&&stx!=='无')rest.push('<div class="bt-line"><span class="bt-k">状态</span>'+stx.split(/[,，、\/]/).map(function(x){return statusTag(x.trim());}).join(' ')+'</div>');continue;}rest.push('<div class="bt-line">'+esc(s)+'</div>');}var pct=hpm>0?Math.max(0,Math.min(100,hpc/hpm*100)):0;var hc=pct>=50?'hp-high':pct>=20?'hp-mid':'hp-low';var fnt=(hpm>0&&hpc<=0)?'<span class="ailment fnt">圈圈眼</span>':'';return '<div class="bt-card '+side+'"><div class="bt-head"><span class="bt-pk">'+esc(pk)+fnt+'</span>'+(lv?'<span class="bt-lv">Lv.'+esc(lv)+'</span>':'')+'</div>'+(tr?'<div class="bt-tr">'+esc(tr)+'</div>':'')+(hpm>0?'<div class="bt-hp"><div class="hp-bar"><div class="hp-fill '+hc+'" style="width:'+pct+'%"></div></div><span class="bt-hpn">'+hpc+'/'+hpm+'</span></div>':'')+rest.join('')+'</div>';}function battleHTML(){var b=stat_data.战场||{},html='';function ln(v){return esc(String(v||'')).split(/[｜|]/).join('<br>');}var f=b.场上||{},fk=Object.keys(f),s=b.各方||{},sk=Object.keys(s);if(b.规则)html+='<div class="bt-rule">'+ln(b.规则)+'</div>';if(b.场景)html+='<div class="bt-scene">'+ln(b.场景)+'</div>';if(fk.length)html+='<div class="bt-grid">'+fk.map(function(k){return btCard(k,f[k]);}).join('')+'</div>';if(sk.length)html+=sk.map(function(k){return '<div class="bt-side"><div class="bt-side-h">📋 '+esc(k)+'</div><div class="bt-side-b">'+ln(s[k])+'</div></div>';}).join('');if(!html)return '<div class="bt-empty">当前没有正在进行的战斗</div>';return '<div class="info-frame battle-frame"><div class="info-inner"><div class="info-title">战场</div><div class="battle-list">'+html+'</div></div></div>';}

function ivsHTML(s){if(!s)return '<span class="dim">-</span>';return '<div class="ivs">'+String(s).split(',').map(function(x){return '<span class="iv">'+esc(x.trim())+'</span>';}).join('')+'</div>';}
function movesHTML(s){if(!s)return '<span class="dim">-</span>';return '<div class="moves">'+String(s).split(/[,，/、]/).map(function(x){var p=x.split(':');var name=p[0]||'',type=p[1]||'',cat=p[2]||'';var color=TYPE_COLORS[type]||'#888';return '<div class="move-cell" style="border-color:'+color+';background:'+color+'22;cursor:pointer" data-move="'+esc(name)+'" data-mvtype="'+esc(type)+'" data-mvcat="'+esc(cat)+'"><div class="move-name">'+esc(name)+'</div><div class="move-meta"><span class="move-type" style="background:'+color+'">'+esc(type)+'</span><span class="move-cat">'+esc(cat)+'</span></div></div>';}).join('')+'</div>';}
var moveCache={},moveLoading={},moveBackStack=[],preloadQueue=[],preloadTimer=null;
function pushBack(){try{if(overlay)moveBackStack.push(overlay.innerHTML);}catch(e){}}
function popBack(){return (moveBackStack&&moveBackStack.length)?moveBackStack.pop():'';}
function clearBack(){moveBackStack=[];}
function cleanText(s){
  return String(s||'')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,'')
    .replace(/<ref[^/>]*\/>/g,'')
    .replace(/\{\{[^}]*\}\}/g,'')
    .replace(/\u005B\u005B(?:[^\u005D|]*\|)?([^\u005D]*)\u005D\u005D/g,'$1')
    .replace(/'{2,}/g,'')
    .replace(/\n+/g,' ')
    .trim();
}
function effectText(move,tpl,param){
  var p=(param||'').split('|');
  var one=p[0].trim();
  switch(tpl){
    case '能力降低':return '令目标的'+one+'降低'+(p[1]?p[1].trim():'1')+'级';
    case '能力提升':return '令使用者的'+one+'提升'+(p[1]?p[1].trim():'1')+'级';
    case '麻痹':return move+'有'+one+'%的几率使目标陷入麻痹状态';
    case '灼伤':return move+'有'+one+'%的几率使目标灼伤';
    case '中毒':return move+'有'+one+'%的几率使目标中毒';
    case '睡眠':return move+'有'+one+'%的几率使目标睡眠';
    case '冰冻':return move+'有'+one+'%的几率使目标冰冻';
    case '混乱':return move+'有'+one+'%的几率使目标混乱';
    case '畏缩':return move+'有'+one+'%的几率使目标畏缩';
    case '反作用力伤害':return one?'使用者受到1/'+one+'的反作用力伤害':'使用者受到反作用力伤害';
    case '解冻':return '解除冰冻';
    case '必中':return '必定命中';
    default:return tpl+(one?'（'+one+'）':'');
  }
}
function renderEffect(s,name){
  var out=[];
  var lines=String(s||'').split('\n');
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(!line)continue;
    line=line.replace(/\{\{\s*HP\s*\}\}/gi,'ＨＰ').replace(/\{\{\s*PP\s*\}\}/gi,'PP').replace(/\{\{\s*(?:a|s|m|tt|game2|game)\s*\|([^}|]+)(?:\|[^}]*)?\}\}/gi,function(all,txt){return txt.trim();});
    var re=/\{\{招式效果\/([^|}\/]+)(?:\|([^}]*))?\}\}/g;
    var lastIdx=0,m,seg='';
    while((m=re.exec(line))!==null){
      seg+=line.slice(lastIdx,m.index);
      seg+=effectText(name,m[1],m[2]||'');
      lastIdx=m.index+m[0].length;
    }
    seg+=line.slice(lastIdx);
    seg=seg.replace(/\{\{[^}]*\}\}/g,'');
    seg=seg.replace(/\u005B\u005B(?:[^\u005D|]*\|)?([^\u005D]*)\u005D\u005D/g,'$1');
    seg=seg.replace(/'{2,}/g,'').trim();
    if(seg)out.push(seg);
  }
  return out.join('\n');
}
function descFromWiki(wt){
  var vals=[];
  var re=/\{\{\s*动画招式\s*\|[^}]*?gen=([^|}\n]+)/g,m;
  while((m=re.exec(wt))!==null){vals.push(m[1].trim());}
  if(!vals.length)return '';
  var counts={},best=vals[0],bestN=0;
  for(var i=0;i<vals.length;i++){
    counts[vals[i]]=(counts[vals[i]]||0)+1;
    if(counts[vals[i]]>bestN){bestN=counts[vals[i]];best=vals[i];}
  }
  return best;
}
function descFromHtml(doc){
  var hs=doc.querySelectorAll('h2');
  for(var i=0;i<hs.length;i++){
    var h=hs[i];
    if(h.textContent.trim().indexOf('招式说明')!==0)continue;
    var wrap=h;
    var p=h.parentElement;
    if(p&&String(p.className||'').indexOf('mw-heading')>=0)wrap=p;
    var node=wrap.nextElementSibling;
    var flavors=[];
    while(node){
      var tag=node.tagName?node.tagName.toLowerCase():'';
      if(tag==='h2')break;
      if(node.querySelector&&node.querySelector('h2'))break;
      if(tag==='table'){
        var cells=node.querySelectorAll('td,th');
        for(var c=0;c<cells.length;c++){
          var t=(cells[c].innerText||cells[c].textContent||'').trim();
          if(t.indexOf('。')>=0&&t.length>=6)flavors.push(t);
        }
      }else{
        var t2=(node.innerText||node.textContent||'').trim();
        if(t2.indexOf('。')>=0&&t2.length>=6)flavors.push(t2);
      }
      node=node.nextElementSibling;
    }
    if(flavors.length){
  var good=[];
  for(var g=0;g<flavors.length;g++){
    if(flavors[g].indexOf('无法使用这个招式')<0)good.push(flavors[g]);
  }
  if(!good.length)good=flavors;
  var counts={},best=good[0],bestN=0;
  for(var k=0;k<good.length;k++){
    counts[good[k]]=(counts[good[k]]||0)+1;
    if(counts[good[k]]>bestN){bestN=counts[good[k]];best=good[k];}
  }
  return best;
}
    return '';
  }
  return '';
}
function effFromHtml(doc){
  var hs=doc.querySelectorAll('h2');
  for(var i=0;i<hs.length;i++){
    var h=hs[i];
    var ht=(h.textContent||'').trim();
    if(ht.indexOf('招式附加效果')!==0 && ht.indexOf('附加效果')!==0)continue;
    var wrap=h;
    var p=h.parentElement;
    if(p&&String(p.className||'').indexOf('mw-heading')>=0)wrap=p;
    var node=wrap.nextElementSibling,parts=[];
    while(node){
      var tag=node.tagName?node.tagName.toLowerCase():'';
      if(tag==='h2')break;
      if(node.querySelector&&node.querySelector('h2'))break;
      if(tag==='table'){
        node.querySelectorAll('tr').forEach(function(tr){
          var cells=[];
          tr.querySelectorAll('th,td').forEach(function(td){cells.push((td.innerText||td.textContent||'').replace(/\s+/g,' ').trim());});
          if(cells.length)parts.push(cells.join('：'));
        });
      }else{
        var t=(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim();
        if(t)parts.push(t);
      }
      node=node.nextElementSibling;
    }
    return parts.join('\n');
  }
  return '';
}
function parseMove(wt,html){
  var d={power:'',acc:'',type:'',cat:'',desc:'',eff:''};
function grab(re){var m=wt.match(re);return m?m[1].trim():'';}
d.power=cleanText(grab(/\|power=([^\n|]+)/));
d.acc=cleanText(grab(/\|accuracy=([^\n|]+)/));
d.type=cleanText(grab(/\|type=([^\n|]+)/)||grab(/\|属性=([^\n|]+)/));
d.cat=cleanText(grab(/\|damagecategory=([^\n|]+)/)||grab(/\|分类=([^\n|]+)/));
  var name=grab(/\|name=([^\n|]+)/);
  if(html){
    var doc=new DOMParser().parseFromString(html,'text/html');
    d.desc=descFromHtml(doc);
    d.eff=effFromHtml(doc);
  }
  if(!d.eff){
    var em=wt.match(/==\s*招式附加效果\s*==\n([\s\S]*?)(?=\n==[^=]|$)/);
    if(em)d.eff=renderEffect(em[1],name);
  }
  if(!d.desc)d.desc=descFromWiki(wt);
  return d;
}
function fetchMove(name,cb){
  if(!name){cb&&cb(null);return;}
  var _diy=diyGet('move',name);
  if(_diy){cb&&cb(_diy);return;}
  if(moveCache[name]&&moveCache[name].type!==undefined){cb&&cb(moveCache[name]);return;}
  var _c=lsGet('pk_mv_'+name,null);if(_c&&_c.type!==undefined){moveCache[name]=_c;cb&&cb(_c);return;}
  if(moveLoading[name]){moveLoading[name].push(cb);return;}
  moveLoading[name]=[];
  if(cb)moveLoading[name].push(cb);
  function done(d){
    moveCache[name]=d||null;
    if(d&&d.type){lsSet('pk_mv_'+name,d);}
    var cbs=moveLoading[name]||[];
    moveLoading[name]=null;
    for(var i=0;i<cbs.length;i++){try{cbs[i](d);}catch(e){}}
  }
  function parsePage(page,onFail){
    hudFetch('https://wiki.52poke.com/api.php?action=parse&page='+encodeURIComponent(page)+'&format=json&prop=text|wikitext&variant=zh-hans&origin=*')
      .then(function(r){return r.ok?r.json():Promise.reject();})
      .then(function(j){
        if(!j||!j.parse){onFail();return;}
        var wt=(j.parse.wikitext&&j.parse.wikitext['*'])?j.parse.wikitext['*']:'';
        var html=(j.parse.text&&j.parse.text['*'])?j.parse.text['*']:'';
        var d=(wt||html)?parseMove(wt,html):null;
        if(d&&d.type){done(d);}else{onFail();}
      })
      .catch(onFail);
  }
  function searchThen(){
    hudFetch('https://wiki.52poke.com/api.php?action=query&list=search&srsearch='+encodeURIComponent(t2s(name)+' 招式')+'&srnamespace=0&srlimit=3&format=json&origin=*')
      .then(function(r){return r.json();})
      .then(function(j){
        var rs=(j&&j.query&&j.query.search)||[];
        if(rs[0]){parsePage(rs[0].title,function(){done(null);});}
        else{done(null);}
      })
      .catch(function(){done(null);});
  }
  parsePage(name+'（招式）',searchThen);
}
function preloadMoves(skills){
  if(!skills)return;
  String(skills).split(/[,，/、]/).forEach(function(x){
    var p=x.split(':');
    var name=p[0]||'';
    if(name&&!moveCache[name]&&!moveLoading[name]&&preloadQueue.indexOf(name)<0)preloadQueue.push(name);
  });
  if(!preloadTimer){
    preloadTimer=hudScope.setInterval(function(){
      if(!preloadQueue.length){hudScope.clearInterval(preloadTimer);preloadTimer=null;return;}
      var name=preloadQueue.shift();
      if(name&&!moveCache[name]&&!moveLoading[name])fetchMove(name);
    },300);
  }
}
function showMoveInfo(name,type,cat){
  function rows(d){
    var t=(d&&d.type)?d.type:type;
    var c=(d&&d.cat)?d.cat:cat;
    var out='';
    if(d&&d.power)out+='<div class="row"><span class="k">威力</span><span class="v">'+esc(d.power)+'</span></div>';
    if(d&&d.acc)out+='<div class="row"><span class="k">命中</span><span class="v">'+esc(d.acc)+'</span></div>';
    out+='<div class="row"><span class="k">属性</span><span class="v">'+esc(t||'-')+'</span></div>';
    out+='<div class="row"><span class="k">分类</span><span class="v">'+esc(c||'-')+'</span></div>';
    if(d&&d.desc)out+='<div class="row block"><span class="k">描述</span><span class="v">'+esc(d.desc).replace(/\n/g,'<br>')+'</span></div>';
    if(d&&d.eff)out+='<div class="row block"><span class="k">详细效果</span><span class="v">'+esc(d.eff).replace(/\n/g,'<br>')+'</span></div>';
    return out;
  }
  pushBack();
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">'+esc(name)+'</div><button class="close" data-move-back>✕</button></div><div class="modal-body" id="move-body">'+rows(null)+(name?'<div class="empty">技能数据加载中...</div>':'')+'</div></div>';
  overlay.classList.add('open');
  if(!name)return;
  fetchMove(name,function(d){
    var b=document.querySelector('#move-body');
    if(!b)return;
    b.innerHTML=rows(d)+(d?'':'<div class="empty">技能数据获取失败</div>');
  });
}
var dexCache=null,dexLoading=false,dexCbs=[];
function parseDex(wt){
  var list=[],seen={};
  var re=/\{\{\s*Rdexe\s*\|\s*(\d+)\s*\|\s*([^|]+)/g,m;
  while((m=re.exec(wt))!==null){
    var id=('000'+m[1].trim()).slice(-4);
    var name=m[2].trim();
    if(seen[id]){
      if(name.indexOf('（')<0&&seen[id].indexOf('（')>=0){
        for(var i=0;i<list.length;i++){if(list[i].id===id){list[i].name=name;seen[id]=name;break;}}
      }
      continue;
    }
    seen[id]=name;
    list.push({id:id,name:name});
  }
  return list;
}
function fetchDex(cb){
  if(dexCache){cb&&cb(dexCache);return;}
  var _d=lsGet('pk_dexlist',null);if(_d&&_d.length){dexCache=_d;cb&&cb(dexCache);return;}
  if(dexLoading){cb&&dexCbs.push(cb);return;}
  dexLoading=true;
  var url='https://wiki.52poke.com/api.php?action=parse&page='+encodeURIComponent('宝可梦列表（按全国图鉴编号）/简单版')+'&format=json&prop=wikitext&origin=*';
  hudFetch(url)
    .then(function(r){return r.ok?r.json():Promise.reject();})
    .then(function(j){
      var wt=(j&&j.parse&&j.parse.wikitext)?j.parse.wikitext['*']:'';
      var list=wt?parseDex(wt):null;
      dexCache=list;dexLoading=false;
      if(list&&list.length){lsSet('pk_dexlist',list);}
      var cbs=dexCbs;dexCbs=[];
      for(var i=0;i<cbs.length;i++){try{cbs[i](list);}catch(e){}}
      if(cb)cb(list);
    })
    .catch(function(){dexLoading=false;var cbs=dexCbs;dexCbs=[];for(var i=0;i<cbs.length;i++){try{cbs[i](null);}catch(e){}}if(cb)cb(null);});
}
function renderDexGrid(list,cSet,sSet,owned){
  var g=document.getElementById('pokedex-grid');
  if(!g)return;
  var t=document.getElementById('dex-total');
  if(!list){g.innerHTML='<div class="empty">图鉴数据加载失败</div>';if(t)t.textContent='—';return;}
  if(t)t.textContent=list.length;
  var html='';
  list.forEach(function(p){
    var id=p.id||'',ndex=p.ndex||id,name=p.name||'';
var bn=name.split('（')[0].split('(')[0].trim();
var caught=devUnlocked()||hitSpecies(owned,bn);
var seen=!caught&&hitSpecies(sSet,bn);
var known=caught||seen;
var cls=caught?'caught':(seen?'seen':'unknown');
var label=known?name:'？？？';
var attr=known?' data-name="'+esc(bn)+'"':' data-noclick="1"';
html+='<div class="dex-cell '+cls+'" data-id="'+esc(ndex)+'" data-rdex="'+esc(id)+'"'+attr+'><span class="dex-no">#'+esc(id)+'</span><span class="dex-name">'+esc(label)+'</span></div>';
  });
  g.innerHTML=html;
}
var dexTimer=null;
function dexSearch(){
  hudScope.clearTimeout(dexTimer);
  dexTimer=hudScope.setTimeout(function(){
  var q=document.getElementById('dex-search-input');
  var v=q?q.value.trim():'';
  var cells=document.querySelectorAll('#pokedex-grid .dex-cell');
  for(var i=0;i<cells.length;i++){
    var c=cells[i];
    if(!v){c.style.display='';continue;}
    var nm=c.getAttribute('data-name')||'';
var id=c.getAttribute('data-id')||'';
var rd=c.getAttribute('data-rdex')||'';
if(nm&&(nm.indexOf(v)>=0||id.indexOf(v)>=0||rd.indexOf(v)>=0)){
      c.style.display='';
    }else{
      c.style.display='none';
    }
  }
  },150);
}
var REGIONAL_DEX={'关都':'宝可梦列表（按关都图鉴编号）','城都':'宝可梦列表（按城都图鉴编号）','丰缘':'宝可梦列表（按丰缘图鉴编号）','神奥':'宝可梦列表（按神奥图鉴编号）','合众':'宝可梦列表（按新合众图鉴编号）','卡洛斯':'宝可梦列表（按卡洛斯图鉴编号）','阿罗拉':'宝可梦列表（按新阿罗拉图鉴编号）','伽勒尔':'宝可梦列表（按伽勒尔图鉴编号）','铠岛':'宝可梦列表（按铠岛图鉴编号）','王冠雪原':'宝可梦列表（按王冠雪原图鉴编号）','帕底亚':'宝可梦列表（按帕底亚图鉴编号）','北上乡':'宝可梦列表（按北上图鉴编号）','蓝莓学院':'宝可梦列表（按蓝莓图鉴编号）'};
var LOC_REGION={
  '关都':'关都','城都':'城都','丰缘':'丰缘','神奥':'神奥','合众':'合众','卡洛斯':'卡洛斯','阿罗拉':'阿罗拉','伽勒尔':'伽勒尔','铠岛':'铠岛','铠之孤岛':'铠岛','王冠雪原':'王冠雪原','冠之雪原':'王冠雪原','帕底亚':'帕底亚','北上乡':'北上乡','北上':'北上乡','蓝莓学院':'蓝莓学院','蓝莓学园':'蓝莓学院',
  '深灰市':'关都','尼比市':'关都','华蓝市':'关都','枯叶市':'关都','玉虹市':'关都','彩虹市':'关都','浅红市':'关都','金黄市':'关都','黄金市':'关都','红莲镇':'关都','红莲岛':'关都','常青市':'关都','常磐市':'关都','真新镇':'关都','紫苑镇':'关都','月见山':'关都','华蓝洞窟':'关都',
  '桔梗市':'城都','桧皮镇':'城都','满金市':'城都','圆珠市':'城都','湛蓝市':'城都','浅葱市':'城都','卡吉镇':'城都','烟墨市':'城都','若叶镇':'城都',
  '卡那兹市':'丰缘','武斗镇':'丰缘','紫堇市':'丰缘','釜炎镇':'丰缘','橙华市':'丰缘','茵郁市':'丰缘','绿岭市':'丰缘','琉璃市':'丰缘','未白镇':'丰缘',
  '黑金市':'神奥','百代市':'神奥','帷幕市':'神奥','野原市':'神奥','家缘市':'神奥','水脉市':'神奥','雪峰市':'神奥','滨海市':'神奥','双叶镇':'神奥','真砂镇':'神奥','祝庆市':'神奥','神和镇':'神奥','花苑镇':'神奥','随意镇':'神奥',
  '三曜市':'合众','七宝市':'合众','立涌市':'合众','飞云市':'合众','雷文市':'合众','帆巴市':'合众','吹寄市':'合众','雪花市':'合众','双龙市':'合众','青海波市':'合众','鹿子镇':'合众',
  '白檀市':'卡洛斯','遥香市':'卡洛斯','娑罗市':'卡洛斯','比翼市':'卡洛斯','香薰市':'卡洛斯','百刻市':'卡洛斯','映雪市':'卡洛斯','朝香镇':'卡洛斯',
  '好奥乐市':'阿罗拉','利利小镇':'阿罗拉','美乐美乐岛':'阿罗拉','阿卡拉岛':'阿罗拉','乌拉乌拉岛':'阿罗拉','波尼岛':'阿罗拉',
  '草路镇':'伽勒尔','水舟镇':'伽勒尔','机擎市':'伽勒尔','溯传镇':'伽勒尔','舞姿镇':'伽勒尔','战竞镇':'伽勒尔','尖钉镇':'伽勒尔','拳关市':'伽勒尔','化朗镇':'伽勒尔',
  '圆模镇':'帕底亚','深钵镇':'帕底亚','玻瓶市':'帕底亚','酿光市':'帕底亚','锦汇市':'帕底亚','霜抹山':'帕底亚','冰柜镇':'帕底亚','焙固镇':'帕底亚','小匙镇':'帕底亚'
};
function regionFromLocation(loc){
  var s=t2s(String(loc||'').trim());
  if(!s)return '';
  if(LOC_REGION[s])return LOC_REGION[s];
  /* 当前地点格式为 "地区-地点-场所"（如"关都-真新镇 - 大木研究所"），
     优先直接取最前一段定地区，不再依赖地点名反推 */
  var head=String(s).split(/[-－—|｜]/)[0];
  if(head){head=head.trim();}
  if(head&&head!==s){
    if(LOC_REGION[head])return LOC_REGION[head];
    var hh=t2s(head);
    for(var k0 in LOC_REGION){if(t2s(k0)===hh)return LOC_REGION[k0];}
  }
  var sfx=['地区','地方','市','镇','岛','村','町','山','冻土','原野','湿地','海岸','山麓','洞窟','遗迹','森林','道路'];
  var key=s;
  for(var i=0;i<sfx.length;i++){
    if(key.length>sfx[i].length&&key.slice(-sfx[i].length)===sfx[i]){key=key.slice(0,-sfx[i].length);break;}
  }
  for(var k in LOC_REGION){var kk=t2s(k);if(kk===key)return LOC_REGION[k];}
  for(var k2 in LOC_REGION){if(s.indexOf(k2)>=0)return LOC_REGION[k2];}
  return '';
}
var dexRegion='全国';
var dexRegionCache={};
function parseRegionalDex(wt){
  var list=[],seen={};
  var typeSet={};
  for(var ti=0;ti<TYPE_LIST.length;ti++){typeSet[TYPE_LIST[ti]]=1;}
  var re=/\{\{\s*rdex(?:\/[A-Za-z]+)?\s*\|([^{}]+)\}\}/gi,m;
  while((m=re.exec(wt))!==null){
    var body=m[1].replace(/\u005B\u005B(?:[^\u005D|]*\|)?([^\u005D]*)\u005D\u005D/g,'$1');
    var parts=body.split('|'),nums=[],name='';
    for(var i=0;i<parts.length;i++){
      var p=t2s(String(parts[i]).trim());
      if(/^\d+$/.test(p)){nums.push(p);continue;}
      if(!name&&p&&p.indexOf('形态')!==0&&!typeSet[p]&&!/^[A-Za-z]/.test(p)){name=p;}
    }
    var id=nums[0]||'',ndex=nums[nums.length-1]||id;
    if(id&&name&&!seen[id+'|'+name]){seen[id+'|'+name]=1;list.push({id:id,ndex:ndex,name:name});}
  }
  return list;
}
function fetchRegionalDex(region,cb){
  var page=REGIONAL_DEX[region];
  if(!page){cb&&cb(null);return;}
  hudFetch('https://wiki.52poke.com/api.php?action=parse&page='+encodeURIComponent(page)+'&format=json&prop=wikitext&variant=zh-hans&origin=*')
    .then(function(r){return r.ok?r.json():Promise.reject();})
    .then(function(j){
      var wt=(j&&j.parse&&j.parse.wikitext)?j.parse.wikitext['*']:'';
      var list=wt?parseRegionalDex(wt):null;
      if(list&&list.length)cb&&cb(list);else cb&&cb(null);
    })
    .catch(function(){cb&&cb(null);});
}
function loadDexList(region,cb){
  if(region==='全国'){
    if(dexCache){cb&&cb(dexCache);return;}
    fetchDex(cb);return;
  }
  var cached=dexRegionCache[region]||lsGet('pk_dexlist4_'+region,null);
if(cached&&cached.length){dexRegionCache[region]=cached;cb&&cb(cached);return;}
fetchRegionalDex(region,function(list){
  if(list&&list.length){dexRegionCache[region]=list;lsSet('pk_dexlist4_'+region,list);}
  cb&&cb(list);
});
}
function dexRegionTabsHTML(){
  var regs=['全国'].concat(Object.keys(REGIONAL_DEX));
  return '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px" id="dex-region-tabs">'+regs.map(function(r){return '<button class="badge-tab'+(dexRegion===r?' active':'')+'" data-dexregion="'+esc(r)+'">'+esc(r)+'</button>';}).join('')+'</div>';
}
function dexCountHTML(list,owned,sSet){
  if(!list)return '<div class="dex-count">加载失败</div>';
  var caught=0,seenC=0;
  list.forEach(function(p){
    var bn=p.name.split('（')[0].split('(')[0].trim();
    if(devUnlocked()||hitSpecies(owned,bn))caught++;
    else if(hitSpecies(sSet,bn))seenC++;
  });
  if(devUnlocked())return '<div class="dex-count">✨ 已解锁全部图鉴 · 总数 '+list.length+'</div>';
  return '<div class="dex-count">捕捉 '+caught+' · 见过 '+seenC+' · 总数 '+list.length+'</div>';
}
function renderDexRegion(){
  var owned=ownedSpecies(),sSet=loadSeen();
  var c=document.getElementById('dex-count');
  if(c)c.innerHTML='<div class="dex-count">加载中…</div>';
  loadDexList(dexRegion,function(list){
    renderDexGrid(list,null,sSet,owned);
    var c2=document.getElementById('dex-count');
    if(c2)c2.innerHTML=dexCountHTML(list,owned,sSet);
  });
}
function pokedexHTML(){
  var html=frame('图鉴',dexRegionTabsHTML()+'<div class="dex-search"><input id="dex-search-input" placeholder="搜索宝可梦名或编号" autocomplete="off"></div><div id="dex-count"><div class="dex-count">加载中…</div></div><div class="pokedex" id="pokedex-grid"><div class="empty">图鉴加载中...</div></div>');
  hudScope.setTimeout(function(){renderDexRegion();},0);
  return html;
}
var pkmCache={},pkmLoading={};
function formKeyOf(nm,region){
  if(region)return region;
  var s=t2s(nm).replace(/超級/g,'超级').replace(/超極巨/g,'超极巨').replace(/Ｘ/g,'X').replace(/Ｙ/g,'Y').replace(/Ｚ/g,'Z').toUpperCase();
  if(s.indexOf('MEGA')>=0||s.indexOf('超级')>=0){
    if(s.indexOf('X')>=0)return 'mega-x';
    if(s.indexOf('Y')>=0)return 'mega-y';
    if(s.indexOf('Z')>=0)return 'mega-z';
    return 'mega';
  }
  if(s.indexOf('原始')>=0)return 'primal';
  if(s.indexOf('超极巨')>=0)return 'gmax';
  if(s.indexOf('小智')>=0||s.indexOf('牵绊')>=0)return 'ash';
  if(s.indexOf('黄昏之鬃')>=0)return 'dusk';
  if(s.indexOf('拂晓之翼')>=0)return 'dawn';
  if(s.indexOf('究极')>=0)return 'ultra';
  if(s.indexOf('起源')>=0)return 'origin';
  if(s.indexOf('天空')>=0)return 'sky';
  if(s.indexOf('完全体')>=0)return 'complete';
  if(s.indexOf('10%')>=0)return '10';
  if(s.indexOf('50%')>=0)return '50';
  if(s.indexOf('攻击形态')>=0)return 'attack';
  if(s.indexOf('防御形态')>=0)return 'defense';
  if(s.indexOf('速度形态')>=0)return 'speed';
  if(s.indexOf('暗黑')>=0)return 'black';
  if(s.indexOf('焰白')>=0)return 'white';
  if(s.indexOf('剑之王')>=0)return 'crowned-sword';
  if(s.indexOf('盾之王')>=0)return 'crowned-shield';
  if(s.indexOf('骑白马')>=0)return 'ice';
  if(s.indexOf('骑黑马')>=0)return 'shadow';
  if(s.indexOf('灵兽')>=0)return 'therian';
  if(s.indexOf('达摩')>=0)return 'zen';
  if(s.indexOf('鱼群')>=0)return 'school';
  if(s.indexOf('现形')>=0)return 'busted';
  if(s.indexOf('血月')>=0)return 'bloodmoon';
  if(s.indexOf('星晶')>=0)return 'stellar';
  if(s.indexOf('500年前')>=0||s.indexOf('古老')>=0)return 'original';
  if(s.indexOf('全能')>=0)return 'hero';
  return '';
}
function parsePkmn(wt){
  var d={name:'',enname:'',species:'',ndex:'',egg1:'',egg2:'',catchrate:'',forms:[]};
  var m=wt.match(/\{\{\s*[^{}\n]*信息框[\s\S]*?\n\}\}/);
  if(!m)return d;
  var box=m[0];
  function g(key){var r=box.match(new RegExp('\\|'+key+'=([^|\\n]+)'));return r?r[1].trim():'';}
  function g0(key){var r=box.match(new RegExp('\\|'+key+'=([^\\n]*)'));return r?r[1].trim():null;}
  var bms=[];
var bmre=/\{\{\s*种族值\s*[\s\S]*?\n\}\}/g;
var bmm;
while((bmm=bmre.exec(wt))!==null){bms.push(bmm[0]);}
function gs2(key,src){var r=src?src.match(new RegExp('\\|'+key+'=([0-9]+)')):null;return r?r[1]:'';}
function statsOf(src){return {hp:gs2('HP',src),atk:gs2('攻击',src),def:gs2('防御',src),spa:gs2('特攻',src),spd:gs2('特防',src),spe:gs2('速度',src)};}
var bs=bms.length?statsOf(bms[0]):{hp:'',atk:'',def:'',spa:'',spd:'',spe:''};
  d.name=g('name');d.enname=g('enname');d.species=g('species');
  d.ndex=g('ndex');
  d.egg1=g('egggroup1');d.egg2=g('egggroup2');
  d.catchrate=g('catchrate');
  d.forms.push({name:t2s(d.name),label:'普通',region:'',type1:g('type1'),type2:g('type2'),ability1:t2s(g('ability1')),ability2:t2s(g('ability2')),abilityd:t2s(g('abilityd')),height:g('height'),weight:g('weight'),stats:bs});
  var n=2;
  while(true){
    var t1=g('type1-'+n);
    var nm=g('form'+n)||'';
    if(!t1&&!nm)break;
    var region='';
    if(nm.indexOf('阿罗拉')>=0||nm.indexOf('阿羅拉')>=0)region='alola';
    else if(nm.indexOf('伽勒尔')>=0||nm.indexOf('伽勒爾')>=0)region='galar';
    else if(nm.indexOf('洗翠')>=0)region='hisui';
    else if(nm.indexOf('帕底亚')>=0||nm.indexOf('帕底亞')>=0)region='paldea';
    var lb=region==='alola'?'阿罗拉的样子':region==='galar'?'伽勒尔的样子':region==='hisui'?'洗翠的样子':region==='paldea'?'帕底亚的样子':nm||('形态'+n);
    var t1v=g0('type1-'+n);if(t1v===null)t1v=g('type1');
    var t2v=g0('type2-'+n);if(t2v===null)t2v=g('type2');
    var a1v=g0('ability1-'+n);if(a1v===null)a1v=g('ability1');
    d.forms.push({name:t2s(nm),label:lb,region:region,formKey:formKeyOf(nm,region),type1:t1v,type2:t2v,ability1:t2s(a1v),ability2:t2s(g('ability2-'+n)),abilityd:t2s(g('abilityd'+n)),height:g('height'+n)||g('height'),weight:g('weight'+n)||g('weight'),stats:bms[n-1]?statsOf(bms[n-1]):bs});
    n++;
  }
  return d;
}
function fetchPokemon(name,cb){
  if(!name){cb&&cb(null);return;}
  var key=name;
  if(pkmCache[key]){cb&&cb(pkmCache[key]);return;}
  var _c2=lsGet('pk_pm_'+key,null);if(_c2){pkmCache[key]=_c2;cb&&cb(pkmCache[key]);return;}
  if(pkmLoading[key]){pkmLoading[key].push(cb);return;}
  pkmLoading[key]=[];
  if(cb)pkmLoading[key].push(cb);
  function done(d){
    pkmCache[key]=d||null;
    if(d){lsSet('pk_pm_'+key,d);}
    var cbs=pkmLoading[key]||[];
    pkmLoading[key]=null;
    for(var i=0;i<cbs.length;i++){try{cbs[i](d);}catch(e){}}
  }
  function parsePage(title,onFail){
    hudFetch('https://wiki.52poke.com/api.php?action=parse&page='+encodeURIComponent(title)+'&format=json&prop=wikitext&variant=zh-hans&origin=*')
      .then(function(r){return r.ok?r.json():Promise.reject();})
      .then(function(j){
        var wt=(j&&j.parse&&j.parse.wikitext)?j.parse.wikitext['*']:'';
        var d2=wt?parsePkmn(wt):null;
        if(d2&&d2.name){done(d2);}else{onFail();}
      })
      .catch(onFail);
  }
  function searchThen(){
    hudFetch('https://wiki.52poke.com/api.php?action=query&list=search&srsearch='+encodeURIComponent(t2s(key))+'&srnamespace=0&srlimit=6&format=json&origin=*')
      .then(function(r){return r.json();})
      .then(function(j){
        var rs=(j&&j.query&&j.query.search)||[];
        var i=0;
        function tryNext(){
          if(i>=rs.length){done(null);return;}
          parsePage(rs[i++].title,tryNext);
        }
        tryNext();
      })
      .catch(function(){done(null);});
  }
  parsePage(t2s(key),searchThen);
}
var curPkm=null,curPkmForm=0,curPkmForms=[],curPkmShiny=false,curPkmNdex=0;
var formIdCache={};
function fetchFormId(enname,region,cb){
  var key=String(enname||'').toLowerCase()+'-'+region;
  if(formIdCache[key]){cb&&cb(formIdCache[key]);return;}
  var _f=lsGet('pk_fid_'+key,'');if(_f){formIdCache[key]=_f;cb&&cb(_f);return;}
  hudFetch('https://pokeapi.co/api/v2/pokemon-form/'+key)
    .then(function(r){return r.ok?r.json():Promise.reject();})
    .then(function(j){
      var m=String((j&&j.pokemon&&j.pokemon.url)||'').match(/\/(\d+)\/?$/);
      var id=m?m[1]:'';
      formIdCache[key]=id;
      if(id){lsSet('pk_fid_'+key,id);}
      cb&&cb(id);
    })
    .catch(function(){formIdCache[key]='';cb&&cb('');});
}
function pkmPreviewFallback(el){
  var cur=String(el.getAttribute('src')||'');
  if(!cur){el.style.display='none';return;}
  if(cur.indexOf('media.52poke.com')>=0){
    var fn=cur.split('/').pop();
    if(fn){el.src='https://wiki.52poke.com/wiki/Special:FilePath/'+fn;return;}
  }
  el.style.display='none';
}
var pkmLvValue=50;
function bindPkmSlider(el){
  if(!el)return;
  var min=0,max=100;
  pkmLvValue=parseInt(el.getAttribute('data-val'),10)||50;
  var fill=el.querySelector('.pkm-fill');
  var thumb=el.querySelector('.pkm-thumb');
  function paint(){
    var pct=Math.max(0,Math.min(100,(pkmLvValue-min)/(max-min)*100));
    if(fill)fill.style.width=pct+'%';
    if(thumb)thumb.style.left='calc('+pct+'% - 9px)';
  }
  function setFromClientX(cx){
    var r=el.getBoundingClientRect();
    if(r.width<=0)return;
    var pct=Math.max(0,Math.min(1,(cx-r.left)/r.width));
    var v=Math.round(min+pct*(max-min));
    if(v!==pkmLvValue){pkmLvValue=v;el.setAttribute('data-val',String(v));paint();updatePkmStats();}
  }
  paint();
  el._pkmDrag=false;
  el.addEventListener('pointerdown',function(e){el._pkmDrag=true;try{el.setPointerCapture(e.pointerId);}catch(err){}setFromClientX(e.clientX);e.preventDefault();});
  el.addEventListener('pointermove',function(e){if(el._pkmDrag)setFromClientX(e.clientX);});
  el.addEventListener('pointerup',function(){el._pkmDrag=false;});
  el.addEventListener('pointercancel',function(){el._pkmDrag=false;});
}
var pkmStatsRaf=0;
function updatePkmStats(){
  if(pkmStatsRaf)return;
  pkmStatsRaf=requestAnimationFrame(function(){pkmStatsRaf=0;updatePkmStatsNow();});
}
function updatePkmStatsNow(){
  var d=curPkm;if(!d)return;
  var list=curPkmForms&&curPkmForms.length?curPkmForms:d.forms;
  var f=list[curPkmForm]||list[0]||{};
  if(!f||!f.stats)return;
  var lvEl=document.getElementById('pkm-lv');
  var stEl=document.getElementById('pkm-stats');
  var numEl=document.getElementById('pkm-lv-num');
  if(!lvEl||!stEl)return;
  var lv=parseInt(pkmLvValue,10)||0;
  if(numEl)numEl.textContent=lv+'级';
  var isShed=(curPkmNdex===292)||(f.name&&f.name.indexOf('脱壳忍者')>=0)||(d.name&&d.name.indexOf('脱壳忍者')>=0);
  function range(b,isHp){
    var bb=parseInt(b,10);if(isNaN(bb))return '—~—';
    var mn=Math.floor((2*bb)*lv/100)+(isHp?lv+10:5);
    var mx=Math.floor((2*bb+31+63)*lv/100)+(isHp?lv+10:5);
    if(!isHp){mn=Math.floor(mn*0.9);mx=Math.floor(mx*1.1);}
    return mn+'~'+mx;
  }
  var rows=[['HP',f.stats.hp,1],['物攻',f.stats.atk,0],['物防',f.stats.def,0],['特攻',f.stats.spa,0],['特防',f.stats.spd,0],['速度',f.stats.spe,0]];
  var key=curPkmNdex+'|'+curPkmForm;
  if(stEl.getAttribute('data-stats-key')!==key){
    var h='',total=0;
    for(var i=0;i<rows.length;i++){
      var b=parseInt(rows[i][1],10);
      if(isNaN(b))continue;
      total+=b;
      h+='<div style="display:flex;justify-content:space-between;gap:8px"><span>'+rows[i][0]+' '+b+'</span><span data-st="'+i+'"></span></div>';
    }
    h+='<div style="margin-top:4px;font-weight:800"><span>总和 '+total+'</span></div>';
    stEl.innerHTML=h;
    stEl.setAttribute('data-stats-key',key);
  }
  for(var j=0;j<rows.length;j++){
    var cell=stEl.querySelector('[data-st="'+j+'"]');
    if(!cell)continue;
    var bb=parseInt(rows[j][1],10);
    if(isNaN(bb)){cell.textContent='—~—';continue;}
    cell.textContent=(j===0&&isShed)?'1':range(bb,rows[j][2]);
  }
}
function renderPkmForm(idx){
  var d=curPkm;if(!d)return;
  curPkmForm=idx;
  var list=curPkmForms&&curPkmForms.length?curPkmForms:d.forms;
  var f=list[idx]||list[0]||{};
  var btns=document.querySelectorAll('#pkm-formbar .pkm-form-btn');
  for(var i=0;i<btns.length;i++){btns[i].classList.toggle('active',i===idx);}
  var big=document.getElementById('pkm-big');
if(big){
  var url=pickHomeImg(idx,curPkmShiny);
  var tag='<span class="pkm-shiny-tag'+(curPkmShiny?'':' off')+'">'+(curPkmShiny?'✦ 闪光':'普通')+'</span>';
  big.innerHTML=url?('<img class="pkm-big-img" src="'+url+'">'+tag):'<div class="dim">图片加载中…</div>';
  var imgEl=big.querySelector('img.pkm-big-img');
  if(imgEl){imgEl.addEventListener('error',function(){pkmPreviewFallback(imgEl);});}
}
  var b=document.getElementById('pkm-body');
  if(b){
    var out='';
    if(d.species)out+='<div class="row"><span class="k">分类</span><span class="v">'+esc(d.species)+'</span></div>';
    var types='';
    if(f.type1)types+=typeChipHTML(f.type1);
    if(f.type2)types+=typeChipHTML(f.type2);
    if(types)out+='<div class="row"><span class="k">属性</span><div class="types">'+types+'</div></div>';
    var abis=[];
    if(f.ability1)abis.push(f.ability1);
    if(f.ability2)abis.push(f.ability2);
    if(abis.length||f.abilityd){
      var abi='';
      for(var ai=0;ai<abis.length;ai++){abi+='<span class="abi-link" data-ability="'+esc(abis[ai])+'">'+esc(abis[ai])+'</span> ';}
      if(f.abilityd)abi+='<span class="dim">隐藏:</span><span class="abi-link" data-ability="'+esc(f.abilityd)+'">'+esc(f.abilityd)+'</span>';
      out+='<div class="row"><span class="k">特性</span><span class="v">'+abi+'</span></div>';
    }
    if(f.stats&&(f.stats.hp||f.stats.atk||f.stats.def||f.stats.spa||f.stats.spd||f.stats.spe)){out+='<div class="row block"><span class="k">种族值</span><span class="v" style="width:100%"><div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span class="dim" style="font-size:.72rem">等级</span><div id="pkm-lv" data-val="50" style="flex:1;position:relative;height:24px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer"><div class="pkm-rail" style="position:absolute;left:0;right:0;top:50%;height:4px;margin-top:-2px;background:rgba(0,0,0,.72);border-radius:999px;box-shadow:inset 0 1px 2px rgba(0,0,0,.6)"></div><div class="pkm-fill" style="position:absolute;left:0;top:50%;height:4px;margin-top:-2px;width:50%;background:linear-gradient(180deg,#7cc4f8,#4a9dd8);border-radius:999px"></div><div class="pkm-thumb" style="position:absolute;top:50%;left:calc(50% - 9px);width:18px;height:18px;margin-top:-9px;background:#fff;border:2px solid #7cc4f8;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div></div><span id="pkm-lv-num" style="font-size:.8rem;font-weight:800">50级</span></div><div id="pkm-stats" style="font-size:.82rem;line-height:1.6"></div></span></div>';}
    if(d.ndex)out+='<div class="row"><span class="k">全国图鉴</span><span class="v">#'+esc(d.ndex)+'</span></div>';
    var nd=parseInt(d.ndex,10)||0;
    if(nd>0)out+='<div class="row"><span class="k">叫声</span><span class="v"><button class="btn-small" data-cry="'+nd+'">🔊 播放</button></span></div>';
    if(f.height)out+='<div class="row"><span class="k">身高</span><span class="v">'+esc(f.height)+' m</span></div>';
    if(f.weight)out+='<div class="row"><span class="k">体重</span><span class="v">'+esc(f.weight)+' kg</span></div>';
    if(d.egg1||d.egg2)out+='<div class="row"><span class="k">蛋组</span><span class="v">'+esc(d.egg1)+(d.egg2?' / '+esc(d.egg2):'')+'</span></div>';
    if(d.catchrate){
      var rate=parseInt(d.catchrate,10);
      var ratePct=(!isNaN(rate)&&rate>0)?(rate/7.65).toFixed(1)+'%':'—';
      out+='<div class="row"><span class="k">捕获率</span><span class="v">'+ratePct+'</span></div>';
    }
    b.innerHTML=out||'<div class="empty">没有数据</div>';var lv=document.getElementById('pkm-lv');if(lv){bindPkmSlider(lv);}updatePkmStats();
  }
}
var HOME_CODE_OVERRIDE={'超级喷火龙X':'MX','超级喷火龙Y':'MY','超极巨化喷火龙':'GM','超级路卡利欧':'M','超级路卡利欧Z':'MZ','水井面具':'W','火灶面具':'H','础石面具':'C'};
function dexStr(n){var s=String(n);while(s.length<3)s='0'+s;return s;}
function md5(str){
  function safeAdd(x,y){var lsw=(x&0xFFFF)+(y&0xFFFF);var msw=(x>>16)+(y>>16)+(lsw>>16);return (msw<<16)|(lsw&0xFFFF);}
  function bitRol(num,cnt){return (num<<cnt)|(num>>>(32-cnt));}
  function md5cmn(q,a,b,x,s,t){return safeAdd(bitRol(safeAdd(safeAdd(a,q),safeAdd(x,t)),s),b);}
  function md5ff(a,b,c,d,x,s,t){return md5cmn((b&c)|(~b&d),a,b,x,s,t);}
  function md5gg(a,b,c,d,x,s,t){return md5cmn((b&d)|(c&~d),a,b,x,s,t);}
  function md5hh(a,b,c,d,x,s,t){return md5cmn(b^c^d,a,b,x,s,t);}
  function md5ii(a,b,c,d,x,s,t){return md5cmn(c^(b|~d),a,b,x,s,t);}
  function binl2hex(binarray){var hexTab='0123456789abcdef';var out='';for(var i=0;i<binarray.length*4;i++){out+=hexTab.charAt((binarray[i>>2]>>((i%4)*8+4))&0xF)+hexTab.charAt((binarray[i>>2]>>((i%4)*8))&0xF);}return out;}
  function str2binl(s){var bin=[];var mask=(1<<8)-1;for(var i=0;i<s.length*8;i+=8){bin[i>>5]|=(s.charCodeAt(i/8)&mask)<<(i%32);}return bin;}
  function coreMD5(x,len){
    x[len>>5]|=0x80<<((len)%32);
    x[(((len+64)>>>9)<<4)+14]=len;
    var a=1732584193,b=-271733879,c=-1732584194,d=271733878;
    for(var i=0;i<x.length;i+=16){
      var olda=a,oldb=b,oldc=c,oldd=d;
      a=md5ff(a,b,c,d,x[i+0],7,-680876936);d=md5ff(d,a,b,c,x[i+1],12,-389564586);c=md5ff(c,d,a,b,x[i+2],17,606105819);b=md5ff(b,c,d,a,x[i+3],22,-1044525330);
      a=md5ff(a,b,c,d,x[i+4],7,-176418897);d=md5ff(d,a,b,c,x[i+5],12,1200080426);c=md5ff(c,d,a,b,x[i+6],17,-1473231341);b=md5ff(b,c,d,a,x[i+7],22,-45705983);
      a=md5ff(a,b,c,d,x[i+8],7,1770035416);d=md5ff(d,a,b,c,x[i+9],12,-1958414417);c=md5ff(c,d,a,b,x[i+10],17,-42063);b=md5ff(b,c,d,a,x[i+11],22,-1990404162);
      a=md5ff(a,b,c,d,x[i+12],7,1804603682);d=md5ff(d,a,b,c,x[i+13],12,-40341101);c=md5ff(c,d,a,b,x[i+14],17,-1502002290);b=md5ff(b,c,d,a,x[i+15],22,1236535329);
      a=md5gg(a,b,c,d,x[i+1],5,-165796510);d=md5gg(d,a,b,c,x[i+6],9,-1069501632);c=md5gg(c,d,a,b,x[i+11],14,643717713);b=md5gg(b,c,d,a,x[i+0],20,-373897302);
      a=md5gg(a,b,c,d,x[i+5],5,-701558691);d=md5gg(d,a,b,c,x[i+10],9,38016083);c=md5gg(c,d,a,b,x[i+15],14,-660478335);b=md5gg(b,c,d,a,x[i+4],20,-405537848);
      a=md5gg(a,b,c,d,x[i+9],5,568446438);d=md5gg(d,a,b,c,x[i+14],9,-1019803690);c=md5gg(c,d,a,b,x[i+3],14,-187363961);b=md5gg(b,c,d,a,x[i+8],20,1163531501);
      a=md5gg(a,b,c,d,x[i+13],5,-1444681467);d=md5gg(d,a,b,c,x[i+2],9,-51403784);c=md5gg(c,d,a,b,x[i+7],14,1735328473);b=md5gg(b,c,d,a,x[i+12],20,-1926607734);
      a=md5hh(a,b,c,d,x[i+5],4,-378558);d=md5hh(d,a,b,c,x[i+8],11,-2022574463);c=md5hh(c,d,a,b,x[i+11],16,1839030562);b=md5hh(b,c,d,a,x[i+14],23,-35309556);
      a=md5hh(a,b,c,d,x[i+1],4,-1530992060);d=md5hh(d,a,b,c,x[i+4],11,1272893353);c=md5hh(c,d,a,b,x[i+7],16,-155497632);b=md5hh(b,c,d,a,x[i+10],23,-1094730640);
      a=md5hh(a,b,c,d,x[i+13],4,681279174);d=md5hh(d,a,b,c,x[i+0],11,-358537222);c=md5hh(c,d,a,b,x[i+3],16,-722521979);b=md5hh(b,c,d,a,x[i+6],23,76029189);
      a=md5hh(a,b,c,d,x[i+9],4,-640364487);d=md5hh(d,a,b,c,x[i+12],11,-421815835);c=md5hh(c,d,a,b,x[i+15],16,530742520);b=md5hh(b,c,d,a,x[i+2],23,-995338651);
      a=md5ii(a,b,c,d,x[i+0],6,-198630844);d=md5ii(d,a,b,c,x[i+7],10,1126891415);c=md5ii(c,d,a,b,x[i+14],15,-1416354905);b=md5ii(b,c,d,a,x[i+5],21,-57434055);
      a=md5ii(a,b,c,d,x[i+12],6,1700485571);d=md5ii(d,a,b,c,x[i+3],10,-1894986606);c=md5ii(c,d,a,b,x[i+10],15,-1051523);b=md5ii(b,c,d,a,x[i+1],21,-2054922799);
      a=md5ii(a,b,c,d,x[i+8],6,1873313359);d=md5ii(d,a,b,c,x[i+15],10,-30611744);c=md5ii(c,d,a,b,x[i+6],15,-1560198380);b=md5ii(b,c,d,a,x[i+13],21,1309151649);
      a=md5ii(a,b,c,d,x[i+4],6,-145523070);d=md5ii(d,a,b,c,x[i+11],10,-1120210379);c=md5ii(c,d,a,b,x[i+2],15,718787259);b=md5ii(b,c,d,a,x[i+9],21,-343485551);
      a=safeAdd(a,olda);b=safeAdd(b,oldb);c=safeAdd(c,oldc);d=safeAdd(d,oldd);
    }
    return [a,b,c,d];
  }
  return binl2hex(coreMD5(str2binl(str),str.length*8));
}
function homeImgUrl(ndex,code,shiny){
  var fn='HOME_'+dexStr(ndex)+(code||'')+(shiny?'_s':'')+'.png';
  var h=md5(fn);
  return 'https://media.52poke.com/wiki/'+h.charAt(0)+'/'+h.substr(0,2)+'/'+fn;
}
var HOME_FORM_KEY={'mega-x':'MX','mega-y':'MY','mega-z':'MZ','mega':'M','gmax':'GM','primal':'P','ash':'A','dusk':'DM','dawn':'DW','ultra':'U','origin':'O','sky':'S','complete':'C','10':'T','50':'','attack':'A','defense':'D','speed':'S','black':'B','white':'W','crowned-sword':'C','crowned-shield':'C','ice':'I','shadow':'S','therian':'T','zen':'Z','school':'Sc','busted':'B','bloodmoon':'B','stellar':'S','hero':'H','alola':'A','galar':'G','hisui':'H','paldea':'P'};
function homeFormCode(f){
  if(!f)return '';
  var fk=f.formKey||'';
  var lb=f.label||'';
  var nm=(f.name||'')+' '+(f.label||'');
  if(HOME_CODE_OVERRIDE[lb])return HOME_CODE_OVERRIDE[lb];
  if(fk==='galar'&&nm.indexOf('达摩')>=0&&nm.indexOf('模式')>=0)return 'GZ';
  if(HOME_FORM_KEY[fk]!==undefined)return HOME_FORM_KEY[fk];
  if(nm.indexOf('水井')>=0)return 'W';
  if(nm.indexOf('火灶')>=0)return 'H';
  if(nm.indexOf('础石')>=0)return 'C';
  if(nm.indexOf('连击流')>=0)return 'R';
  if(nm.indexOf('觉悟')>=0)return 'R';
  if(nm.indexOf('太晶')>=0)return 'T';
  if(nm.indexOf('橙花')>=0)return 'O';
  if(nm.indexOf('蓝花')>=0)return 'B';
  if(nm.indexOf('白花')>=0)return 'W';
  if(nm.indexOf('黄花')>=0)return 'Y';
  return '';
}
function pickHomeImg(idx,shiny){
  var d=curPkm;
  var f=null;
  if(d){var forms=curPkmForms&&curPkmForms.length?curPkmForms:d.forms;f=forms[idx]||forms[0];}
  var nd=curPkmNdex||(d?parseInt(d.ndex,10):0)||0;
  if(!nd)return '';
  return homeImgUrl(nd,homeFormCode(f),shiny);
}
var pokeStatsCache={};
function pokeStatsFromList(list){
  if(!list||!list.length)return null;
  var o={},has=false;
  for(var i=0;i<list.length;i++){
    var s=list[i];var n=s&&s.stat&&s.stat.name;var v=(s&&s.base_stat!=null)?s.base_stat:null;
    if(n==='hp'){o.hp=v;has=true;}else if(n==='attack'){o.atk=v;has=true;}else if(n==='defense'){o.def=v;has=true;}else if(n==='special-attack'){o.spa=v;has=true;}else if(n==='special-defense'){o.spd=v;has=true;}else if(n==='speed'){o.spe=v;has=true;}
  }
  return has?o:null;
}
function pokeGet(urls,cb){
  var i=0;
  function next(){
    if(i>=urls.length){cb(null);return;}
    var u=urls[i++];
    if(pokeStatsCache[u]){cb(pokeStatsCache[u]);return;}
    hudFetch(u).then(function(r){return r.ok?r.json():Promise.reject();}).then(function(j){pokeStatsCache[u]=j;cb(j);}).catch(next);
  }
  next();
}
function applyPokeStats(d){
  var nd=parseInt(d.ndex,10)||0;
  if(!nd||!d.forms||!d.forms.length)return;
  var en=normSlug(d.enname);
  function setStats(f,o){if(o){f.stats={hp:o.hp!=null?o.hp:'',atk:o.atk!=null?o.atk:'',def:o.def!=null?o.def:'',spa:o.spa!=null?o.spa:'',spd:o.spd!=null?o.spd:'',spe:o.spe!=null?o.spe:''};}}
  function psCacheGet(ck){return lsGet(ck,null);}
  function psCacheSet(ck,o){lsSet(ck,o);}
  var ck='pk_ps_'+nd;
  var cached=psCacheGet(ck);
  if(cached){applyBase(cached);return;}
  pokeGet([
    'https://cdn.jsdelivr.net/gh/PokeAPI/api-data@master/data/api/v2/pokemon/'+nd+'/index.json',
    'https://fastly.jsdelivr.net/gh/PokeAPI/api-data@master/data/api/v2/pokemon/'+nd+'/index.json',
    'https://pokeapi.co/api/v2/pokemon/'+nd+'/'
  ],function(j){
    var o=pokeStatsFromList(j&&j.stats);
    if(o)lsSet(ck,o);
    applyBase(o);
  });
  function applyBase(base){
    if(!base)return;
    var n=d.forms.length,count=0;
    function oneDone(){count++;if(count>=n){renderPkmForm(curPkmForm);}}
    d.forms.forEach(function(f){
      if(!f.region&&!f.formKey){setStats(f,base);oneDone();return;}
      var key=en+'-'+(f.formKey||f.region);
      var ckf='pk_psf_'+key;
      var cf=lsGet(ckf);
      if(cf){setStats(f,cf);oneDone();return;}
      pokeGet(['https://pokeapi.co/api/v2/pokemon-form/'+key+'/'],function(j2){
        var of=pokeStatsFromList(j2&&j2.stats)||base;
        if(of)lsSet(ckf,of);
        setStats(f,of);
        oneDone();
      });
    });
  }
}
function showPokemonInfo(name,ndex){
  curPkmNdex=parseInt(ndex,10)||0;
  clearBack();
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">'+esc(name)+'</div><button class="close" data-close>✕</button></div><div class="modal-body"><div id="pkm-formbar"></div><div class="pkm-big" id="pkm-big" data-shiny-toggle title="点击切换普通/闪光"><div class="empty">加载中...</div></div><div id="pkm-body"></div></div></div>';
  overlay.classList.add('open');
  curPkm=null;curPkmForm=0;curPkmForms=[];curPkmShiny=false;
fetchPokemon(name,function(d){
    var bb=document.getElementById('pkm-body');
    if(!d){if(bb)bb.innerHTML='<div class="empty">宝可梦数据获取失败</div>';return;}
    curPkm=d;
    var seenFull=devUnlocked()?{}:loadSeenFull();
    var shown=[];
    d.forms.forEach(function(f){
      if(formSeen(seenFull,f,name))shown.push(f);
    });
    if(!shown.length)shown=d.forms;
    curPkmForms=shown;
    var bar=document.getElementById('pkm-formbar');
    if(bar&&shown.length>1){
      bar.innerHTML='<div class="pkm-forms">'+shown.map(function(f,i){return '<button class="btn-small pkm-form-btn'+(i===0?' active':'')+'" data-form="'+i+'">'+esc(f.label)+'</button>';}).join('')+'</div>';
    }
  renderPkmForm(0);
});
}
function t2s(s){
  var m={'貪':'贪','銳':'锐','達':'达','龍':'龙','蟲':'虫','電':'电','氣':'气','體':'体','對':'对','風':'风','輕':'轻','裝':'装','隱':'隐','禦':'御','變':'变','壓':'压','險':'险','師':'师','術':'术','夢':'梦','話':'话','覺':'觉','導':'导','鋼':'钢','堅':'坚','頭':'头','腦':'脑','鬥':'斗','鱗':'鳞','靈':'灵','獸':'兽','鳥':'鸟','魚':'鱼','龜':'龟','馬':'马','彈':'弹','劍':'剑','鏡':'镜','葉':'叶','預':'预','嚇':'吓','膽':'胆','軟':'软','複':'复','純':'纯','鐵':'铁','儲':'储','乾':'干','膚':'肤','療':'疗','劇':'剧','跡':'迹','態':'态','傳':'传','終':'终','結':'结','爾':'尔','撓':'挠','擬':'拟','凍':'冻','無':'无','點':'点','熱':'热','異':'异','當':'当','發':'发','簡':'简','說':'说','語':'语','請':'请','謝':'谢','誤':'误','誰':'谁','資':'资','貴':'贵','質':'质','費':'费','買':'买','賣':'卖','貨':'货','貝':'贝','負':'负','責':'责','賽':'赛','贈':'赠','贏':'赢','腳':'脚','趕':'赶','躍':'跃','觸':'触','觀':'观','視':'视','見':'见','詞':'词','調':'调','讀':'读','識':'识','議':'议','護':'护','讓':'让','許':'许','講':'讲','誠':'诚','誘':'诱','譯':'译','證':'证','詢':'询','賢':'贤','賬':'账','賦':'赋','贊':'赞','賞':'赏','賠':'赔','購':'购','貸':'贷','賺':'赚','敗':'败','財':'财','貢':'贡','貧':'贫','販':'贩','貫':'贯','貼':'贴','貿':'贸','賀':'贺','賭':'赌','賴':'赖','貞':'贞','潔':'洁','燒':'烧','煩':'烦','獨':'独','獲':'获','獵':'猎','環':'环','現':'现','產':'产','畫':'画','監':'监','盤':'盘','盜':'盗','皺':'皱','盡':'尽','瞞':'瞒','禮':'礼','禍':'祸','種':'种','積':'积','競':'竞','筆':'笔','節':'节','範':'范','築':'筑','紅':'红','紀':'纪','納':'纳','紙':'纸','紛':'纷','組':'组','絕':'绝','統':'统','經':'经','緊':'紧','綠':'绿','維':'维','網':'网','綜':'综','緩':'缓','締':'缔','編':'编','緣':'缘','縛':'缚','縫':'缝','縮':'缩','縱':'纵','總':'总','績':'绩','繞':'绕','繩':'绳','繪':'绘','繼':'继','續':'续','綁':'绑','詛':'诅','軀':'躯','遲':'迟','鈍':'钝','優':'优','遊':'游','專':'专','惱':'恼','詫':'诧','盪':'荡','礙':'碍','襲':'袭','擊':'击','離':'离','驅':'驱','類':'类','顯':'显','顆':'颗','額':'额','顏':'颜','順':'顺','須':'须','領':'领','頻':'频','題':'题','顧':'顾','飛':'飞','飽':'饱','飯':'饭','餘':'余','館':'馆','駕':'驾','騎':'骑','驗':'验','驚':'惊','鬆':'松','髮':'发','麗':'丽','龐':'庞','麥':'麦','麵':'面','黃':'黄','齊':'齐','齡':'龄','齒':'齿','願':'愿','敵':'敌','誼':'谊','談':'谈','惡':'恶','錄':'录','録':'录','噴':'喷','殼':'壳','針':'针','魯':'鲁','絲':'丝','熾':'炽','獅':'狮','鴨':'鸭','鳳':'凤','雞':'鸡','鯨':'鲸','鯊':'鲨','鯉':'鲤','鰻':'鳗','鱷':'鳄','鯰':'鲶','鰍':'鳅','蝦':'虾','鰭':'鳍','鮭':'鲑','魷':'鱿','鮑':'鲍','蟻':'蚁','蠍':'蝎','螢':'萤','蟬':'蝉','蠑':'蝾','蝸':'蜗','鸚':'鹦','鵡':'鹉','鵝':'鹅','鶴':'鹤','鷹':'鹰','鴿':'鸽','鴉':'鸦','鷗':'鸥','鷲':'鹫','禿':'秃','貓':'猫','斬':'斩','豬':'猪','駝':'驼','寶':'宝','長':'长','圓':'圆','陸':'陆','鉗':'钳','瑪':'玛','烏':'乌','島':'岛','樹':'树','蔥':'葱','蓮':'莲','藍':'蓝','蘇':'苏','羅':'罗','巖':'岩','籠':'笼','簽':'签','蓋':'盖'};
  return String(s||'').split('').map(function(c){return m[c]||c;}).join('');
}
var abiCache={},abiLoading={};
function parseAbi(wt,html){
  var d={name:'',enname:'',text:'',detail:''};
  var m=wt.match(/\{\{\s*[^{}\n]*信息框[\s\S]*?\n\}\}/);
  if(!m)return d;
  var box=m[0];
  function g(key){var r=box.match(new RegExp('\\|'+key+'=([^|\\n]*)'));return r?r[1].trim():'';}
  d.name=g('name');d.enname=g('enname');
  var raw=g('text')||g('效果')||g('effect');
  var z=raw.match(/zh-hans[：:]([^;}]+)/);
  d.text=cleanText(z?z[1]:raw);
  if(html){
    var doc=new DOMParser().parseFromString(html,'text/html');
    d.detail=abiDetailFromHtml(doc);
  }
  return d;
}
function cleanAbiText(s){
  return String(s||'')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g,'')
    .replace(/<ref[^/>]*\/>/g,'')
    .replace(/\{\{\s*(?:typelink|type)\s*\|([^}|]+)(?:\|[^}]*)?\}\}/g,'$1')
    .replace(/\{\{\s*m\s*\|([^}|]+)(?:\|[^}]*)?\}\}/g,'$1')
    .replace(/\{\{\s*a\s*\|([^}|]+)(?:\|[^}]*)?\}\}/g,'$1')
    .replace(/\{\{\s*i\s*\|([^}|]+)(?:\|[^}]*)?\}\}/g,'$1')
    .replace(/\{\{[^{}]*\}\}/g,'')
    .replace(/-?\{zh-hans:([^;}]*)[^}]*\}-?/g,'$1')
    .replace(/-?\{[^{}]*\}-?/g,'')
    .replace(/\u005B\u005B(?:[^\u005D|]*\|)?([^\u005D]*)\u005D\u005D/g,'$1')
    .replace(/<[^>]+>/g,'')
    .replace(/'{2,}/g,'')
    .split('\n').map(function(x){return x.trim();}).filter(function(x){return x;})
.join('\n');
}
function abiDetailFromHtml(doc){
  function stripBad(el){
    var bad=el.querySelectorAll('style,script,.mw-editsection');
    for(var i=0;i<bad.length;i++){if(bad[i].parentNode)bad[i].parentNode.removeChild(bad[i]);}
    return el;
  }
  function nodeText(el){
    var c=stripBad(el.cloneNode(true));
    return (c.textContent||'').replace(/\s+/g,' ').trim();
  }
  var hs=doc.querySelectorAll('h2');
  for(var i=0;i<hs.length;i++){
    var ht=nodeText(hs[i]);
    if(ht.indexOf('特性效果')!==0&&ht.indexOf('效果')!==0)continue;
    var wrap=hs[i];
    var p=wrap.parentElement;
    if(p&&String(p.className||'').indexOf('mw-heading')>=0)wrap=p;
    var node=wrap.nextElementSibling;
    var keep=[],cur=null;
    while(node){
      var tag=node.tagName?node.tagName.toLowerCase():'';
      if(tag==='h2')break;
      if(node.querySelector&&node.querySelector('h2'))break;
      if(tag==='style'||tag==='script'){node=node.nextElementSibling;continue;}
      var hSub=node.querySelector?node.querySelector('h3,h4,h5,h6'):null;
      if(/^h[3-6]$/.test(tag)||hSub){
        var sub=nodeText(hSub||node);
        cur=(sub==='对战中'||sub==='对战外')?sub:null;
        if(cur)keep.push(cur);
        node=node.nextElementSibling;
        continue;
      }
      if(!cur){node=node.nextElementSibling;continue;}
      var lis=node.querySelectorAll('li');
      if(lis&&lis.length){
        for(var k=0;k<lis.length;k++){
          var lt=nodeText(lis[k]);
          if(lt)keep.push('- '+lt);
        }
      }else{
        var t=nodeText(node);
        if(t)keep.push(t);
      }
      node=node.nextElementSibling;
    }
    if(!keep.length){
      node=wrap.nextElementSibling;
      while(node){
        var t2=node.tagName?node.tagName.toLowerCase():'';
        if(t2==='h2')break;
        if(node.querySelector&&node.querySelector('h2'))break;
        if(t2==='style'||t2==='script'){node=node.nextElementSibling;continue;}
        var tx=nodeText(node);
        if(tx)keep.push(tx);
        node=node.nextElementSibling;
      }
    }
    return keep.join('\n').replace(/[•·・●]/g,'-');
  }
  return '';
}
function fetchAbility(name,cb){
  if(!name){cb&&cb(null);return;}
  var _diy=diyGet('ability',name);
  if(_diy){cb&&cb(_diy);return;}
  if(abiCache[name]){cb&&cb(abiCache[name]);return;}
  var _c3=lsGet('pk_ab_'+name,null);if(_c3){abiCache[name]=_c3;cb&&cb(abiCache[name]);return;}
  if(abiLoading[name]){abiLoading[name].push(cb);return;}
  abiLoading[name]=[];
  if(cb)abiLoading[name].push(cb);
  function done(d){
    abiCache[name]=d||null;
    if(d&&d.text){lsSet('pk_ab_'+name,d);}
    var cbs=abiLoading[name]||[];
    abiLoading[name]=null;
    for(var i=0;i<cbs.length;i++){try{cbs[i](d);}catch(e){}}
  }
  function parsePage(page,onFail){
    hudFetch('https://wiki.52poke.com/api.php?action=parse&page='+encodeURIComponent(page)+'&format=json&prop=wikitext|text&variant=zh-hans&origin=*')
      .then(function(r){return r.ok?r.json():Promise.reject();})
      .then(function(j){
        var wt=(j&&j.parse&&j.parse.wikitext)?j.parse.wikitext['*']:'';
var html=(j&&j.parse&&j.parse.text)?j.parse.text['*']:'';
if(wt){done(parseAbi(wt,html));}
        else{onFail();}
      })
      .catch(onFail);
  }
  function searchThen(){
    hudFetch('https://wiki.52poke.com/api.php?action=query&list=search&srsearch='+encodeURIComponent(t2s(name))+'&srnamespace=0&srlimit=3&format=json&origin=*')
      .then(function(r){return r.json();})
      .then(function(j){
        var rs=(j&&j.query&&j.query.search)||[];
        if(rs[0]){parsePage(rs[0].title,function(){done(null);});}
        else{done(null);}
      })
      .catch(function(){done(null);});
  }
  parsePage(t2s(name)+'（特性）',searchThen);
}
function showAbilityInfo(name){
  pushBack();
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">'+esc(name)+'</div><button class="close" data-move-back>✕</button></div><div class="modal-body" id="abi-body"><div class="empty">特性数据加载中...</div></div></div>';
  overlay.classList.add('open');
  fetchAbility(name,function(d){
    var b=document.getElementById('abi-body');
    if(!b)return;
    if(!d||!d.text){b.innerHTML='<div class="empty">特性数据获取失败</div>';return;}
b.innerHTML='<div class="row block"><span class="k">介绍</span><span class="v">'+esc(d.text)+'</span></div>'+(d.detail?'<div class="row block"><span class="k">详细效果</span><span class="v">'+esc(d.detail).replace(/\n/g,'<br>')+'</span></div>':'');
  });
}
var itemCache={},itemLoading={},itemSpriteCache={};
var ITEM_ALIAS={'厚底鞋':'厚底靴','洛托姆手机':'手机洛托姆','奇异糖果':'神奇糖果','稀有糖果':'神奇糖果','药水':'伤药','回复药':'伤药','治疗药水':'伤药','超级药水':'超级伤药','高级药水':'好伤药','完全药水':'全满药','完全回复药':'全复药','解毒剂':'解毒药','烧伤药':'灼伤药','冰冻药':'解冻药','苏醒药':'清醒药','麻痹治愈':'麻痹药','万能药':'万灵药','复活碎片':'活力碎片','复活块':'活力块','复活药':'活力碎片','命玉':'生命宝珠','生命珠':'生命宝珠','剩菜':'剩饭','气腰':'气势披带','气势腰带':'气势披带','攻击背心':'突击背心','辉石':'进化奇石','进化辉石':'进化奇石','弱点对策':'弱点保险','专家腰带':'达人带','黑泥':'黑色污泥','岩石头盔':'凸凸头盔','尖锐头盔':'凸凸头盔','红色卡片':'红牌','逃脱按钮':'逃生按钮','快速爪子':'先制之爪','幸运金币':'护符金币','护身金币':'护符金币','速度围巾':'讲究围巾','特攻眼镜':'讲究眼镜','固执头带':'讲究头带'};
function itemKey(name){var n=String(name||'').trim();return ITEM_ALIAS[n]||n;}
function itemCands(name){
  var n=String(name||'').trim();
  var keys=[n];
  var base=itemKey(n);
  if(base!==n)keys.push(base);
  var out=[];
  for(var i=0;i<keys.length;i++){
    var k=keys[i];
    if(out.indexOf(k)<0)out.push(k);
    var fw=k.replace(/[A-Za-z0-9]/g,function(c){return String.fromCharCode(c.charCodeAt(0)+65248);});
    if(out.indexOf(fw)<0)out.push(fw);
    var hw=k.replace(/[！-～]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-65248);});
    if(out.indexOf(hw)<0)out.push(hw);
  }
  return out;
}
var itemListCache=null,itemListLoading=false,itemListCbs=[];
function parseItemList(wt){
  var map={};
  var lines=wt.split('\n');
  var rows=[],curRow=null;
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(line.indexOf('|-')===0){if(curRow){rows.push(curRow);}curRow={cells:[]};}
    else if(line.indexOf('|')===0&&curRow){curRow.cells.push(line);}
  }
  if(curRow){rows.push(curRow);}
  var pending='';
  for(var r=0;r<rows.length;r++){
    var cells=rows[r].cells;
    var name='';
    for(var c=0;c<cells.length;c++){
      var cell=cells[c].slice(1).trim();
      var m=cell.match(/\{\{\s*I\s*\|\s*([^|}]+)/);
      if(m){name=m[1].trim();break;}
      var m2=cell.match(/\u005B\u005B([^\u005D|]+)(?:\|[^\u005D]*)?\u005D\u005D/);
      if(m2&&!/^File:|^文件:/.test(m2[1])){name=m2[1].trim();break;}
    }
    if(!name)continue;
    var text='';
    var lastCell=cells[cells.length-1]?cells[cells.length-1].slice(1).trim():'';
    var raw=lastCell.replace(/\{\{[^}]*\}\}/g,'').replace(/\u005B\u005B(?:[^\u005D|]*\|)?([^\u005D]*)\u005D\u005D/g,'$1').replace(/<[^>]*>/g,'').trim();
    if(/zh-hans[：:]/.test(lastCell)){
      var z=lastCell.match(/zh-hans[：:]([^;}]+)/);
      text=z?z[1].trim():raw;
    }else if(/rowspan/.test(lastCell)){
      var z2=lastCell.match(/zh-hans[：:]([^;}]+)/);
      text=z2?z2[1].trim():raw;
    }else if(/[\u4e00-\u9fff]/.test(raw)||raw===''){
      text=raw;
    }
    if(/rowspan/.test(lastCell)&&text){pending=text;}
    if(!text&&pending){text=pending;}
    if(name&&text){map[name]=text;}
  }
  return map;
}
function fetchItemList(cb){
  if(itemListCache){cb&&cb(itemListCache);return;}
  var _c=lsGet('pk_itemlist',null);if(_c){itemListCache=_c;cb&&cb(_c);return;}
  if(itemListLoading){cb&&itemListCbs.push(cb);return;}
  itemListLoading=true;
  hudFetch('https://wiki.52poke.com/api.php?action=parse&page='+encodeURIComponent('道具列表')+'&format=json&prop=wikitext&variant=zh-hans&origin=*')
    .then(function(r){return r.ok?r.json():Promise.reject();})
    .then(function(j){
      var wt=(j&&j.parse&&j.parse.wikitext)?j.parse.wikitext['*']:'';
      var map=wt?parseItemList(wt):null;
      itemListCache=map;itemListLoading=false;
      if(map){lsSet('pk_itemlist',map);}
      var cbs=itemListCbs;itemListCbs=[];
      for(var i=0;i<cbs.length;i++){try{cbs[i](map);}catch(e){}}
      if(cb)cb(map);
    })
    .catch(function(){itemListLoading=false;var cbs=itemListCbs;itemListCbs=[];for(var i=0;i<cbs.length;i++){try{cbs[i](null);}catch(e){}}if(cb)cb(null);});
}
function parseItemPage(wt,html){
  var d='';
  var m=wt.match(/\|\s*text\s*=\s*([^\n|]+)/)||wt.match(/\|\s*效果\s*=\s*([^\n|]+)/)||wt.match(/\|\s*effect\s*=\s*([^\n|]+)/)||wt.match(/\|\s*说明\s*=\s*([^\n|]+)/)||wt.match(/\|\s*desc\s*=\s*([^\n|]+)/);
  if(m){
    var raw=m[1].trim();
    var z=raw.match(/zh-hans[：:]([^;}]+)/);
    if(z){d=cleanText(z[1]);}else{d=cleanText(raw);}
  }
  if(!d){
    var z2=wt.match(/zh-hans[：:]([^;}]+)/);
    if(z2){d=cleanText(z2[1]);}
  }
  if(!d&&html){
    var doc=new DOMParser().parseFromString(html,'text/html');
    var ps=doc.querySelectorAll('p');
    for(var i=0;i<ps.length;i++){
      var t=(ps[i].innerText||ps[i].textContent||'').replace(/\s+/g,' ').trim();
      if(t.length>=6&&t.indexOf('。')>=0&&t.indexOf('日文')<0&&t.indexOf('英文')<0){d=t;break;}
    }
  }
  return d;
}
function fetchItemPage(cands,i,cb){
  if(i>=cands.length){cb&&cb('');return;}
  var key=cands[i];
  hudFetch('https://wiki.52poke.com/api.php?action=parse&page='+encodeURIComponent(t2s(key)+'（道具）')+'&format=json&prop=text|wikitext&variant=zh-hans&origin=*')
    .then(function(r){return r.ok?r.json():Promise.reject();})
    .then(function(j){
      if(!j||!j.parse){fetchItemPage(cands,i+1,cb);return;}
      var wt=(j.parse.wikitext&&j.parse.wikitext['*'])?j.parse.wikitext['*']:'';
      var html=(j.parse.text&&j.parse.text['*'])?j.parse.text['*']:'';
      var t=parseItemPage(wt,html);
      if(t){cb&&cb(t);}else{fetchItemPage(cands,i+1,cb);}
    })
    .catch(function(){fetchItemPage(cands,i+1,cb);});
}
function fetchItem(name,cb){
  if(!name){cb&&cb(null);return;}
  var _diy=diyGet('item',name);
  if(_diy){cb&&cb(_diy);return;}
  if(ITEM_TEXT[name]){var _d={name:name,text:ITEM_TEXT[name],img:ITEM_IMG[name]||''};itemCache[name]=_d;cb&&cb(_d);return;}
  if(itemCache[name]){cb&&cb(itemCache[name]);return;}
  var _c=lsGet('pk_item_'+name,null);if(_c){itemCache[name]=_c;cb&&cb(_c);return;}
  var cands=itemCands(name);
  fetchItemList(function(map){
    var text='';
    if(map){for(var i=0;i<cands.length;i++){if(map[cands[i]]){text=map[cands[i]];break;}}}
    if(text){var d={name:name,text:text};itemCache[name]=d;lsSet('pk_item_'+name,d);cb&&cb(d);return;}
    fetchItemPage(cands,0,function(t2){
      var d=t2?{name:name,text:t2}:null;
      itemCache[name]=d;
      if(d){lsSet('pk_item_'+name,d);}
      cb&&cb(d);
    });
  });
}
function showItemInfo(name,back){
  if(back){pushBack();}else{clearBack();}
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">'+esc(name)+'</div><button class="close" data-move-back>✕</button></div><div class="modal-body" id="item-body"><div class="empty">道具数据加载中...</div></div></div>';
  overlay.classList.add('open');
  fetchItem(name,function(d){
    var b=document.getElementById('item-body');
    if(!b)return;
    if(!d||!d.text){b.innerHTML='<div class="empty">道具数据获取失败</div>';return;}
    b.innerHTML=(d.img?'<div style="text-align:center;margin-bottom:8px"><img src="'+esc(d.img)+'" style="max-width:96px;max-height:96px;object-fit:contain;image-rendering:pixelated" onerror="this.remove()"></div>':'')+'<div class="row block"><span class="k">介绍</span><span class="v">'+esc(d.text).replace(/\n/g,'<br>')+'</span></div>';
  });
}
function fetchItemSprite(name,cb){
  if(!name){cb&&cb('');return;}
  if(itemSpriteCache[name]){cb&&cb(itemSpriteCache[name]);return;}
  var _c=lsGet('pk_itemimg_'+name,'');if(_c){itemSpriteCache[name]=_c;cb&&cb(_c);return;}
  var cands=itemCands(name);
  var ci=0;
  function _try(){
  if(ci>=cands.length){itemSpriteCache[name]='';cb&&cb('');return;}
  var key=cands[ci++];
  hudFetch('https://wiki.52poke.com/api.php?action=parse&page='+encodeURIComponent(t2s(key)+'（道具）')+'&format=json&prop=wikitext|text&variant=zh-hans&origin=*')
    .then(function(r){return r.ok?r.json():Promise.reject();})
    .then(function(j){
      var wt=(j&&j.parse&&j.parse.wikitext)?j.parse.wikitext['*']:'';
      var html=(j&&j.parse&&j.parse.text)?j.parse.text['*']:'';
      var url='';
      var target='';
      var box=wt.match(/\{\{\s*[^{}\n]*信息框[\s\S]*?\n\}\}/);
      if(box){
        var im=box[0].match(/\|\s*(?:sprite|image|图片|贴图|img|圖)\s*=\s*([^\n|]+)/i);
        if(im){target=String(im[1]||'').replace(/^\u005B\u005B(?:File|文件|檔案):/i,'').replace(/[\u005B\u005D]/g,'').replace(/\{\{[^}]*\}\}/g,'').replace(/ /g,'_').trim();}
      }
      if(target&&html){
        var enc=encodeURIComponent(target);
        var m3=html.match(new RegExp('src="([^"]*'+enc+'[^"]*)"','i'));
        if(m3){url=m3[1];}
      }
      if(!url&&html){
        var dm=html.match(/src="([^"]*Dream_[^"]*Sprite\.png[^"]*)"/);
        if(dm){url=dm[1];}
        if(!url){var m=html.match(/src="([^"]*Bag_[^"]*Sprite\.png[^"]*)"/);url=m?m[1]:'';}
        if(!url){var m2=html.match(/https?:\/\/[^"']*?Sprite\.png[^"']*/);url=m2?m2[0]:'';}
      }
      if(url){itemSpriteCache[name]=url;lsSet('pk_itemimg_'+name,url);cb&&cb(url);}
      else{_try();}
    })
    .catch(function(){_try();});
  }
  _try();
}
function resolveItemImgs(scope){
  var els=(scope||document).querySelectorAll('.item-wiki[data-item]');
  for(var i=0;i<els.length;i++){
    (function(el){
      var name=el.getAttribute('data-item');
      fetchItemSprite(name,function(url){
        if(url){
          var img=document.createElement('img');
          img.className=el.getAttribute('data-cls')||'item-icon';
          img.src=url;
          img.onerror=function(){var p=document.createElement('span');p.className='item-icon placeholder';p.textContent='?';this.parentNode.replaceChild(p,this);};
          el.parentNode.replaceChild(img,el);
        }
      });
    })(els[i]);
  }
}
var TYPE_CHART=[['一般',[],['岩石','钢'],['幽灵']],['格斗',['一般','岩石','钢','冰','恶'],['飞行','毒','虫','超能力','妖精'],['幽灵']],['飞行',['格斗','虫','草'],['岩石','钢','电'],[]],['毒',['草','妖精'],['毒','地面','岩石','幽灵'],['钢']],['地面',['毒','岩石','钢','火','电'],['草','虫'],['飞行']],['岩石',['飞行','虫','火','冰'],['格斗','地面','钢'],[]],['虫',['草','超能力','恶'],['格斗','飞行','毒','幽灵','钢','火','妖精'],[]],['幽灵',['幽灵','超能力'],['恶'],['一般']],['钢',['岩石','冰','妖精'],['钢','火','水','电'],[]],['火',['虫','钢','草','冰'],['岩石','火','水','龙'],[]],['水',['地面','岩石','火'],['水','草','龙'],[]],['草',['地面','岩石','水'],['飞行','毒','虫','钢','火','草','龙'],[]],['电',['飞行','水'],['草','电','龙'],['地面']],['超能力',['格斗','毒'],['钢','超能力'],['恶']],['冰',['飞行','地面','草','龙'],['钢','火','水','冰'],[]],['龙',['龙'],['钢'],['妖精']],['恶',['幽灵','超能力'],['格斗','恶','妖精'],[]],['妖精',['格斗','龙','恶'],['毒','钢','火'],[]]];
function typeMul(atk,def){
  for(var i=0;i<TYPE_CHART.length;i++){
    if(TYPE_CHART[i][0]===atk){
      if(TYPE_CHART[i][3].indexOf(def)>=0)return 0;
      if(TYPE_CHART[i][1].indexOf(def)>=0)return 2;
      if(TYPE_CHART[i][2].indexOf(def)>=0)return 0.5;
      return 1;
    }
  }
  return 1;
}
function typeChartCalc(){
  var d1=document.getElementById('tc-def-1');
  var d2=document.getElementById('tc-def-2');
  var res=document.getElementById('tc-result');
  if(!d1||!res)return;
  var v1=d1.value,v2=d2?d2.value:'';
  if(!v1){res.innerHTML='<div class="empty">选择防御方属性后，自动显示克制它的属性</div>';return;}
  var defs=[v1];
  if(v2&&v2!==v1)defs.push(v2);
  var o4=[],o2=[],o05=[],o025=[],o0=[];
  for(var i=0;i<TYPE_CHART.length;i++){
    var atk=TYPE_CHART[i][0];
    var mul=1;
    for(var j=0;j<defs.length;j++){
      var m=typeMul(atk,defs[j]);
      if(m===0){mul=0;break;}
      mul*=m;
    }
    if(mul>=4)o4.push(atk);
    else if(mul===2)o2.push(atk);
    else if(mul===0.5)o05.push(atk);
    else if(mul===0.25)o025.push(atk);
    else if(mul===0)o0.push(atk);
  }
  function row(lab,list){
    if(!list.length)return '';
    return '<div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0"><span class="dim" style="font-size:.72rem;flex-shrink:0;min-width:52px">'+lab+'</span><span style="display:flex;flex-wrap:wrap;gap:4px">'+list.map(function(t){return typeChipHTML(t);}).join('')+'</span></div>';
  }
  var h='';
  h+=row('4× 克制',o4);
  h+=row('2× 克制',o2);
  h+=row('½× 抵抗',o05);
  h+=row('¼× 抵抗',o025);
  h+=row('0× 无效',o0);
  if(!h)h='<div class="empty">无克制/抵抗/免疫关系</div>';
  res.innerHTML=h;
}
function typeChartHTML(){
  var opts='<option value="">无</option>'+TYPE_LIST.map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('');
  var selStyle='flex:1;min-width:0;box-sizing:border-box;padding:6px 8px;font-family:inherit;font-size:.85rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none';
  var h='<div class="set-title" style="margin-left:0">防御方属性（最多选两个）</div>';
  h+='<div style="display:flex;gap:6px;margin-bottom:8px"><select id="tc-def-1" style="'+selStyle+'">'+opts+'</select><select id="tc-def-2" style="'+selStyle+'">'+opts+'</select></div>';
  h+='<div id="tc-result"><div class="empty">选择防御方属性后，自动显示克制它的属性</div></div>';
  h+='<div class="set-title" style="margin-left:0;margin-top:6px">完整克制表</div>';
  h+='<div style="text-align:center"><img src="https://s1.52poke.com/wiki/thumb/8/8a/%E5%B1%9E%E6%80%A7%E7%9B%B8%E5%85%8B%E8%A1%A8_SWSH.png/601px-%E5%B1%9E%E6%80%A7%E7%9B%B8%E5%85%8B%E8%A1%A8_SWSH.png?20200201130327" data-tc-big="https://s1.52poke.com/wiki/thumb/8/8a/%E5%B1%9E%E6%80%A7%E7%9B%B8%E5%85%8B%E8%A1%A8_SWSH.png/601px-%E5%B1%9E%E6%80%A7%E7%9B%B8%E5%85%8B%E8%A1%A8_SWSH.png?20200201130327" style="max-width:100%;height:auto;border-radius:6px;cursor:zoom-in" onerror="this.style.display=\'none\'"><div class="dim" style="font-size:.72rem;margin-top:4px">点击图片放大查看</div></div>';
  return frameP('属性克制表',h);
}
function typeColor(t){t=t2s(String(t||'').trim());return TYPE_COLORS[t]||TYPE_COLORS[TYPE_CN[t]]||'#888';}
function typeLabel(t){t=t2s(String(t||'').trim());return TYPE_CN[t]||t;}
function typeChipHTML(t){return '<span class="type-chip" style="background:'+typeColor(t)+'">'+esc(typeLabel(t))+'</span>';}
function typesHTML(a1,a2){var out='';if(a1)out+=typeChipHTML(a1);if(a2&&a2!=='无')out+=typeChipHTML(a2);if(!out)return '<span class="dim">-</span>';return '<div class="types">'+out+'</div>';}
function genderText(g){if(g==='♂')return '雄性';if(g==='♀')return '雌性';return '无性别';}
function movesArr(s){
  if(!s)return [];
  return String(s).split(/[,，/、]/).map(function(x){
    var p=x.split(':');
    return {name:(p[0]||'').trim(),type:(p[1]||'').trim(),cat:(p[2]||'').trim()};
  }).filter(function(m){return m.name;});
}
function moveGridItemHTML(m){
  if(!m||!m.name)return '';
  var type=m.type||MOVE_TYPE[m.name]||'';
  var lb=typeLabel(type),cl=typeColor(type);
  var chip='<span class="move-type" style="background:'+(cl||'#6b7f99')+'">'+(lb?esc(lb):'?')+'</span>';
  return '<div class="dt-move-cell" data-move="'+esc(m.name)+'" data-mvtype="'+esc(type)+'" data-mvcat="'+esc(m.cat)+'">'+chip+'<span class="move-name">'+esc(m.name)+'</span></div>';
}
function moveCellHTML(m){
  if(!m||!m.name)return '';
  var type=m.type||MOVE_TYPE[m.name]||'';
  var color=typeColor(type);
  return '<div class="move-cell" style="border-color:'+color+';background:'+color+'22;cursor:pointer" data-move="'+esc(m.name)+'" data-mvtype="'+esc(type)+'" data-mvcat="'+esc(m.cat)+'"><div class="move-name">'+esc(m.name)+'</div><div class="move-meta"><span class="move-type" style="background:'+color+'">'+esc(typeLabel(type))+'</span><span class="move-cat">'+esc(m.cat)+'</span></div></div>';
}
function moveGridHTML(s){
  if(!s)return '';
  var arr=movesArr(s);
  if(!arr.length)return '';
  var html='<div class="dt-move-grid">'+arr.slice(0,4).map(moveGridItemHTML).join('')+'</div>';
  if(arr.length>4){
    html+='<button type="button" class="dt-more-btn" data-dt-all="'+esc(s)+'">☰ 全部技能（'+arr.length+'）</button>';
  }
  return html;
}
function showAllMoves(s){
  var arr=movesArr(s);
  pushBack();
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">全部技能（'+arr.length+'）</div><button class="close" data-move-back>✕</button></div><div class="modal-body"><div class="dt-move-grid">'+arr.map(moveGridItemHTML).join('')+'</div></div></div>';
  overlay.classList.add('open');
}
function resolveMoveTypes(scope){var els=(scope||document).querySelectorAll('.dt-move-cell[data-move]');for(var i=0;i<els.length;i++){(function(el){var name=el.getAttribute('data-move');if(!name)return;fetchMove(name,function(d){if(d&&d.type){var lb=typeLabel(d.type);var cl=typeColor(d.type);if(!lb)return;el.setAttribute('data-mvtype',d.type);var sp=el.querySelector('.move-type');if(!sp){sp=document.createElement('span');sp.className='move-type';el.insertBefore(sp,el.firstChild);}sp.style.background=cl;sp.textContent=lb;}});})(els[i]);}}
function toggleDtPage(){var p1=document.querySelector('.dt-page[data-dt-page="1"]');var p2=document.querySelector('.dt-page[data-dt-page="2"]');var btn=document.querySelector('[data-dt-next]');if(!p1||!p2||!btn)return;if(p1.classList.contains('active')){p1.classList.remove('active');p2.classList.add('active');btn.classList.remove('right');btn.classList.add('left');btn.textContent='◀';}else{p2.classList.remove('active');p1.classList.add('active');btn.classList.remove('left');btn.classList.add('right');btn.textContent='▶';}}
var NATURE_MAP={'勤奋':{up:'',down:''},'怕寂寞':{up:'攻击',down:'防御'},'固执':{up:'攻击',down:'特攻'},'顽皮':{up:'攻击',down:'特防'},'勇敢':{up:'攻击',down:'速度'},'大胆':{up:'防御',down:'攻击'},'坦率':{up:'',down:''},'淘气':{up:'防御',down:'特攻'},'乐天':{up:'防御',down:'特防'},'悠闲':{up:'防御',down:'速度'},'内敛':{up:'特攻',down:'攻击'},'慢吞吞':{up:'特攻',down:'防御'},'害羞':{up:'',down:''},'马虎':{up:'特攻',down:'特防'},'冷静':{up:'特攻',down:'速度'},'温和':{up:'特防',down:'攻击'},'温顺':{up:'特防',down:'防御'},'慎重':{up:'特防',down:'特攻'},'浮躁':{up:'',down:''},'自大':{up:'特防',down:'速度'},'胆小':{up:'速度',down:'攻击'},'急躁':{up:'速度',down:'防御'},'爽朗':{up:'速度',down:'特攻'},'天真':{up:'速度',down:'特防'},'认真':{up:'',down:''}};
var NATURE_ALIAS={'开朗':'爽朗','保守':'内敛','沉着':'温和','胆怯':'胆小','轻率':'马虎','鲁莽':'马虎','谨慎':'慎重','散漫':'乐天','温吞':'慢吞吞','傲慢':'自大','冲动':'急躁','单纯':'天真','严肃':'认真','腼腆':'害羞','顽固':'固执','寂寞':'怕寂寞','顺从':'坦率','努力':'勤奋','温柔':'温顺'};
function natureEffectText(n){
  n=t2s(String(n||'').trim());
  var key=NATURE_MAP[n]?n:(NATURE_ALIAS[n]||n);
  var e=NATURE_MAP[key];
  if(!e)return '';
  if(!e.up&&!e.down)return '无能力值变化';
  return (e.up?'+'+e.up:'')+' '+(e.down?'-'+e.down:'');
}
function showNatureInfo(name){
  pushBack();
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">'+esc(name)+'</div><button class="close" data-move-back>✕</button></div><div class="modal-body"><div class="row"><span class="k">能力变化</span><span class="v">'+esc(natureEffectText(name)||'-')+'</span></div></div></div>';
  overlay.classList.add('open');
}
function detailHTML(c){var gi=genderOf(c.gender);var sprite=pkImgHTML(c.species,c.icon,c.shiny,'dt-big');var ballIcon=c.ball?'<span class="item-icon placeholder item-wiki" data-item="'+esc(c.ball)+'" data-cls="ball-icon dt-ball">?</span>':'';var itName=(c.item&&c.item!=='无')?c.item:'';
var hold=itName?('持有物：<span class="abi-link" data-item="'+esc(itName)+'">'+esc(itName)+'</span>'):'持有物：无';var p1='<div class="dt-top">'+ballIcon+'<span class="dt-name">'+esc(c.name)+'&nbsp;<span class="gender-sym '+gi.cls+'">'+gi.sym+'</span></span></div><div class="dt-sprite">'+sprite+'</div><div class="dt-lv">Lv.'+c.level+'</div><div class="dt-hold">'+hold+'</div>'+moveGridHTML(c.skills);var p2='<div class="row"><span class="k">属性</span>'+typesHTML(c.attr1,c.attr2)+'</div><div class="row"><span class="k">性格</span><span class="v">'+(c.nature?'<span class="abi-link" data-nature="'+esc(c.nature)+'">'+esc(c.nature)+'</span>':'-')+'</span></div><div class="row"><span class="k">特性</span><span class="v">'+(c.ability?'<span class="abi-link" data-ability="'+esc(c.ability)+'">'+esc(c.ability)+'</span>':'-')+'</span></div>'+(c.status?'<div class="row"><span class="k">异常状态</span><span class="v">'+statusTag(c.status)+'</span></div>':'')+'<div class="row"><span class="k">HP</span><span class="v">'+c.hpCur+'/'+c.hpMax+'</span></div>'+(c.intimacy!==''?'<div class="row"><span class="k">亲密度</span><span class="v">'+esc(c.intimacy)+'/255</span></div>':'')+(c.hatch?'<div class="row"><span class="k">孵化剩余</span><span class="v">'+esc(c.hatch)+'</span></div>':'')+(c.partner?'<div class="row"><span class="k">搭档倾向</span><span class="v">'+esc(c.partner)+'</span></div>':'')+'<div class="row"><span class="k">经验</span><span class="v">'+esc(c.exp||'-')+'</span></div><div class="row"><span class="k">个体值</span>'+ivsHTML(c.iv)+'</div>';var hudActions='';
if(c.where==='team') hudActions+='<button class="act-btn" data-pkm-store>存入盒子</button>';
if(c.where==='box' && c.boxName) hudActions+='<button class="act-btn" data-pkm-withdraw>取出到队伍</button>';
if(c.where==='box' && c.boxName) hudActions+='<button class="act-btn" data-pkm-movebox>切换盒子</button>';
if(c.item && c.item!=='无') hudActions+='<button class="act-btn" data-pkm-unequip>卸下道具</button>';
hudActions+='<button class="act-btn" data-pkm-equip>携带道具</button>';
if(hudActions) hudActions='<div class="action-btns" style="margin-top:10px">'+hudActions+'</div>';
return '<div class="modal detail-modal one"><div class="modal-head"><div class="modal-name">宝可梦详情</div><button class="close" data-close>✕</button></div><div class="modal-body">'+p1+'<div class="dt-sep"></div>'+p2+hudActions+'</div></div>';}

function actionHTML(p,key){var img=pkImgHTML(p.名字,p.图标,p.是否闪光,'action-img');var tags='';if(p.是否闪光)tags+='<span class="tag shiny">闪光</span>';if(p.状态&&p.状态!=='普通')tags+='<span class="tag boss">'+esc(p.状态)+'</span>';return '<div class="modal"><div class="modal-head"><div class="modal-name">选择行动</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="action-pkm">'+img+'<div class="action-info"><div class="nearby-name">'+esc(p.名字)+' '+tags+'</div><div class="nearby-sub">数量 ×'+num(p.数量,1)+'</div></div></div><div class="action-btns"><button class="act-btn" data-action="对战" data-key="'+esc(key)+'">⚔️ 对战</button><button class="act-btn" data-action="捕捉" data-key="'+esc(key)+'">🔴 捕捉</button><button class="act-btn" data-action="观察" data-key="'+esc(key)+'">👀 观察</button></div></div></div>';}

function sendMessage(text){
  try{
    var w=WIN;
    var ta=w.document.querySelector('#send_textarea');
    var sb=w.document.querySelector('#send_but')||w.document.querySelector('button#send_but')||w.document.querySelector('[data-testid="send-button"]');
    if(ta&&sb){
      try{
        var proto=(WIN.HTMLTextAreaElement&&WIN.HTMLTextAreaElement.prototype)||(w.HTMLTextAreaElement&&w.HTMLTextAreaElement.prototype);
        var set=proto?Object.getOwnPropertyDescriptor(proto,'value'):null;
        if(set&&set.set){set.set.call(ta,text);}else{ta.value=text;}
      }catch(e){ta.value=text;}
      try{ta.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}
      try{ta.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}
      sb.click();return;
    }
    w.postMessage({type:'send_message',message:text},'*');return;
  }catch(e){}
  alert('已生成指令：'+text);
}
function sendAction(pkm,action){var map={对战:'我要向'+pkm.名字+'发起对战。',捕捉:'我要收服'+pkm.名字+'。',观察:'我要观察'+pkm.名字+'的举动。'};var text=map[action]||('我'+action+pkm.名字+'。');var ov=document.querySelector('.overlay');if(ov)ov.classList.remove('open');if(!fillInput(text))sendMessage(text);}

function menuHTML(){return '<div class="menu-grid">'+MENU.map(function(m){var sz=getIconSize('m-'+m.key);var icon=m.img?'<span class="menu-icon-wrap"><img class="menu-icon" src="'+esc(m.img)+'" style="width:'+sz+'px;height:'+sz+'px"></span>':'<span class="menu-icon-wrap"><span class="menu-emoji" style="font-size:'+sz+'px">'+esc(m.emoji)+'</span></span>';var badge=(m.key==='settings'&&pkHasUpdate)?'<span class="menu-badge">新</span>':'';return '<div class="menu-item" data-page="'+esc(m.key)+'"><div class="menu-item-inner">'+icon+'<span class="menu-label">'+esc(m.label)+badge+'</span></div></div>';}).join('')+'</div>';}

var clearTarget='all',clearStep=0;
var itemClickEnabled=true;
try{var _ic=localStorage.getItem('pk_itemclick');itemClickEnabled=(_ic==null)||(_ic==='1');}catch(e){itemClickEnabled=true;}
function devUnlocked(){try{return localStorage.getItem('pk_dev_unlock')==='1';}catch(e){return false;}}
function setDevUnlock(v){try{if(v)localStorage.setItem('pk_dev_unlock','1');else localStorage.removeItem('pk_dev_unlock');}catch(e){}}
function devPanelOn(){try{return localStorage.getItem('pk_dev_panel')==='1';}catch(e){return false;}}
function setDevPanelOn(v){try{if(v)localStorage.setItem('pk_dev_panel','1');else localStorage.removeItem('pk_dev_panel');}catch(e){}}
function devPanelHTML(errMsg){
  if(!devPanelOn()){
    return '<div id="dev-status" class="dim" style="font-size:.72rem;margin-top:6px">'+(errMsg?esc(errMsg):'未解锁（输入密码后出现「全图鉴」与「随机模式」选项）')+'</div>';
  }
  var fullChk=devUnlocked()?' checked':'';
  var randChk=randomModeEnabled?' checked':'';
  var randContent=esc(randomModeContent());
  return '<div class="dim" style="font-size:.72rem;margin-top:6px">✨ 开发者选项已解锁</div>'+
    '<div class="set-title" style="margin-top:10px">全图鉴</div>'+
    '<div class="set-opts"><label class="set-opt"><input type="checkbox" data-toggle="devfull"'+fullChk+'>解锁全部图鉴（图鉴里可见全宝可梦）</label></div>'+
    '<div class="set-title" style="margin-top:10px">随机模式</div>'+
    '<div class="set-opts"><label class="set-opt"><input type="checkbox" data-toggle="randommode"'+randChk+'>随机宝可梦模式（开启→写入世界书条目，关闭→关闭该条目）</label></div>'+
    '<div class="set-opts"><textarea id="random-mode-content" style="'+DIY_INPUT_STYLE+'min-height:120px;resize:vertical">'+randContent+'</textarea></div>'+
    '<div class="dim" style="font-size:.72rem;margin:4px 0 6px">写入目标为「DIY → 写入世界书」所选的世界书；条目常驻（蓝灯），权重已调高（插入位置1·顺序'+RANDOM_MODE_ORDER+'，高于机制与随机遭遇条目）。规则文本可自行修改。</div>';
}
function bindDevPanel(){
  var df=pageOverlay.querySelector('input[data-toggle="devfull"]');
  if(df){df.addEventListener('change',function(){setDevUnlock(df.checked);});}
  var rm=pageOverlay.querySelector('input[data-toggle="randommode"]');
  if(rm){rm.addEventListener('change',function(){if(rm.checked){if(randomModeEnabled)return;randomModeOn();}else{if(!randomModeEnabled)return;randomModeOff();}});}
  var rmc=pageOverlay.querySelector('#random-mode-content');
  if(rmc){rmc.addEventListener('input',function(){randomModeSaveContent(rmc.value);});}
}
var ICON_CFG=[
  {id:'q-box',label:'快捷·盒子',src:'https://media.52poke.com/wiki/d/dd/Bag_%E5%AE%9D%E5%8F%AF%E6%A2%A6%E7%9B%92_Sprite.png',def:22},
  {id:'q-pokedex',label:'快捷·图鉴',src:'https://media.52poke.com/wiki/2/2d/%E5%AF%B6%E5%8F%AF%E5%A4%A2%E5%9C%96%E9%91%91_LPLE.png',def:16},
  {id:'q-breeding',label:'快捷·繁育',src:'https://media.52poke.com/wiki/1/1e/Spr_6x_Egg.png',def:16},
  {id:'q-typechart',label:'快捷·克制表',emoji:'⚡',def:15},
{id:'q-map',label:'快捷·地图',emoji:'🗺️',def:15},
  {id:'m-bag',label:'菜单·背包',src:'https://img.baibai.cv/f/3o2qte/1788188339193.png',def:30},
  {id:'m-box',label:'菜单·盒子',src:'https://media.52poke.com/wiki/d/dd/Bag_%E5%AE%9D%E5%8F%AF%E6%A2%A6%E7%9B%92_Sprite.png',def:30},
  {id:'m-breeding',label:'菜单·繁育',src:'https://media.52poke.com/wiki/1/1e/Spr_6x_Egg.png',def:20},
  {id:'m-pokedex',label:'菜单·图鉴',src:'https://media.52poke.com/wiki/2/2d/%E5%8F%AF%E5%A4%A2%E5%9C%96%E9%91%91_LPLE.png',def:30},
  {id:'m-rel',label:'菜单·人际关系',emoji:'💬',def:22},
  {id:'m-rivals',label:'菜单·劲敌',emoji:'👥',def:22},
  {id:'m-badge',label:'菜单·徽章盒',emoji:'🏅',def:22},
  {id:'m-diy',label:'菜单·DIY',emoji:'🛠️',def:22},
  {id:'m-map',label:'菜单·地图',emoji:'🗺️',def:22},
  {id:'m-settings',label:'菜单·设置',emoji:'⚙️',def:22}
];
function getIconSize(id){
  var c=ICON_CFG.find(function(x){return x.id===id;});
  var d=c?c.def:30;
  try{var m=JSON.parse(localStorage.getItem('pk_iconsize')||'{}');var v=m[id];return (v!=null&&!isNaN(Number(v)))?Number(v):d;}catch(e){return d;}
}
function iszIconHTML(c,sz){return c.src?'<img src="'+esc(c.src)+'" style="width:'+sz+'px;height:'+sz+'px;object-fit:contain;image-rendering:pixelated">':'<span style="font-size:'+sz+'px;line-height:1">'+esc(c.emoji)+'</span>';}
function iconSizeListHTML(){
  var h='';
  for(var i=0;i<ICON_CFG.length;i++){
    var c=ICON_CFG[i],sz=getIconSize(c.id);
    h+='<div class="item-entry" style="align-items:center"><span id="isz-pv-'+esc(c.id)+'" style="width:64px;height:64px;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden">'+iszIconHTML(c,sz)+'</span><span class="item-name">'+esc(c.label)+'</span><span style="display:flex;align-items:center;gap:6px;flex-shrink:0"><button class="btn-small" data-isz-minus="'+esc(c.id)+'">－</button><input type="number" id="isz-'+esc(c.id)+'" value="'+sz+'" min="8" max="60" style="width:50px;box-sizing:border-box;padding:4px 6px;font-family:inherit;font-size:.82rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none;text-align:center"><button class="btn-small" data-isz-plus="'+esc(c.id)+'">＋</button></span></div>';
  }
  return h;
}
var fabSize=54;
try{var _fs=parseInt(localStorage.getItem('pk_fabsize'),10);if(_fs>=40&&_fs<=100)fabSize=_fs;}catch(e){}
var inlineH=500;
try{var _ih=parseInt(localStorage.getItem('pk_inline_h'),10);if(_ih>=320&&_ih<=900)inlineH=_ih;}catch(e){}
function applyInlineH(el){
  el=el||document.getElementById('pkm-hud-inline');
  if(el){try{el.style.setProperty('--pkm-inline-h',inlineH+'px');}catch(e){}}
}
var FAB_IMG_DEFAULT='https://img.baibai.cv/f/n5n3fp/1788810124723.png';
var fabImg='';
try{fabImg=localStorage.getItem('pk_fabimg')||'';}catch(e){fabImg='';}
function applyFabSize(){
  var btn=document.getElementById('pkm-hud-btn');
  if(btn){
    btn.style.width=fabSize+'px';
    btn.style.height=fabSize+'px';
    btn.style.fontSize=Math.round(fabSize*0.48)+'px';
    var im=btn.querySelector('img');
    if(im){im.style.width=(fabSize-8)+'px';im.style.height=(fabSize-8)+'px';}
    try{
      var vw2=WIN.innerWidth||360, vh2=WIN.innerHeight||640;
      var l=parseFloat(btn.style.left)||0;
      var t=parseFloat(btn.style.top)||0;
      var nl=Math.max(0,Math.min(l,vw2-fabSize));
      var nt=Math.max(0,Math.min(t,vh2-fabSize));
      if(nl!==l||nt!==t){
        btn.style.left=nl+'px';
        btn.style.top=nt+'px';
        try{localStorage.setItem('pkm_fab_pos',JSON.stringify({l:nl,t:nt}));}catch(e){}
      }
    }catch(e){}
  }
  try{localStorage.setItem('pk_fabsize',String(fabSize));}catch(e){}
}
function openFabSize(){
  clearBack();
  overlay.innerHTML='<div class="modal" style="max-width:420px"><div class="modal-head"><div class="modal-name">悬浮球大小</div><button class="close" data-close>✕</button></div><div class="modal-body">'+
    '<div style="display:flex;align-items:center;justify-content:center;padding:14px 0"><span id="fab-pv" style="display:flex;align-items:center;justify-content:center;width:'+fabSize+'px;height:'+fabSize+'px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#5a7db0,#2b4a6f);border:2px solid #7d95b5;box-shadow:0 4px 14px rgba(0,0,0,.5),0 0 12px rgba(124,196,248,.35);overflow:hidden;color:#fff;font-size:26px"><img src="https://img.baibai.cv/f/n5n3fp/1788810124723.png" onerror="this.outerHTML=\'⚪\'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none"></span></div>'+
    '<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin:10px 0"><button class="btn-small" data-fab-minus>－</button><input type="number" id="fab-size" value="'+fabSize+'" min="40" max="100" style="width:80px;box-sizing:border-box;padding:6px 8px;font-family:inherit;font-size:.9rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none;text-align:center"><button class="btn-small" data-fab-plus>＋</button></div>'+
    '<div class="dim" style="font-size:.72rem;text-align:center;margin-bottom:4px">范围 40 ~ 100 px（默认 54）</div>'+
    '<div class="action-btns" style="margin-top:12px"><button class="act-btn" data-fab-apply>✔ 应用</button><button class="act-btn" data-fab-reset>↺ 恢复默认</button></div>'+
    '</div></div>';
  overlay.classList.add('open');
}
function fabStep(d){
  var v=Math.max(40,Math.min(100,fabSize+d));
  fabSize=v;
  var el=document.getElementById('fab-size');
  if(el)el.value=v;
  var pv=document.getElementById('fab-pv');
  if(pv){pv.style.width=v+'px';pv.style.height=v+'px';}
}
function fabApply(){
  var el=document.getElementById('fab-size');
  var v=el?parseInt(el.value,10):NaN;
  if(!isNaN(v))fabSize=Math.max(40,Math.min(100,v));
  applyFabSize();
  overlay.classList.remove('open');
  hudMsg('悬浮球大小已应用：'+fabSize+'px');
}
function fabReset(){
  fabSize=54;
  applyFabSize();
  overlay.classList.remove('open');
  hudMsg('悬浮球大小已恢复默认 54px');
}
function openInlineH(){
  clearBack();
  overlay.innerHTML='<div class="modal" style="max-width:420px"><div class="modal-head"><div class="modal-name">内嵌模式高度</div><button class="close" data-close>✕</button></div><div class="modal-body">'+
    '<div style="display:flex;align-items:center;justify-content:center;padding:10px 0"><span style="font-size:1rem;font-weight:800;color:var(--text)">内嵌内容区高度：<span id="inline-h-val2">'+inlineH+'</span> px</span></div>'+
    '<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin:10px 0"><button class="btn-small" data-inline-h-minus>－</button><input type="number" id="inline-h-num" value="'+inlineH+'" min="320" max="900" step="10" style="width:90px;box-sizing:border-box;padding:6px 8px;font-family:inherit;font-size:.9rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none;text-align:center"><button class="btn-small" data-inline-h-plus>＋</button></div>'+
    '<div class="dim" style="font-size:.72rem;text-align:center;margin-bottom:4px">范围 320 ~ 900 px（默认 500；手机窄屏默认 400，手动设置后所有宽度都用此值）</div>'+
    '<div class="action-btns" style="margin-top:12px"><button class="act-btn" data-inline-h-apply>✔ 应用</button><button class="act-btn" data-inline-h-reset>↺ 恢复默认</button></div>'+
    '</div></div>';
  overlay.classList.add('open');
}
function inlineHStep(d){
  inlineH=Math.max(320,Math.min(900,inlineH+d));
  var el=document.getElementById('inline-h-num');
  if(el)el.value=inlineH;
  var v=document.getElementById('inline-h-val2');
  if(v)v.textContent=inlineH;
}
function inlineHApply(){
  var el=document.getElementById('inline-h-num');
  var v=el?parseInt(el.value,10):NaN;
  if(!isNaN(v))inlineH=Math.max(320,Math.min(900,v));
  applyInlineH();
  try{localStorage.setItem('pk_inline_h',String(inlineH));}catch(e){}
  overlay.classList.remove('open');
  hudMsg('内嵌模式高度已应用：'+inlineH+'px');
}
function inlineHReset(){
  inlineH=500;
  applyInlineH();
  try{localStorage.setItem('pk_inline_h',String(inlineH));}catch(e){}
  overlay.classList.remove('open');
  hudMsg('内嵌模式高度已恢复默认 500px');
}
function applyFabImg(){
  var btn=document.getElementById('pkm-hud-btn');
  if(btn){
    var src=fabImg||FAB_IMG_DEFAULT;
    var im=btn.querySelector('img');
    if(!im){
      btn.textContent='';
      im=document.createElement('img');
      im.style.width=(fabSize-8)+'px';
      im.style.height=(fabSize-8)+'px';
      im.style.objectFit='cover';
      im.style.borderRadius='50%';
      im.style.pointerEvents='none';
      im.onerror=function(){this.remove();this.parentNode.textContent='⚪';};
      btn.appendChild(im);
    }
    im.src=src;
  }
  try{if(fabImg){localStorage.setItem('pk_fabimg',fabImg);}else{localStorage.removeItem('pk_fabimg');}}catch(e){}
}
function fabImgPreview(src){
  src=String(src||'').trim();
  var pv=document.getElementById('fab-img-pv');
  if(pv){pv.innerHTML='<img id="fab-img-pv-img" src="'+esc(src)+'" onerror="this.outerHTML=\'⚪\'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none">';}
}
function openFabImg(){
  clearBack();
  var cur=fabImg||FAB_IMG_DEFAULT;
  overlay.innerHTML='<div class="modal" style="max-width:460px"><div class="modal-head"><div class="modal-name">悬浮球图片</div><button class="close" data-close>✕</button></div><div class="modal-body">'+
    '<div style="display:flex;align-items:center;justify-content:center;padding:14px 0"><span id="fab-img-pv" style="display:flex;align-items:center;justify-content:center;width:'+fabSize+'px;height:'+fabSize+'px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#5a7db0,#2b4a6f);border:2px solid #7d95b5;box-shadow:0 4px 14px rgba(0,0,0,.5),0 0 12px rgba(124,196,248,.35);overflow:hidden;color:#fff;font-size:26px"><img id="fab-img-pv-img" src="'+esc(cur)+'" onerror="this.outerHTML=\'⚪\'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none"></span></div>'+
    '<div class="set-title" style="margin-left:0;margin-top:4px">选择图片</div>'+
    '<input type="text" id="fab-img-url" placeholder="粘贴图片链接（http/https 或 data:image/...）" value="'+esc(fabImg)+'" style="'+DIY_INPUT_STYLE+'">'+
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><button class="btn-small" id="fab-img-upload" type="button">📁 上传本地图片</button><input type="file" id="fab-img-file" accept="image/*" style="display:none"><span class="dim" style="font-size:.7rem">建议 ≤800KB</span></div>'+
    '<div class="action-btns" style="margin-top:10px"><button class="act-btn" data-fab-img-apply>✔ 应用</button><button class="act-btn" data-fab-img-preview>👁 预览</button><button class="act-btn" data-fab-img-reset>↺ 恢复默认</button></div>'+
    '</div></div>';
  overlay.classList.add('open');
  var file=document.getElementById('fab-img-file');
  var up=document.getElementById('fab-img-upload');
  if(up&&file){
    up.addEventListener('click',function(){file.click();});
    file.addEventListener('change',function(){
      if(!file.files||!file.files.length)return;
      var f=file.files[0];
      if(f.size>800*1024){hudMsg('图片超过 800KB，请换一张更小的');return;}
      var rd=new FileReader();
      rd.onload=function(){
        var data=String(rd.result||'');
        var url=document.getElementById('fab-img-url');
        if(url)url.value=data;
        fabImgPreview(data);
      };
      rd.readAsDataURL(f);
    });
  }
}
function fabImgApply(){
  var url=document.getElementById('fab-img-url');
  var v=url?url.value.trim():'';
  fabImg=v;
  applyFabImg();
  overlay.classList.remove('open');
  hudMsg(fabImg?'悬浮球图片已应用':'已恢复默认悬浮球图片');
}
function fabImgReset(){
  fabImg='';
  try{localStorage.removeItem('pk_fabimg');}catch(e){}
  applyFabImg();
  overlay.classList.remove('open');
  hudMsg('悬浮球图片已恢复默认');
}
function openIconSize(){
  clearBack();
  overlay.innerHTML='<div class="modal" style="max-width:480px"><div class="modal-head"><div class="modal-name">自定义图标大小</div><button class="close" data-close>✕</button></div><div class="modal-body">'+iconSizeListHTML()+'<div class="action-btns" style="margin-top:10px"><button class="act-btn" data-isz-apply>✔ 应用</button><button class="act-btn" data-isz-reset>↺ 恢复默认</button></div></div></div>';
  overlay.classList.add('open');
}
function iszStep(id,d){
  var el=document.getElementById('isz-'+id);
  if(!el)return;
  var v=(parseInt(el.value,10)||0)+d;
  v=Math.max(8,Math.min(60,v));
  el.value=v;
  var pv=document.getElementById('isz-pv-'+id);
  var c=ICON_CFG.find(function(x){return x.id===id;});
  if(pv&&c){pv.innerHTML=iszIconHTML(c,v);}
}
function iszApply(){
  try{
    var m={};
    for(var i=0;i<ICON_CFG.length;i++){
      var el=document.getElementById('isz-'+ICON_CFG[i].id);
      if(el){var v=parseInt(el.value,10);if(!isNaN(v)){v=Math.max(8,Math.min(60,v));m[ICON_CFG[i].id]=v;}}
    }
    localStorage.setItem('pk_iconsize',JSON.stringify(m));
  }catch(e){}
  overlay.classList.remove('open');
  render();
  resizeFrame();
}
function iszReset(){
  try{localStorage.removeItem('pk_iconsize');}catch(e){}
  overlay.classList.remove('open');
  render();
  resizeFrame();
}
function hudDiagSnapshot(){
  var lastErrors=(hudDiag.errors||[]).slice(-8).map(function(x){return {at:x.at,area:x.area,name:x.name,message:x.message};});
  return {
    version:PK_VER,
    uptimeMs:Date.now()-hudDiag.startedAt,
    activeRequests:hudDiag.activeRequests,
    maxActiveRequests:hudDiag.maxActiveRequests,
    timers:hudScope.timerCount,
    intervals:hudScope.intervalCount,
    observers:hudScope.observerCount,
    controllers:hudScope.controllerCount,
    cacheMemoryKeys:Object.keys(hudCacheMem||{}).length,
    diyObjectUrls:Object.keys(hudDiyBlobByRef||{}).length,
    locationIndex:(hudLocationIndex&&hudLocationIndex.size)||0,
    diyIndex:(hudDiyNameIndex&&hudDiyNameIndex.size)||0,
    stateRevision:hudStateRevision(),
    counters:pkmHudClone(hudDiag.counters||{}),
    errors:lastErrors
  };
}
try{WIN.__pkmHudDiagnostics=function(){return pkmHudClone(hudDiagSnapshot());};}catch(e){}
function diagInfo(){
  var d={styles:'?',cache:'?',scripts:'?',runtime:hudDiagSnapshot()};
  try{
    d.styles=0;
    document.querySelectorAll('style').forEach(function(s){if(s.textContent.indexOf('pkm-hud')>=0||s.textContent.indexOf('map-pin')>=0)d.styles++;});
  }catch(e){}
  try{
    var cnt=0,bytes=0;
    for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('pk_')===0){cnt++;bytes+=String(localStorage.getItem(k)||'').length;}}
    d.cache='localStorage '+cnt+'项 / '+Math.round(bytes/1024)+'KB · IDB内存索引 '+Object.keys(hudCacheMem||{}).length+'项';
  }catch(e){}
  try{
    var w=WIN,ST=w&&w.SillyTavern,ctx=ST&&ST.getContext?ST.getContext():null;
    var ch=ctx&&ctx.characters?ctx.characters[ctx.characterId]:null;
    var sc=(ch&&ch.data&&ch.data.extensions&&ch.data.extensions.tavern_helper&&ch.data.extensions.tavern_helper.scripts)||[];
    var n=0;sc.forEach(function(s){if(s&&s.content&&s.content.indexOf('pkm-hud-btn')>=0)n++;});
    d.scripts=n;
  }catch(e){}
  return d;
}
function diagHTML(){
  var d=diagInfo(),r=d.runtime||{},ok=(d.scripts===1&&d.styles===1),errs=r.errors||[],last=errs.length?errs[errs.length-1]:null,h='';
  h+='<div class="info-row"><span class="k">HUD脚本份数</span><span class="v">'+d.scripts+'（正常1）</span></div>';
  h+='<div class="info-row"><span class="k">HUD样式注入</span><span class="v">'+d.styles+'（正常1）</span></div>';
  h+='<div class="info-row"><span class="k">缓存占用</span><span class="v">'+esc(d.cache)+'</span></div>';
  h+='<div class="info-row"><span class="k">生命周期</span><span class="v">计时器 '+r.timers+' · 轮询 '+r.intervals+' · Observer '+r.observers+'</span></div>';
  h+='<div class="info-row"><span class="k">网络请求</span><span class="v">当前 '+r.activeRequests+' · 峰值 '+r.maxActiveRequests+'</span></div>';
  h+='<div class="info-row"><span class="k">索引</span><span class="v">精灵 '+r.locationIndex+' · DIY '+r.diyIndex+' · Rev '+esc(r.stateRevision||'-')+'</span></div>';
  h+='<div class="info-row"><span class="k">局部刷新</span><span class="v">'+Number((r.counters||{}).partialRenders||0)+' 次</span></div>';
  h+='<div class="info-row"><span class="k">最近错误</span><span class="v" style="color:'+(last?'#fbbf24':'#4ade80')+'">'+(last?esc(last.area+': '+last.message):'无')+'</span></div>';
  h+='<div class="info-row"><span class="k">诊断结论</span><span class="v" style="color:'+(ok?'#4ade80':'#f87171')+'">'+(ok?'✅ 运行结构正常':'⚠️ 检测到重复脚本/样式')+'</span></div>';
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn-small" data-diag-refresh>🔍 重新检测</button><button class="btn-small" data-diag-copy>📋 复制诊断</button><button class="btn-small" data-diag-clear>🧹 清错误日志</button></div>';
  return h;
}
function settingsHTML(){
  var opts=[['mv','招式缓存'],['pm','宝可梦预览缓存'],['sprite','队伍精灵图缓存'],['ab','特性缓存'],['dex','图鉴列表'],['fid','形态ID'],['item','道具缓存'],['seen','图鉴收集进度'],['all','全部缓存']];
  var radios=opts.map(function(o){return '<label class="set-opt"><input type="radio" name="pk-clear" value="'+o[0]+'"'+(clearTarget===o[0]?' checked':'')+' data-clear="'+o[0]+'">'+o[1]+'</label>';}).join('');
  var itemChk=itemClickEnabled?' checked':'';
var winChk=(winMode==='1')?' checked':'';
var inlineOpt=(winMode==='0')?'<label class="set-opt" style="cursor:default">内嵌模式高度：<b>'+inlineH+'</b> px</label><button class="act-btn" data-inline-h-open>📏 调整内嵌模式高度</button>':'';
var fabOpt=(winMode==='1')?'<button class="act-btn" data-fab-open>🔵 悬浮球大小</button><button class="act-btn" data-fab-img-open>🖼 悬浮球图片</button>':'';
return frame('设置','<div class="set-title">功能开关</div><div class="set-opts"><label class="set-opt"><input type="checkbox" data-toggle="itemclick"'+itemChk+'>点击道具查看效果</label></div><div class="set-title">界面模式</div><div class="set-opts"><label class="set-opt"><input type="checkbox" data-toggle="winmode"'+winChk+'>悬浮窗模式（关闭则显示在AI回复下方，刷新后生效）</label>'+inlineOpt+'</div><div class="set-title">图标</div><div class="set-opts"><button class="act-btn" data-isz-open>🎨 自定义图标大小</button>'+fabOpt+'</div><div class="set-title">清理缓存</div><div class="set-opts">'+radios+'</div><button class="act-btn" data-clear-start>清理所选缓存</button><div class="dim" style="font-size:.72rem;margin-top:8px">需连续确认 3 次；清理后缓存重新联网获取，图鉴进度只保留队伍和盒子里的</div><div class="set-title">运行诊断</div><div class="set-opts">'+diagHTML()+'</div><div class="set-title">脚本更新</div><div class="set-opts"><div class="info-row"><span class="k">当前版本</span><span class="v">v'+PK_VER+'</span></div>'+(pkHasUpdate?'<div class="info-row"><span class="k">新版本</span><span class="v" style="color:#ffe066">v'+esc(pkLatestVer||'')+' 可更新</span></div>':'')+'<button class="act-btn" data-pk-check-update>🔍 检查更新</button><button class="act-btn" data-pk-do-update style="display:none">⬆️ 更新到最新版</button><button class="act-btn" data-pk-show-content style="display:none">📄 复制新版内容（更新没成功可自行复制）</button><div id="pk-update-msg" class="dim" style="font-size:.72rem;margin-top:4px"></div></div><div class="set-title">开发者选项</div><div class="set-opts"><div style="display:flex;gap:6px;align-items:center"><input type="password" id="dev-pwd" placeholder="输入开发者密码" style="flex:1;min-width:0;padding:6px 10px;font-family:inherit;font-size:.85rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:4px;color:var(--text);outline:none"><button class="btn-small" data-dev-unlock>解锁</button></div><div id="dev-panel">'+devPanelHTML()+'</div></div>');
}
/* ===== 自动更新相关 ===== */
var pkLatestContent=null, pkLatestVer=null, pkLatestNotice='';
var pkHasUpdate=false;
function pkSetUpdateMsg(t){ try{ var m=document.getElementById('pk-update-msg'); if(m) m.textContent=t; }catch(e){} }
function applyFabUpdateBadge(){
  try{
    var btn=document.getElementById('pkm-hud-btn');
    if(!btn)return;
    var dot=btn.querySelector('.fab-update-dot');
    var show=(winMode==='1'&&pkHasUpdate);
    if(show){
      if(!dot){
        dot=document.createElement('span');
        dot.className='fab-update-dot';
        dot.title='发现新版本，点开悬浮窗可在设置里更新';
        btn.appendChild(dot);
      }
    }else if(dot&&dot.parentNode){
      dot.parentNode.removeChild(dot);
    }
  }catch(e){}
}
function pkReadUpdateCache(){
  try{
    var s=localStorage.getItem('pk_hasupdate')||'';
    var parts=s.split('>');
    if(parts.length===2&&parts[1]&&pkVerCompare(parts[1],PK_VER)>0){
      pkHasUpdate=true;
      pkLatestVer=parts[1];
    }
  }catch(e){}
}
function pkMarkHasUpdate(ver){
  pkHasUpdate=true;
  try{localStorage.setItem('pk_hasupdate',PK_VER+'>'+ver);}catch(e){}
  var items=document.querySelectorAll('.menu-item[data-page="settings"] .menu-label');
  for(var i=0;i<items.length;i++){
    if(!items[i].querySelector('.menu-badge')){
      var b=document.createElement('span');b.className='menu-badge';b.textContent='新';items[i].appendChild(b);
    }
  }
  applyFabUpdateBadge();
}
function pkAutoCheckUpdate(){
  try{
    hudFetch(PK_UPDATE_URL+'?t='+Date.now(), {cache:'no-store'})
      .then(function(r){ if(!r.ok) throw 0; return r.text(); })
      .then(function(txt){
        var m=txt.match(/PK_VER='([^']+)'/);
        var ver=m?m[1]:null;
        if(ver && pkVerCompare(ver,PK_VER)>0){
          pkLatestContent=txt;
          pkLatestVer=ver;
          var nm=txt.match(/\*PK_NOTICE_BEGIN([\s\S]*?)PK_NOTICE_END\*/);
          pkLatestNotice=nm?nm[1].replace(/^\s+|\s+$/g,''):'';
          pkMarkHasUpdate(ver);
        }
      })
      .catch(function(){});
  }catch(e){}
}
function showNoticeModal(ver,notice){
  var body='<div class="row"><span class="k">当前版本</span><span class="v">v'+PK_VER+'</span></div>'+
    '<div class="row"><span class="k">最新版本</span><span class="v">v'+esc(ver)+'</span></div>'+
    (notice?'<div class="row block"><span class="k">更新公告</span><span class="v" style="text-align:left;white-space:pre-wrap">'+esc(notice).replace(/\n/g,'<br>')+'</span></div>':'');
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">🎉 发现新版本 v'+esc(ver)+'</div><button class="close" data-close>✕</button></div><div class="modal-body">'+body+'<div class="action-btns" style="margin-top:10px"><button class="act-btn" data-notice-update>⬆️ 立即更新</button><button class="act-btn" data-close>稍后再说</button></div></div></div>';
  overlay.classList.add('open');
}
function openUpdateContent(){
  if(!pkLatestContent){ hudMsg('还没有检查到新版本'); return; }
  clearBack();
  var kb=Math.max(1,Math.round(pkLatestContent.length/1024));
  overlay.innerHTML='<div class="modal" style="max-width:480px"><div class="modal-head"><div class="modal-name">新版脚本内容 v'+esc(pkLatestVer||'?')+'</div><button class="close" data-close>✕</button></div><div class="modal-body">'+
    '<div class="row"><span class="k">内容大小</span><span class="v">约 '+kb+' KB</span></div>'+
    '<div class="dim" style="font-size:.72rem;margin-bottom:10px">内容较大，不再内嵌显示。点下面按钮复制后，到角色卡【扩展 → Tavern Helper 脚本】全选粘贴保存。</div>'+
    '<div class="action-btns"><button class="act-btn" data-pk-copy-content>📋 复制全部内容</button><button class="act-btn" data-pk-copy-content-close>📋 复制并关闭</button></div>'+
    '</div></div>';
  overlay.classList.add('open');
}
function pkCheckUpdate(){
  pkSetUpdateMsg('正在检查更新...');
  var updBtn=document.querySelector('[data-pk-do-update]');
  if(updBtn) updBtn.style.display='none';
  try{
    hudFetch(PK_UPDATE_URL+'?t='+Date.now(), {cache:'no-store'})
      .then(function(r){ if(!r.ok) throw 0; return r.text(); })
      .then(function(txt){
  pkLatestContent=txt;
  var m=txt.match(/PK_VER='([^']+)'/);
  pkLatestVer=m?m[1]:null;
  var nm=txt.match(/\*PK_NOTICE_BEGIN([\s\S]*?)PK_NOTICE_END\*/);
  pkLatestNotice=nm?nm[1].replace(/^\s+|\s+$/g,''):'';
  if(!pkLatestVer){ pkSetUpdateMsg('❌ 远程脚本里没有 PK_VER，请确认上传的是同一个脚本'); return; }
  if(pkVerCompare(pkLatestVer,PK_VER)<=0){ pkSetUpdateMsg('✅ 已是最新版本 v'+PK_VER); }
  else{ pkSetUpdateMsg('发现新版本 v'+pkLatestVer+'（当前 v'+PK_VER+'）'); if(updBtn) updBtn.style.display='block'; pkMarkHasUpdate(pkLatestVer); showNoticeModal(pkLatestVer,pkLatestNotice); }
})
      .catch(function(){ pkSetUpdateMsg('❌ 检查失败：网络问题或 PK_UPDATE_URL 地址不对'); });
  }catch(e){ pkSetUpdateMsg('❌ 检查失败：'+e.message); }
}
function pkUpdateScript(newContent){
  return new Promise(function(resolve){
    try{
      var ST = WIN.SillyTavern;
      var ctx = ST && ST.getContext ? ST.getContext() : null;
      if(!ctx || !ctx.characterId){ resolve({ok:false, msg:'❌ 读不到酒馆上下文'}); return; }
var char = null;
if(ctx.characters) char = ctx.characters[ctx.characterId];
if(!char && ctx.getOneCharacter){ try{ char = ctx.getOneCharacter(ctx.characterId); }catch(e){} }
if(!char){ resolve({ok:false, msg:'❌ 读不到当前角色'}); return; }
      var ext = (char.data && char.data.extensions) || char.extensions;
      if(!ext || !ext.tavern_helper || !Array.isArray(ext.tavern_helper.scripts)){ resolve({ok:false, msg:'❌ 找不到 tavern_helper.scripts'}); return; }
      var scripts = ext.tavern_helper.scripts;
      var idx = -1;
      for(var i=0;i<scripts.length;i++){
        var s = scripts[i];
        if(s && typeof s.content==='string' && s.content.indexOf('PK_VER')>=0 && s.content.indexOf('pkm-hud-btn')>=0){ idx = i; break; }
      }
      if(idx<0){
        for(var j=0;j<scripts.length;j++){
          var s2 = scripts[j];
          if(s2 && typeof s2.content==='string' && s2.content.indexOf('pkm-hud-btn')>=0 && /hud/i.test(s2.name||'')){ idx = j; break; }
        }
      }
      if(idx<0){ resolve({ok:false, msg:'❌ 脚本列表里没找到 HUD 脚本（可能特征没匹配上）'}); return; }
      scripts[idx].content = newContent;
      pkSaveCharacter(char).then(function(saved){
  resolve(saved ? {ok:true, msg:'✅ 已更新到 v'+pkLatestVer+'，请刷新页面生效'} : {ok:false, msg:'❌ 保存角色卡失败（接口没返回成功）'});
}).catch(function(err){
  resolve({ok:false, msg:'❌ 保存失败：'+(err && err.message ? err.message : err)});
});
    }catch(e){ resolve({ok:false, msg:'❌ 异常: '+e.message}); }
  });
}

function pkGetCsrf(){
  return new Promise(function(resolve){
    var done=false;
    function fin(t){ if(!done){ done=true; resolve(t||''); } }
    getCsrfToken(fin);
    hudScope.setTimeout(function(){ fin(''); }, 3000);
  });
}
function pkSaveCharacter(char){
  try{
    var top = char || {};
    var data = (top.data && typeof top.data === 'object') ? top.data : top;
    var ext = data.extensions || top.extensions || {};
    var name = data.name || top.name || '';
    if(!name) return Promise.resolve(false);

    var fd = new WIN.FormData();
    fd.append('ch_name', name);
    fd.append('avatar_url', top.avatar || data.avatar || '');
    fd.append('description', data.description || '');
    fd.append('personality', data.personality || '');
    fd.append('scenario', data.scenario || '');
    fd.append('first_mes', data.first_mes || '');
    fd.append('mes_example', data.mes_example || '');
    fd.append('creator_notes', data.creator_notes || '');
    fd.append('creator', data.creator || '');
    fd.append('character_version', data.character_version || '');
    fd.append('system_prompt', data.system_prompt || '');
    fd.append('post_history_instructions', data.post_history_instructions || '');
    fd.append('alternate_greetings', JSON.stringify(data.alternate_greetings || []));
    fd.append('tags', JSON.stringify(data.tags || []));
    fd.append('character_book', JSON.stringify(data.character_book || null));
    fd.append('extensions', JSON.stringify(ext));
    fd.append('chat', top.chat || data.chat || '');
    fd.append('create_date', top.create_date || data.create_date || '');
    fd.append('talkativeness', (data.talkativeness != null) ? String(data.talkativeness) : '0.5');
    fd.append('fav', (top.fav || data.fav) ? 'true' : 'false');

    return pkGetCsrf().then(function(token){
      var headers = {};
      if(token){
        headers['X-CSRF-Token'] = token;
        fd.append('_csrf', token);
      }
      function post(url){
        return hudFetch(url, {method:'POST', body:fd, headers:headers}).then(function(r){
          if(r.ok) return true;
          return r.text().then(function(t){ throw new Error('HTTP '+r.status+(t?'：'+t:'')); });
        });
      }
      return post('/api/characters/edit').catch(function(){ return post('/editcharacter'); });
    });
  }catch(e){
    return Promise.resolve(false);
  }
}
function pkClearHasUpdate(){
  pkHasUpdate=false;
  try{localStorage.removeItem('pk_hasupdate');}catch(e){}
  try{
    var items=document.querySelectorAll('.menu-item[data-page="settings"] .menu-label .menu-badge');
    for(var i=0;i<items.length;i++){items[i].parentNode.removeChild(items[i]);}
  }catch(e){}
  applyFabUpdateBadge();
}
function pkDoUpdate(){
  if(!pkLatestContent){ pkSetUpdateMsg('请先检查更新'); return; }
  if(!pkLatestVer){ pkSetUpdateMsg('❌ 新版版本号缺失，无法安装'); return; }
  if(pkVerCompare(pkLatestVer,PK_VER)<=0){ pkSetUpdateMsg('✅ 已是 v'+PK_VER+' 或更高版本'); return; }
  pkSetUpdateMsg('正在更新...');
  pkInstallRecord(pkLatestVer,pkLatestContent).then(function(){
    pkClearHasUpdate();
    var updBtn=document.querySelector('[data-pk-do-update]');
    if(updBtn)updBtn.style.display='none';
    /* 同时把角色卡里的脚本内容更新成最新版（重新导入/分享时就是新版） */
    try{
      pkUpdateScript(pkLatestContent).then(function(res){
        if(res&&res.ok){
          pkSetUpdateMsg('✅ 已更新到 v'+pkLatestVer+'，角色卡脚本内容也已更新，刷新页面生效。');
        }else{
          pkSetUpdateMsg('✅ 新版已保存到本地（下次刷新自动切换），但角色卡脚本内容更新失败：'+(res&&res.msg?res.msg:'未知')+'。可点「复制新版内容」手动粘贴。');
          var sc=document.querySelector('[data-pk-show-content]');
          if(sc)sc.style.display='block';
        }
      });
    }catch(e){
      pkSetUpdateMsg('✅ 新版已保存到本地（下次刷新自动切换），但角色卡脚本内容更新失败。可点「复制新版内容」手动粘贴。');
      var sc=document.querySelector('[data-pk-show-content]');
      if(sc)sc.style.display='block';
    }
  }).catch(function(err){
    pkSetUpdateMsg('❌ 保存失败：'+(err&&err.message?err.message:err)+'。请点「复制新版内容」手动更新。');
    var sc=document.querySelector('[data-pk-show-content]');
    if(sc)sc.style.display='block';
  });
}

function recordOwnedOnly(){
  var s={},sf={},o=ownedSpecies(),of=ownedFull(),k;
  for(k in o){s[k]=1;}
  for(k in of){sf[k]=1;}
  try{localStorage.setItem(seenKey(),JSON.stringify(s));}catch(e){}
  try{localStorage.setItem(seenFullKey(),JSON.stringify(sf));}catch(e){}
}
function doClear(target){
  try{
    if(target==='seen'){recordOwnedOnly();setDevUnlock(false);var dp=document.querySelector('#dev-panel');if(dp){dp.innerHTML=devPanelHTML();bindDevPanel();}return;}
    if(target==='sprite'){
      pkmSpriteCache={};pkmSlugCache={};pkmDexCache={};hudCacheDeletePrefixes(['pk_sprite_','pk_slug_','pk_ndex_','pk_ps_','pk_psf_']);
      var dels=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&(/^(?:pk_sprite_|pk_slug_|pk_ndex_|pk_ps_|pk_psf_)/).test(k))dels.push(k);}dels.forEach(function(k){try{localStorage.removeItem(k);}catch(e){}});return;
    }
    if(target==='item'){
      itemListCache=null;itemSpriteCache={};itemCache={};hudCacheDeletePrefixes(['pk_item_','pk_itemlist','pk_itemimg_']);
      var deli=[];for(var i2=0;i2<localStorage.length;i2++){var k2=localStorage.key(i2);if(k2&&(k2.indexOf('pk_item_')===0||k2==='pk_itemlist'||k2.indexOf('pk_itemimg_')===0))deli.push(k2);}deli.forEach(function(k){try{localStorage.removeItem(k);}catch(e){}});return;
    }
    var map={mv:'pk_mv_',pm:'pk_pm_',ab:'pk_ab_',dex:'pk_dexlist',fid:'pk_fid_'};
    var pre=target==='all'?['pk_mv_','pk_pm_','pk_ab_','pk_dexlist','pk_fid_','pk_item_','pk_itemlist','pk_itemimg_','pk_sprite_','pk_slug_','pk_ndex_','pk_ps_','pk_psf_','pk_abilist']:[map[target]];
    hudCacheDeletePrefixes(pre.filter(Boolean));
    var del=[];
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(!k)continue;
      for(var j=0;j<pre.length;j++){if(k.indexOf(pre[j])===0){del.push(k);break;}}
    }
    del.forEach(function(k){try{localStorage.removeItem(k);}catch(e){}});
    if(target==='all'||target==='mv')moveCache={};
    if(target==='all'||target==='pm')pkmCache={};
    if(target==='all'||target==='ab')abiCache={};
    if(target==='all'||target==='dex')dexCache=null;
    if(target==='all'||target==='fid')formIdCache={};
    if(target==='all'){itemListCache=null;itemSpriteCache={};itemCache={};pkmSpriteCache={};pkmSlugCache={};pkmDexCache={};}
  }catch(e){}
}
function confirmClearModal(){
  var names={mv:'招式',pm:'宝可梦预览',sprite:'队伍精灵图',ab:'特性',dex:'图鉴列表',fid:'形态ID',item:'道具',seen:'图鉴收集进度',all:'全部'};
  clearStep++;
  if(clearStep>=3){
    doClear(clearTarget);
    overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">已清理</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="row"><span class="v">「'+(names[clearTarget]||'')+'」缓存已清理完成。</span></div></div></div>';
    clearStep=0;
    overlay.classList.add('open');
    return;
  }
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">确认清理（'+clearStep+'/3）</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="row"><span class="v">确认清理「'+(names[clearTarget]||'')+'」缓存？</span></div><div class="action-btns"><button class="act-btn" data-clear-confirm>✔ 确认（第 '+clearStep+' 次）</button><button class="act-btn" data-close>取消</button></div></div></div>';
  overlay.classList.add('open');
}
function pageContent(key){switch(key){case 'bag':return bagHTML();case 'box':return boxHTML();case 'rel':return relHTML();case 'rivals':return rivalsHTML();case 'breeding':return breedingHTML();case 'pokedex':return pokedexHTML();case 'badge':return badgePageHTML();case 'diy':return diyHTML();case 'map':return mapHTML();case 'settings':return settingsHTML();case 'typechart':return typeChartHTML();default:return '<div class="empty">暂无</div>';}}
function pageHTML(title,content){var mapCtl=(title==='地图')?'<button type="button" class="map-pad-toggle'+(mapManualControlsOpen?' on':'')+'" data-map-pad-toggle title="显示/隐藏地图方向与缩放按钮" aria-label="显示或隐藏地图方向与缩放按钮">🎮</button>':'';return '<div class="page"><div class="page-head">'+mapCtl+'<button class="page-close" data-page-close>✕</button></div><div class="page-body">'+content+'</div></div>';}

var overlay,pageOverlay,cards,pageOverlayHost=null;
/* v1.8.5：模态隔离与点击穿透保护。
 * - 子容器打开时让 HUD 后层 inert / pointer-events:none；
 * - 手势结束后的兼容 click 只吞“落到 HUD 之外”的，HUD 自身（悬浮球/窗口/遮罩/弹层）里的点击一律放行，
 *   避免打开/关闭后短时间内第一次点击被误吞（需点两次才打开）。
 */
var hudGestureShieldUntil=0,hudGestureShieldOrigin=null,hudModalIsolationObserver=null;
function hudArmGestureShield(origin,ms){
  hudGestureShieldOrigin=origin||null;
  hudGestureShieldUntil=Date.now()+Math.max(250,Number(ms)||700);
}
function hudDisarmGestureShield(){
  hudGestureShieldOrigin=null;
  hudGestureShieldUntil=0;
}
function hudGhostClickGuard(e){
  if(Date.now()>hudGestureShieldUntil)return;
  var t=e&&e.target;
  try{
    if(t&&t.nodeType!==1)t=t.parentElement;
    if(t&&t.closest&&t.closest('#pkm-hud-win,#pkm-hud-inline,#pkm-hud-btn,#pkm-hud-mapfab,#pkm-hud-mask,#pkm-hud-close,.pkm-hud-overlay,.pkm-hud-page-overlay'))return;
  }catch(_e){}
  var o=hudGestureShieldOrigin;
  try{if(o&&o.isConnected&&t&&(o===t||o.contains(t)))return;}catch(_e2){}
  try{if(e.cancelable)e.preventDefault();}catch(_e3){}
  try{e.stopPropagation();}catch(_e4){}
  try{e.stopImmediatePropagation();}catch(_e5){}
}
hudScope.listen(document,'click',hudGhostClickGuard,true);
function hudSetInert(el,on){
  if(!el)return;
  try{el.inert=!!on;}catch(_e){}
  if(on)el.setAttribute('data-hud-modal-inert','1');else el.removeAttribute('data-hud-modal-inert');
}
function hudSyncModalIsolation(){
  var host=pageOverlayHost;
  var pageOpen=!!(pageOverlay&&pageOverlay.classList.contains('open'));
  var modalOpen=!!(overlay&&overlay.classList.contains('open'));
  var mapBody=!!(pageOpen&&pageOverlay&&pageOverlay.classList.contains('map-focus')&&pageOverlay.parentElement===document.body);
  if(host){
    try{host.classList.toggle('modal-child-open',modalOpen);host.classList.toggle('page-child-open',pageOpen&&!modalOpen&&pageOverlay&&pageOverlay.parentElement===host);}catch(_e){}
    try{
      Array.prototype.forEach.call(host.children,function(ch){
        var keep=modalOpen?(ch===overlay):(pageOpen&&pageOverlay&&pageOverlay.parentElement===host?(ch===pageOverlay):true);
        hudSetInert(ch,!keep);
      });
    }catch(_e2){}
    /* 地图 popout 已移到 body，可以把原 HUD host 整体 inert；地图自己不在 host 里。 */
    try{hudSetInert(host,mapBody);}catch(_e3){}
  }
  try{
    var hw=document.getElementById('pkm-hud-win');
    if(hw&&(!host||!hw.contains(host)))hudSetInert(hw,mapBody);
  }catch(_e4){}
}
function hudBindModalIsolation(){
  try{if(hudModalIsolationObserver)hudModalIsolationObserver.disconnect();}catch(_e){}
  try{
    hudModalIsolationObserver=hudScope.observe(new MutationObserver(function(){hudSyncModalIsolation();}));
    if(overlay)hudModalIsolationObserver.observe(overlay,{attributes:true,attributeFilter:['class']});
    if(pageOverlay)hudModalIsolationObserver.observe(pageOverlay,{attributes:true,attributeFilter:['class']});
  }catch(_e2){hudModalIsolationObserver=null;}
  hudSyncModalIsolation();
}
var currentPageKey='';
var quickMapFromFab=false;
var hudActionCard=null;
var hudConfirmCb=null;
var currentDetailCard=null;

var CMDS=[['🏋️ 特训','洛托姆，帮我找个地方进行特训。','可指定方向：学会某个招式、赚钱、针对某项六维的专项特训'],['💨 快躲开','快躲开！（羁绊）使用XX攻击！','敌方招式必MISS，速度+1、闪避+1'],['⚡ 趁现在','趁现在！（羁绊）使用XX！','必先手、必暴击'],['🛡️ 坚持住','坚持住！（羁绊）使用XX！','清除异常状态，防御+1、特防+1，恢复30%最大HP'],['🔥 站起来','站起来！（羁绊）使用XX！','倒下的宝可梦复苏至HP1，攻击+1、特攻+1，本回合锁血'],['✨ 羁绊Mega','回应我的呼唤吧，Mega进化！（羁绊Mega，无需道具）然后使用XX！','搭档且亲密度≥200时，无需钥石与Mega石即可超进化'],['⚔️ 招式对抗','用XX对抗敌人的招式！（招式对抗）','无视先后手，两招正面相撞。不计算克制的攻防伤害相互抵消，僵持(差≤20%)双方受伤（差值+5），差>20%高方命中(用差值伤害)']];var cmdOpen=false;function cmdPanelHTML(){var rows=CMDS.map(function(c){return '<div class="cmd-row"><button class="cmd-btn" data-cmd="'+esc(c[1])+'" title="'+esc(c[2])+'">'+esc(c[0])+'</button><button class="cmd-tip" data-tip="'+esc(c[0])+'｜'+esc(c[2])+'" title="'+esc(c[2])+'">?</button></div>';}).join('');return '<details class="cmd-panel"'+(cmdOpen?' open':'')+'><summary>⌨️ 快捷指令 · 点击填入输入栏</summary><div class="cmd-note">羁绊每只每场限1次；亲密度≥200且未成为搭档时触发羁绊可觉醒搭档。把指令里的 XX 换成招式名再发送</div>'+rows+'</details>';}function bindCmdPanel(){/* v1.8.0：快捷指令由 HUD 根节点事件委托处理 */}function fillInput(text){try{var w=WIN;var ta=w.document.querySelector('#send_textarea');if(ta){var cur=String(ta.value||'').replace(/\s+$/,'');var val=cur?cur+'\n'+text:text;ta.value=val;ta.dispatchEvent(new Event('input',{bubbles:true}));ta.focus();try{var i=val.indexOf('XX',cur.length);if(i<0){ta.setSelectionRange(val.length,val.length);}else{ta.setSelectionRange(i,i+2);}}catch(e2){}return true;}}catch(e){}return false;}var hudPendingActions=[];
var hudActionInjected=null;
var hudCleanupBound=false;
var hudCmdOpen=false;
var hudCmdSeq=0;

function hudCmdBarHTML(){
  if(!hudPendingActions.length) return '';
  var head='<div class="info-frame plain-frame" style="margin-bottom:10px">'+
    '<div class="info-inner"><div class="info-title" style="cursor:pointer" data-hud-cmd-toggle>'+
    '下回合执行命令（'+hudPendingActions.length+'）'+
    '<span style="float:right;font-size:.8rem;color:var(--dim)">'+(hudCmdOpen?'收起 ▲':'展开 ▼')+'</span>'+
    '</div>';
  var list='';
  if(hudCmdOpen){
    list='<div id="hud-cmd-list">';
    for(var i=0;i<hudPendingActions.length;i++){
      var a=hudPendingActions[i];
      list+='<div class="nearby-item" style="cursor:default">'+
        '<div class="nearby-info"><div class="nearby-name" style="font-size:.8rem">'+esc(a.display || a.text)+'</div></div>'+
        '<button class="btn-small" data-hud-cmd-remove="'+a.id+'" style="color:#fff;background:rgba(180,60,60,.7);border-color:#f05060">✕</button>'+
      '</div>';
    }
    list+='</div>';
  }
  return head+list+'</div></div>';
}

function hudClearInjected(){
  try{
    var w=WIN;
    var ST=w&&w.SillyTavern;
    var ctx=ST&&ST.getContext?ST.getContext():null;
    if(ctx&&typeof ctx.setExtensionPrompt==='function'&&hudActionInjected){
      ctx.setExtensionPrompt(hudActionInjected,'');
    }
  }catch(e){}
  hudActionInjected=null;
}

function hudClearAll(){
  hudClearInjected();
  hudPendingActions=[];
  hudCleanupBound=false;
  hudCmdOpen=false;
}

var hudCleanupUnsub=null;
function hudBindCleanup(ctx){
  if(hudCleanupBound)return;
  hudCleanupBound=true;
  try{
    var ev=ctx.eventTypes&&(ctx.eventTypes.MESSAGE_RECEIVED||ctx.eventTypes.MESSAGE_SENT||'message_received');
    if(ctx.eventSource&&ev){
      var fired=false,done=function(){
        if(fired)return;fired=true;
        try{if(hudCleanupUnsub)hudCleanupUnsub();}catch(e){}hudCleanupUnsub=null;
        hudClearAll();render();resizeFrame();
      };
      if(typeof ctx.eventSource.once==='function'){
        ctx.eventSource.once(ev,done);
        hudCleanupUnsub=function(){try{if(typeof ctx.eventSource.off==='function')ctx.eventSource.off(ev,done);else if(typeof ctx.eventSource.removeListener==='function')ctx.eventSource.removeListener(ev,done);}catch(e){}};
      }else if(typeof ctx.eventSource.on==='function'){
        ctx.eventSource.on(ev,done);
        hudCleanupUnsub=function(){try{if(typeof ctx.eventSource.off==='function')ctx.eventSource.off(ev,done);else if(typeof ctx.eventSource.removeListener==='function')ctx.eventSource.removeListener(ev,done);}catch(e){}};
      }
    }
  }catch(e){hudDiagError('HUD cleanup bind',e);}
  hudScope.setTimeout(function(){try{if(hudCleanupUnsub)hudCleanupUnsub();}catch(e){}hudCleanupUnsub=null;hudClearAll();render();resizeFrame();},120000);
}

function hudRefreshInjection(){
  hudClearInjected();
  if(!hudPendingActions.length){ hudCleanupBound=false; return true; }

  var parts=['【HUD操作指令 · 请依次执行以下操作】'];
  for(var i=0;i<hudPendingActions.length;i++){
    parts.push((i+1)+'. '+hudPendingActions[i].text);
  }
  parts.push('全部执行完成后，请更新状态栏/MVU。');
  var text=parts.join('\n');

  try{
    var w=WIN;
    var ST=w&&w.SillyTavern;
    var ctx=ST&&ST.getContext?ST.getContext():null;
    if(!ctx||typeof ctx.setExtensionPrompt!=='function') return false;

    var id='pkmn_hud_action';
    hudActionInjected=id;

    try{ ctx.setExtensionPrompt(id, text, 1, 0, false, 1); }
    catch(e1){
      try{ ctx.setExtensionPrompt(id, text, 1, 0, false); }
      catch(e2){ return false; }
    }

    hudBindCleanup(ctx);
    return true;
  }catch(e){}
  return false;
}

function hudSend(text, undo, display){
  hudPendingActions.push({id:'hudc'+(++hudCmdSeq)+'_'+Date.now(), text:text, display:display||text, undo:undo||function(){}});
  /* 本地 HUD 操作发生后立即把当前 stat_data 写回 MVU。
     setExtensionPrompt 仍保留，用于让后续 AI 剧情继续遵守这些变化。 */
  try{pkmHudPersistStatData();}catch(e){}
  if(!hudRefreshInjection()){
    hudMsg('当前环境无法静默注入，操作仅更新本地显示');
  }
}

function hudRemoveAction(id){
  for(var i=0;i<hudPendingActions.length;i++){
    if(hudPendingActions[i].id===id){
      var a=hudPendingActions.splice(i,1)[0];
      try{ a.undo(); }catch(e){}
      break;
    }
  }
  try{pkmHudPersistStatData();}catch(e){}
  hudRefreshInjection();
  render(); resizeFrame();
}

function bindHudCmdBar(){/* v1.8.0：主页命令栏由根节点事件委托处理 */}

function bindPageInteractions(){
  pageOverlay.querySelectorAll('.box-cell[data-slot]').forEach(function(el){el.addEventListener('click',function(){var boxNum=el.getAttribute('data-box');var slot=el.getAttribute('data-slot');var p=stat_data.盒子[boxNum]&&stat_data.盒子[boxNum][slot];if(p){preloadMoves(p.技能);currentDetailCard=cardFromPkm(p,slot,'box',boxNum);clearBack();overlay.innerHTML=detailHTML(currentDetailCard);overlay.classList.add('open');pkImgFix(overlay);resolvePkmImgs(overlay);resolveMoveTypes(overlay);resolveItemImgs(overlay);}});});
pageOverlay.querySelectorAll('.nearby-cell[data-nearby]').forEach(function(el){el.addEventListener('click',function(){var key=el.getAttribute('data-nearby');var p=stat_data.附近宝可梦&&stat_data.附近宝可梦[key];if(p){clearBack();overlay.innerHTML=actionHTML(p,key);overlay.classList.add('open');pkImgFix(overlay);resolvePkmImgs(overlay);}});});
  pageOverlay.querySelectorAll('.bag-tab[data-bag]').forEach(function(btn){btn.addEventListener('click',function(){activeBag=btn.getAttribute('data-bag');pageOverlay.querySelectorAll('.bag-tab').forEach(function(b){b.classList.toggle('active',b===btn);});var list=pageOverlay.querySelector('#bag-list');if(list){list.innerHTML=bagItemsHTML();resolveItemImgs(pageOverlay);}});});
  pageOverlay.querySelectorAll('.badge-tab[data-bregion]').forEach(function(b){b.addEventListener('click',function(){badgeSel=b.getAttribute('data-bregion');try{localStorage.setItem('pk_badge_sel',JSON.stringify({region:badgeSel}));}catch(e){}var pg=pageOverlay.querySelector('.page');var oldTabs=pageOverlay.querySelector('.badge-tabs');var pageTop=pg?pg.scrollTop:0;var tabsLeft=oldTabs?oldTabs.scrollLeft:0;pageOverlay.querySelector('.page-body').innerHTML=badgePageHTML();bindPageInteractions();if(pg){pg.scrollTop=pageTop;}var newTabs=pageOverlay.querySelector('.badge-tabs');if(newTabs){newTabs.scrollLeft=tabsLeft;}});});
  pageOverlay.querySelectorAll('[data-bag-discard]').forEach(function(btn){btn.addEventListener('click',function(e){e.stopPropagation();discardBagItemAsk(btn.getAttribute('data-bag-discard'));});});
var bn=pageOverlay.querySelector('[data-box-new]');
if(bn){bn.addEventListener('click',function(e){e.stopPropagation();openNewBoxModal();});}
var bd=pageOverlay.querySelector('[data-box-del]');
if(bd){bd.addEventListener('click',function(e){e.stopPropagation();openDeleteBoxConfirm();});}
var bs=pageOverlay.querySelector('#box-select');if(bs){bs.addEventListener('change',function(){activeBox=bs.value;pageOverlay.querySelector('.page-body').innerHTML=boxHTML();bindPageInteractions();});}
  var si=pageOverlay.querySelector('#dex-search-input');
if(si){si.addEventListener('input',dexSearch);}
pageOverlay.querySelectorAll('[data-dexregion]').forEach(function(b){b.addEventListener('click',function(){dexRegion=b.getAttribute('data-dexregion');pageOverlay.querySelectorAll('[data-dexregion]').forEach(function(x){x.classList.toggle('active',x===b);});renderDexRegion();});});
  pageOverlay.querySelectorAll('input[data-clear]').forEach(function(r){r.addEventListener('change',function(){if(r.checked)clearTarget=r.getAttribute('data-clear');});});
var ic=pageOverlay.querySelector('input[data-toggle="itemclick"]');
if(ic){ic.addEventListener('change',function(){itemClickEnabled=ic.checked;try{localStorage.setItem('pk_itemclick',itemClickEnabled?'1':'0');}catch(e){}});}
var wm=pageOverlay.querySelector('input[data-toggle="winmode"]');
if(wm){wm.addEventListener('change',function(){winMode=wm.checked?'1':'0';try{localStorage.setItem('pk_winmode',winMode);}catch(e){}});}
  var cs=pageOverlay.querySelector('[data-clear-start]');
if(cs){cs.addEventListener('click',function(e){e.stopPropagation();clearStep=0;confirmClearModal();});}
pageOverlay.querySelectorAll('[data-diy-tab]').forEach(function(b){b.addEventListener('click',function(){diyType=b.getAttribute('data-diy-tab');pageOverlay.querySelectorAll('[data-diy-tab]').forEach(function(x){x.classList.toggle('active',x===b);});var f=pageOverlay.querySelector('#diy-form');if(f)f.innerHTML=diyFormHTML(diyType);var l=pageOverlay.querySelector('#diy-list');if(l)l.innerHTML=diyListHTML(diyType);});});
var df=pageOverlay.querySelector('#diy-form');if(df){df.addEventListener('click',function(e){if(e.target.closest('[data-diy-add]')){diyAdd(diyType);}else if(e.target.closest('[data-diy-clear]')){diyClearStart();}else if(e.target.closest('[data-diy-add-type]')){diyAddType();}else if(e.target.closest('[data-diy-evo-add]')){diyEvoAddPage();}else if(e.target.closest('[data-diy-evo-add-type]')){diyEvoAddType(e.target.closest('[data-diy-evo-add-type]').getAttribute('data-diy-evo-add-type'));}else if(e.target.closest('[data-diy-evo-addbranch]')){diyEvoAddBranch(e.target.closest('[data-diy-evo-addbranch]').getAttribute('data-diy-evo-addbranch'));}else if(e.target.closest('[data-diy-evo-delbranch]')){var db=e.target.closest('[data-diy-evo-delbranch]').getAttribute('data-diy-evo-delbranch').split('|');diyEvoDelBranch(db[0],db[1]);}else if(e.target.closest('[data-diy-evo-adddesc]')){diyEvoToggleDesc(e.target.closest('[data-diy-evo-adddesc]').getAttribute('data-diy-evo-adddesc'));}else if(e.target.closest('[data-diy-evo-upload]')){diyEvoUpload(e.target.closest('[data-diy-evo-upload]').getAttribute('data-diy-evo-upload'));}else if(e.target.closest('[data-diy-evo-vision]')){diyEvoVision(e.target.closest('[data-diy-evo-vision]').getAttribute('data-diy-evo-vision'));}else if(e.target.closest('[data-diy-item-upload]')){diyItemUpload();}});df.addEventListener('input',function(e){if(e.target&&e.target.id==='diy-ability-search'){diyFilterAbility();}if(e.target&&e.target.id&&e.target.id.indexOf('evo-abi-search-')===0){diyEvoFilterAbility(parseInt(e.target.id.replace('evo-abi-search-',''),10));}if(e.target&&e.target.id&&e.target.id.indexOf('evo-name-')===0){diyEvoSyncNext();}if(e.target&&e.target.id&&e.target.id.indexOf('evo-desc-')===0){diyEvoDescAutosize(parseInt(e.target.id.replace('evo-desc-',''),10));}});df.addEventListener('change',function(e){if(e.target&&e.target.id==='diy-item-img-file'){diyItemFileChange(e.target);}if(e.target&&e.target.id&&e.target.id.indexOf('evo-img-file-')===0){diyEvoFileChange(e.target);}if(e.target&&e.target.id==='diy-ability-cat'){diyAbilityCat=e.target.value;var w=document.getElementById('diy-ability-wrap');if(w)w.innerHTML=diyAbilityWrapHTML();if(diyAbilityCat==='orig'){diyLoadAbiOptions();}}if(e.target&&e.target.id&&e.target.id.indexOf('evo-abi-cat-')===0){var p=parseInt(e.target.id.replace('evo-abi-cat-',''),10);diyEvoAbiCats[p]=e.target.value;var w2=document.getElementById('evo-abi-wrap-'+p);if(w2)w2.innerHTML=diyEvoAbiWrapHTML(p);if(diyEvoAbiCats[p]==='orig'){diyEvoLoadAbiOptions(p);}}});diyLoadAbiOptions();}
var dl=pageOverlay.querySelector('#diy-list');if(dl){dl.addEventListener('click',function(e){var del=e.target.closest('[data-diy-del]');if(del){diyDelStart(diyType,del.getAttribute('data-diy-del'));return;}var sh=e.target.closest('[data-diy-share]');if(sh){diyShare(diyType,sh.getAttribute('data-diy-share'));return;}var vw=e.target.closest('[data-diy-view]');if(vw){diyView(diyType,vw.getAttribute('data-diy-view'));}});}
var dib=pageOverlay.querySelector('[data-diy-import]');if(dib){dib.addEventListener('click',function(e){e.stopPropagation();diyImport();});}
var dii=pageOverlay.querySelector('#diy-import-code');if(dii){dii.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();diyImport();}});}
var bms=pageOverlay.querySelector('#diy-lore-mode-select');
if(bms){bms.addEventListener('click',function(e){e.stopPropagation();diySetLoreMode('select');});}
var bmi=pageOverlay.querySelector('#diy-lore-mode-input');
if(bmi){bmi.addEventListener('click',function(e){e.stopPropagation();diySetLoreMode('input');});}
var ls=pageOverlay.querySelector('#diy-lorebook');
if(ls){ls.addEventListener('change',function(){diyLorebook=ls.value;try{localStorage.setItem('pk_diy_lorebook2',diyLorebook);}catch(e){}});}
var lsc=pageOverlay.querySelector('#diy-lorebook-custom');
if(lsc){lsc.addEventListener('input',function(){diyLorebook=lsc.value.trim();try{localStorage.setItem('pk_diy_lorebook2',diyLorebook);}catch(e){}});}
var vst=pageOverlay.querySelector('[data-vision-settings]');
if(vst){vst.addEventListener('click',function(e){e.stopPropagation();openVisionSettings();});}
diyFillLorebookOptions();
diyEvoSyncNext();
diyEvoLoadAbi();
pageOverlay.querySelectorAll('[data-map]').forEach(function(b){b.addEventListener('click',function(){activeMap=b.getAttribute('data-map');alolaIsland=-1;pageOverlay.querySelector('.page-body').innerHTML=mapHTML();bindPageInteractions();});});
var dr=pageOverlay.querySelector('[data-diag-refresh]');
if(dr){dr.addEventListener('click',function(e){e.stopPropagation();openPage('settings');});}
var dcp=pageOverlay.querySelector('[data-diag-copy]');
if(dcp){dcp.addEventListener('click',function(e){e.stopPropagation();var txt='PKM HUD Diagnostics v'+PK_VER+'\n'+JSON.stringify(hudDiagSnapshot(),null,2);diyCopyText(txt,function(ok){if(ok)dcp.textContent='✔ 已复制';});});}
var dcl=pageOverlay.querySelector('[data-diag-clear]');
if(dcl){dcl.addEventListener('click',function(e){e.stopPropagation();hudDiag.errors.length=0;hudDiag.events.length=0;hudDiag.counters.errors=0;openPage('settings');});}
var mvw=pageOverlay.querySelector('[data-mapwrap]');
if(mvw){bindMapViewer(mvw);}
var mapPadToggle=pageOverlay.querySelector('[data-map-pad-toggle]');
if(mapPadToggle&&!mapPadToggle._pkmMapToggleBound){
  mapPadToggle._pkmMapToggleBound=true;
  mapPadToggle.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();
    mapManualControlsOpen=!mapManualControlsOpen;
    mapPadToggle.classList.toggle('on',mapManualControlsOpen);
    var frame=pageOverlay.querySelector('[data-map-viewer-frame]');
    var manual=pageOverlay.querySelector('[data-map-manual-controls]');
    var wrapNow=pageOverlay.querySelector('[data-mapwrap]');
    if(frame)frame.classList.toggle('manual-open',mapManualControlsOpen);
    if(manual)manual.setAttribute('aria-hidden',mapManualControlsOpen?'false':'true');
    if(wrapNow&&wrapNow._mapApi&&typeof wrapNow._mapApi.refit==='function')hudScope.setTimeout(function(){try{wrapNow._mapApi.refit(false);}catch(err){}},40);
  });
}
if(mvw&&mvw._mapApi){
  var mapFrame=mvw.closest('[data-map-viewer-frame]')||pageOverlay;
  mapFrame.querySelectorAll('[data-map-pan]').forEach(function(btn){btn.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();
    var dir=btn.getAttribute('data-map-pan'),sx=Math.max(28,Math.min(84,Math.round((mvw.clientWidth||320)*0.10))),sy=Math.max(24,Math.min(72,Math.round((mvw.clientHeight||240)*0.10)));
    /* 方向键按“视角移动”解释：视角向左 => 地图内容向右；其余方向同理。 */
    if(dir==='up')mvw._mapApi.panBy(0,sy);else if(dir==='down')mvw._mapApi.panBy(0,-sy);else if(dir==='left')mvw._mapApi.panBy(sx,0);else if(dir==='right')mvw._mapApi.panBy(-sx,0);
  });});
  mapFrame.querySelectorAll('[data-map-zoom]').forEach(function(btn){btn.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();
    mvw._mapApi.zoomBy(btn.getAttribute('data-map-zoom')==='in'?1.22:1/1.22);
  });});
}
var eye=pageOverlay.querySelector('[data-map-eye]');
if(eye){
  var wrap=pageOverlay.querySelector('[data-mapwrap]');
  var fb=pageOverlay.querySelector('[data-map-filter]');
  eye.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();
    mapSpotOn=!mapSpotOn;
    if(wrap)wrap.classList.toggle('show-all',mapSpotOn);
    eye.classList.toggle('on',mapSpotOn);
    if(fb)fb.classList.toggle('show',mapSpotOn);
  });
}
var szb=pageOverlay.querySelector('[data-map-size-btn]');
var szp=pageOverlay.querySelector('[data-map-size-pop]');
if(szb&&szp){
  szb.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();
    szp.classList.toggle('open');
  });
  var szd=pageOverlay.querySelector('[data-map-size-done]');
  if(szd){szd.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();szp.classList.remove('open');});}
}
pageOverlay.querySelectorAll('[data-mcat]').forEach(function(b){
  b.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();
    var cat=b.getAttribute('data-mcat');
    mapFilter[cat]=!mapFilter[cat];
    b.classList.toggle('active',mapFilter[cat]);
    var wrap=pageOverlay.querySelector('[data-mapwrap]');
    if(wrap)wrap.classList.toggle('show-'+cat,mapFilter[cat]);
  });
});
var msz=pageOverlay.querySelector('[data-map-size]');
if(msz){
  msz.addEventListener('input',function(){
    mapLabelSize=parseInt(msz.value,10)||10;
    var v=pageOverlay.querySelector('[data-map-size-val]');
    if(v)v.textContent=mapLabelSize+'px';
    var sb=pageOverlay.querySelector('[data-map-size-btn]');
    if(sb)sb.textContent='🔤 字号 '+mapLabelSize;
    try{localStorage.setItem('pk_maplabelsize',String(mapLabelSize));}catch(e){}
    var wrap=pageOverlay.querySelector('[data-mapwrap]');
    if(wrap)updateMapLabels(wrap);
  });
}
pageOverlay.querySelectorAll('.map-spot-label').forEach(function(lb){
  lb.addEventListener('click',function(e){
    e.stopPropagation();
    pageOverlay.querySelectorAll('.map-spot-label').forEach(function(x){x.classList.remove('top');});
    lb.classList.add('top');
  });
});
pageOverlay.querySelectorAll('.map-island-label').forEach(function(lb){
  lb.addEventListener('pointerdown',function(e){e.stopPropagation();});
  lb.addEventListener('click',function(e){
    e.stopPropagation();
    var i=parseInt(lb.getAttribute('data-island'),10);
    var m=MAPS.filter(function(x){return x.name===activeMap;})[0];
    if(m&&m.islands&&m.islands[i]&&m.islands[i].img){
      alolaIsland=i;
      var pb=pageOverlay.querySelector('.page-body');
      if(pb){pb.innerHTML=mapHTML();bindPageInteractions();}
    }
  });
});
var backMap=pageOverlay.querySelector('[data-map-back]');
if(backMap){backMap.addEventListener('click',function(e){e.stopPropagation();alolaIsland=-1;var pb=pageOverlay.querySelector('.page-body');if(pb){pb.innerHTML=mapHTML();bindPageInteractions();}});}
var tc1=pageOverlay.querySelector('#tc-def-1');
if(tc1){tc1.addEventListener('change',typeChartCalc);}
var tc2=pageOverlay.querySelector('#tc-def-2');
if(tc2){tc2.addEventListener('change',typeChartCalc);}
typeChartCalc();
var iso=pageOverlay.querySelector('[data-isz-open]');
if(iso){iso.addEventListener('click',function(e){e.stopPropagation();openIconSize();});}
var fbo=pageOverlay.querySelector('[data-fab-open]');
if(fbo){fbo.addEventListener('click',function(e){e.stopPropagation();openFabSize();});}
var iho=pageOverlay.querySelector('[data-inline-h-open]');
if(iho){iho.addEventListener('click',function(e){e.stopPropagation();openInlineH();});}
var fio=pageOverlay.querySelector('[data-fab-img-open]');
if(fio){fio.addEventListener('click',function(e){e.stopPropagation();openFabImg();});}
var pku=pageOverlay.querySelector('[data-pk-check-update]');
if(pku){pku.addEventListener('click',function(e){e.stopPropagation();pkCheckUpdate();});}
var pkd=pageOverlay.querySelector('[data-pk-do-update]');
if(pkd){pkd.addEventListener('click',function(e){e.stopPropagation();pkDoUpdate();});}
var psc=pageOverlay.querySelector('[data-pk-show-content]');
if(psc){psc.addEventListener('click',function(e){e.stopPropagation();openUpdateContent();});}
var db=pageOverlay.querySelector('[data-dev-unlock]');
if(db){db.addEventListener('click',function(e){
  e.stopPropagation();
  var pwd=pageOverlay.querySelector('#dev-pwd');
  var panel=pageOverlay.querySelector('#dev-panel');
  var v=pwd?pwd.value.trim():'';
  if(v==='3525442929'){
    setDevPanelOn(true);
    if(panel){panel.innerHTML=devPanelHTML();bindDevPanel();}
    if(pwd)pwd.value='';
  }else{
    if(panel){panel.innerHTML=devPanelHTML('❌ 密码错误');}
    if(pwd){pwd.value='';pwd.focus();}
  }
});}
bindDevPanel();
}

function bindBadge(){/* v1.8.0：徽章入口由根节点事件委托处理 */}
function badgeClick(e){e.stopPropagation();var rs=parseBadges();if(rs.length>1){var cur=pickRegion(rs),i=0,k;for(k=0;k<rs.length;k++){if(rs[k].region===cur)i=k;}try{localStorage.setItem('pk_badge_sel',JSON.stringify({region:rs[(i+1)%rs.length].region}));}catch(err){}var tf=document.querySelector('.trainer-frame');if(tf){tf.outerHTML=trainerHTML();hudResolvePkidbImages(document);}return;}openPage('badge');}

function pageOverlayPopout(on){
  if(!pageOverlay)return;
  if(on){
    pageOverlay.classList.add('popout');
    if(pageOverlayHost&&pageOverlay.parentElement!==document.body){try{document.body.appendChild(pageOverlay);}catch(e){}}
  }else{
    pageOverlay.classList.remove('popout','map-focus');
    if(pageOverlayHost&&pageOverlay.parentElement!==pageOverlayHost){try{pageOverlayHost.appendChild(pageOverlay);}catch(e){}}
  }
  hudSyncModalIsolation();
}
function openPage(key){
  var m=MENU.find(function(x){return x.key===key;})||(key==='typechart'?{label:'克制表'}:null);if(!m)return;
  if(key==='map'){
    var _loc=(stat_data.环境&&stat_data.环境.当前地点)||'';
    var _reg=regionOfLocation(_loc);
    if(_reg&&MAPS.some(function(x){return x.name===_reg;}))activeMap=_reg;
    mapSpotOn=true;
    mapFilter={town:true,road:false,special:false};
    alolaIsland=-1;
  }
  currentPageKey=key;
  pageOverlay.classList.toggle('map-focus',key==='map');
  pageOverlayPopout(key==='map');
  pageOverlay.style.paddingTop='';
  pageOverlay.innerHTML=pageHTML(m.label,pageContent(key));pageOverlay.classList.add('open');hudSyncModalIsolation();bindPageInteractions();pkImgFix(pageOverlay);resolveItemImgs(pageOverlay);if(key==='map')hudSyncMapPopoutHeight();
}

function hudMsg(msg){
  if(!overlay) return;
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">提示</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="row"><span class="v">'+esc(msg)+'</span></div><div class="action-btns"><button class="act-btn" data-close>知道了</button></div></div></div>';
  overlay.classList.add('open');
}
function hudConfirm(title,msg,cb){
  hudConfirmCb=cb;
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">'+esc(title)+'</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="row"><span class="v">'+esc(msg)+'</span></div><div class="action-btns"><button class="act-btn" data-hud-confirm>✔ 确认</button><button class="act-btn" data-close>取消</button></div></div></div>';
  overlay.classList.add('open');
}
function getCardPkm(c){
  if(!c) return null;
  if(c.where==='box' && c.boxName){
    var box=stat_data.盒子[c.boxName];
    return box ? (box[c.slot]||null) : null;
  }
  if(c.where==='team'){
    return stat_data.队伍[String(c.slot)] || null;
  }
  return null;
}
function boxDisp(b){
  var s=String(b||'');
  return (s.indexOf('盒子')===0 ? s : '盒子'+s);
}
function findBoxSlot(boxName){
  var b=stat_data.盒子[boxName]=stat_data.盒子[boxName]||{};
  var n=1;
  while(b[String(n)] && b[String(n)].名字 && b[String(n)].名字!=='空') n++;
  return String(n);
}
function getBagCount(name){
  var it=stat_data.背包[name];
  return it ? (parseInt(it.数量,10)||0) : 0;
}
function addBagItem(name,count){
  count=count||1;
  var it=stat_data.背包[name];
  if(!it) stat_data.背包[name]={类型:'道具',数量:count,图标:''};
  else it.数量=(parseInt(it.数量,10)||0)+count;
}
function removeBagItem(name,count){
  count=count||1;
  var it=stat_data.背包[name];
  if(!it) return;
  it.数量=(parseInt(it.数量,10)||0)-count;
  if(it.数量<=0) delete stat_data.背包[name];
}
function storePkm(c,boxName){
  var p=getCardPkm(c);
  if(!p || !p.名字 || p.名字==='空'){ hudMsg('没有可存入的精灵'); return; }
  if(c.where!=='team'){ hudMsg('只能从队伍存入盒子'); return; }
  if(!hudAssertPokemonMutable(p,'移动'))return;
  hudEnsurePokemonIdentity(p);
  var slot=findBoxSlot(boxName);
  var fromSlot=String(c.slot);
  stat_data.盒子[boxName][slot]=p;
  stat_data.队伍[fromSlot]={名字:'空'};
  hudSend('请执行【队伍→盒子】：把队伍中的《'+p.名字+'》存入《'+boxName+'》，并更新状态栏。', function(){
  stat_data.队伍[fromSlot]=p;
  delete stat_data.盒子[boxName][slot];
}, '把队伍中的'+p.名字+'存入'+boxDisp(boxName)+'。');
  hudRecordAssetMutation(p,{action:'move',method:'HUD 队伍→盒子',fromLocation:'队伍第'+fromSlot+'位',toLocation:boxDisp(boxName)+' 第'+slot+'格',location:boxDisp(boxName)+' 第'+slot+'格'});
  render(); resizeFrame();
  hudMsg('已把《'+p.名字+'》存入《'+boxName+'》');
}
function withdrawPkm(c,teamSlot){
  var p=getCardPkm(c);
  if(!p || !p.名字 || p.名字==='空'){ hudMsg('没有可取出的精灵'); return; }
  if(c.where!=='box' || !c.boxName){ hudMsg('只能从盒子取出到队伍'); return; }
  if(!hudAssertPokemonMutable(p,'取出'))return;
  if(teamSlot<1 || teamSlot>6){ hudMsg('无效的队伍位置'); return; }
  var dst=stat_data.队伍[String(teamSlot)];
  if(dst && dst.名字 && dst.名字!=='空'){ hudMsg('该队伍位置已有精灵'); return; }
  hudEnsurePokemonIdentity(p);
  var boxName=c.boxName, boxSlot=c.slot;
  stat_data.队伍[String(teamSlot)]=p;
  delete stat_data.盒子[boxName][boxSlot];
  hudSend('请执行【盒子→队伍】：把《'+boxName+'》里的《'+p.名字+'》取出到队伍第'+teamSlot+'位，并更新状态栏。', function(){
  stat_data.盒子[boxName][boxSlot]=p;
  stat_data.队伍[String(teamSlot)]={名字:'空'};
}, '把'+boxDisp(boxName)+'里的'+p.名字+'取出到队伍第'+teamSlot+'位。');
  hudRecordAssetMutation(p,{action:'move',method:'HUD 盒子→队伍',fromLocation:boxDisp(boxName)+' 第'+boxSlot+'格',toLocation:'队伍第'+teamSlot+'位',location:'队伍第'+teamSlot+'位'});
  render(); resizeFrame();
  hudMsg('已把《'+p.名字+'》取出到队伍第 '+teamSlot+' 位');
}
function equipPkm(c,itemName){
  var p=getCardPkm(c);
  if(!p || !p.名字 || p.名字==='空'){ hudMsg('没有目标精灵'); return; }
  if(!hudAssertPokemonMutable(p,'更换携带道具'))return;
  if(getBagCount(itemName)<=0){ hudMsg('背包里没有该道具'); return; }

  var beforeBag=pkmHudClone(stat_data.背包||{});
  var beforeItem=p.携带道具||'无';
  var beforeItemEn=p.携带道具英文||'';

  var old=p.携带道具;
  if(old && old!=='无') addBagItem(old,1);
  removeBagItem(itemName,1);
  p.携带道具=itemName;
  p.携带道具英文='';
  var oldItem=old;

  hudSend('请让《'+p.名字+'》携带《'+itemName+'》'+(oldItem && oldItem!=='无' ? '；请先卸下原道具《'+oldItem+'》并放回背包':'')+'，并更新状态栏。', function(){
  stat_data.背包=beforeBag;
  p.携带道具=beforeItem;
  p.携带道具英文=beforeItemEn;
}, '让'+p.名字+'携带'+itemName+(oldItem && oldItem!=='无' ? '，并先卸下原道具'+oldItem+'放回背包':'')+'。');

  render(); resizeFrame();
  hudMsg(oldItem && oldItem!=='无' ? '已卸下《'+oldItem+'》并携带《'+itemName+'》' : '已携带《'+itemName+'》');
}
function unequipPkmByCard(c){
  var p=getCardPkm(c);
  if(!p || !p.名字 || p.名字==='空'){ hudMsg('没有目标精灵'); return; }
  if(!hudAssertPokemonMutable(p,'卸下携带道具'))return;
  var old=p.携带道具;
  if(!old || old==='无'){ hudMsg('该精灵没有携带道具'); return; }

  var beforeBag=pkmHudClone(stat_data.背包||{});
  var beforeItem=old;
  var beforeItemEn=p.携带道具英文||'';

  addBagItem(old,1);
  p.携带道具='无';
  p.携带道具英文='';
  var oldItem=old;

  hudSend('请卸下《'+p.名字+'》携带的《'+oldItem+'》并放回背包，并更新状态栏。', function(){
  stat_data.背包=beforeBag;
  p.携带道具=beforeItem;
  p.携带道具英文=beforeItemEn;
}, '卸下'+p.名字+'携带的'+oldItem+'并放回背包。');

  render(); resizeFrame();
  hudMsg('已卸下《'+oldItem+'》');
}
function discardBagItem(name,count){
  count=count||1;
  if(getBagCount(name)<=0){ hudMsg('背包里没有该道具'); return; }
  removeBagItem(name,count);
  var cnt=count;
  hudSend('请丢弃背包中的《'+name+'》×'+cnt+'，并更新状态栏。', function(){
  addBagItem(name,cnt);
}, '丢弃背包中的'+name+'×'+cnt+'。');
  render(); resizeFrame();
  hudMsg('已丢弃《'+name+'》×'+cnt);
}
function discardBagItemAsk(name){
  hudConfirm('丢弃道具','确定丢弃《'+name+'》×1 吗？',function(){ discardBagItem(name,1); });
}
function openNewBoxModal(){
  overlay.innerHTML='<div class="modal"><div class="modal-head"><div class="modal-name">新建盒子</div><button class="close" data-close>✕</button></div><div class="modal-body"><input type="text" id="box-new-name" placeholder="输入盒子名称" style="width:100%;box-sizing:border-box;padding:8px 10px;margin-bottom:10px;font-family:inherit;font-size:.9rem;background:rgba(43,74,111,.5);border:1px solid var(--frame);border-radius:6px;color:var(--text);outline:none"><div class="action-btns"><button class="act-btn" data-box-new-confirm>✔ 创建</button><button class="act-btn" data-close>取消</button></div></div></div>';
  overlay.classList.add('open');
  hudScope.setTimeout(function(){var i=document.getElementById('box-new-name'); if(i)i.focus();},30);
}

function createBox(name){
  name=String(name||'').trim();
  if(!name){ hudMsg('盒子名称不能为空'); return; }
  if(stat_data.盒子[name]){ hudMsg('盒子「'+name+'」已存在'); return; }
  stat_data.盒子[name]={};
  activeBox=name;
  hudSend('请新建一个盒子，盒子名称为《'+name+'》，并更新状态栏。', function(){
    delete stat_data.盒子[name];
  }, '新建盒子'+name);
overlay.classList.remove('open');
render();
resizeFrame();
openPage('box');
hudMsg('已新建盒子「'+name+'」');
}

function openDeleteBoxConfirm(){
  var name=activeBox;
  if(!stat_data.盒子 || !stat_data.盒子[name]){ hudMsg('没有可删除的盒子'); return; }
  var cnt=Object.keys(stat_data.盒子[name]||{}).filter(function(s){
    var p=stat_data.盒子[name][s];
    return p && p.名字 && p.名字!=='空';
  }).length;
  if(cnt>0){ hudMsg('盒子「'+name+'」里还有宝可梦，请先取出'); return; }
  hudConfirm('删除盒子','确定删除盒子「'+name+'」吗？', function(){ deleteBox(name); });
}

function deleteBox(name){
  name=String(name||'');
  if(!name || !stat_data.盒子[name]){ hudMsg('盒子不存在'); return; }
  delete stat_data.盒子[name];
  var keys=Object.keys(stat_data.盒子);
  activeBox=keys.length ? keys[0] : '1';
  hudSend('请删除盒子《'+name+'》，并更新状态栏。', function(){
    stat_data.盒子[name]={};
  }, '删除盒子'+name);
overlay.classList.remove('open');
render();
resizeFrame();
openPage('box');
hudMsg('已删除盒子「'+name+'」');
}

function openMoveBoxPicker(c){
  hudActionCard=c;
  var boxes=Object.keys(stat_data.盒子||{}).filter(function(b){ return b!==c.boxName; });
  if(!boxes.length){ hudMsg('没有其他盒子，请先新建盒子'); return; }
  var html='<div class="modal"><div class="modal-head"><div class="modal-name">选择目标盒子</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="action-btns">';
  boxes.forEach(function(b){ html+='<button class="act-btn" data-hud-movebox="'+esc(b)+'">移动到 '+esc(b)+'</button>'; });
  html+='</div></div></div>';
  overlay.innerHTML=html;
  overlay.classList.add('open');
}

function moveBoxPkm(c,targetBox){
  var p=getCardPkm(c);
  if(!p || !p.名字 || p.名字==='空'){ hudMsg('没有可移动的宝可梦'); return; }
  if(c.where!=='box' || !c.boxName){ hudMsg('只能移动盒子里的宝可梦'); return; }
  if(!hudAssertPokemonMutable(p,'移动'))return;
  if(targetBox===c.boxName){ hudMsg('目标盒子不能是当前盒子'); return; }

  hudEnsurePokemonIdentity(p);
  var srcBox=c.boxName, srcSlot=c.slot;
  var slot=findBoxSlot(targetBox);
  stat_data.盒子[targetBox][slot]=p;
  delete stat_data.盒子[srcBox][srcSlot];

  hudSend('请把盒子《'+srcBox+'》里的《'+p.名字+'》移动到盒子《'+targetBox+'》，并更新状态栏。', function(){
  delete stat_data.盒子[targetBox][slot];
  stat_data.盒子[srcBox][srcSlot]=p;
}, '把'+p.名字+'从'+boxDisp(srcBox)+'移动到'+boxDisp(targetBox));
  hudRecordAssetMutation(p,{action:'move',method:'HUD 盒子间移动',fromLocation:boxDisp(srcBox)+' 第'+srcSlot+'格',toLocation:boxDisp(targetBox)+' 第'+slot+'格',location:boxDisp(targetBox)+' 第'+slot+'格'});

render();
resizeFrame();
openPage('box');
hudMsg('已把《'+p.名字+'》移动到'+boxDisp(targetBox));
}

function openBoxPicker(c){
  hudActionCard=c;
  var boxes=Object.keys(stat_data.盒子||{});
  var html='<div class="modal"><div class="modal-head"><div class="modal-name">选择盒子</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="action-btns">';
  if(!boxes.length){
    html+='<button class="act-btn" data-hud-newbox>新建「盒子1」并存入</button>';
  }else{
    boxes.forEach(function(b){ html+='<button class="act-btn" data-hud-storebox="'+esc(b)+'">存入 '+esc(b)+'</button>'; });
  }
  html+='</div></div></div>';
  overlay.innerHTML=html;
  overlay.classList.add('open');
}
function openSlotPicker(c){
  hudActionCard=c;
  var hasEmpty=false;
  var html='<div class="modal"><div class="modal-head"><div class="modal-name">选择队伍位置</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="action-btns">';
  for(var i=1;i<=6;i++){
    var p=stat_data.队伍[String(i)];
    var empty=!p || !p.名字 || p.名字==='空';
    if(empty) hasEmpty=true;
    html+='<button class="act-btn" data-hud-slot="'+i+'"'+(empty?'':' disabled style="opacity:.35"')+'>'+(empty?('第 '+i+' 位（空）'):('第 '+i+' 位：'+esc(p.名字)))+'</button>';
  }
  html+='</div></div></div>';
  if(!hasEmpty){ hudMsg('队伍已满，请先存入盒子腾出位置'); return; }
  overlay.innerHTML=html;
  overlay.classList.add('open');
}
function openItemPicker(c){
  hudActionCard=c;
  var items=Object.keys(stat_data.背包||{}).filter(function(n){
    var it=stat_data.背包[n];
    return it && getBagCount(n)>0 && it.类型!=='重要物品';
  });
  if(!items.length){ hudMsg('背包里没有道具'); return; }
  var html='<div class="modal"><div class="modal-head"><div class="modal-name">选择携带道具</div><button class="close" data-close>✕</button></div><div class="modal-body"><div class="action-btns">';
  items.forEach(function(n){ html+='<button class="act-btn" data-hud-item="'+esc(n)+'">'+esc(n)+' ×'+getBagCount(n)+'</button>'; });
  html+='</div></div></div>';
  overlay.innerHTML=html;
  overlay.classList.add('open');
}
function refreshIconHTML(){
  return '<img src="https://img.baibai.cv/f/WEvnT4/1789326633150.png" alt="刷新">';
}
function refreshBtnHTML(){
  return '<button type="button" class="hud-refresh-btn" data-hud-refresh title="刷新变量">'+refreshIconHTML()+'</button>';
}
function hudRefresh(){
  var activeTab='1';
  try{var at=document.querySelector('.tab-btn.active');if(at)activeTab=at.getAttribute('data-tab')||'1';}catch(e){}
  var btn=document.querySelector('[data-hud-refresh]');
  if(btn){btn.classList.add('spin');btn.disabled=true;}
  // 有未完成的“下回合指令”（卸道具/移精灵等）时，保留本地乐观修改，只重绘，不重新读变量覆盖
  try{if(!hudPendingActions.length){stat_data=loadStatData();hudExternalStateChanged();hudRebuildLocationIndex();}}catch(e){hudDiagError('manual refresh state',e);}
  try{diySyncFromStorage(false);}catch(e){}
  try{recordSeen();}catch(e){}
  try{
    render();
    var tabs=document.querySelectorAll('.tab-btn');
    for(var i=0;i<tabs.length;i++){tabs[i].classList.toggle('active',tabs[i].getAttribute('data-tab')===activeTab);}
    var panels=document.querySelectorAll('.tab-panel');
    for(var j=0;j<panels.length;j++){panels[j].classList.toggle('active',panels[j].id==='tab-'+activeTab);}
    resizeFrame();
  }catch(e){try{fail('HUD 刷新失败：'+e.message);}catch(e2){}}
  hudScope.setTimeout(function(){
    var b=document.querySelector('[data-hud-refresh]');
    if(b){b.classList.remove('spin');b.disabled=false;b.innerHTML='<span class="hud-refresh-ok">✔</span>';}
    hudScope.setTimeout(function(){
      var b2=document.querySelector('[data-hud-refresh]');
      if(b2){b2.innerHTML=refreshIconHTML();}
    },900);
  },80);
}
function bindHudRefresh(){/* v1.8.0：主页刷新由 HUD 根节点事件委托统一处理 */}
function hudActiveTab(app){try{var b=app&&app.querySelector('.tab-btn.active');return b?String(b.getAttribute('data-tab')||'1'):'1';}catch(e){return '1';}}
function refreshHudPanels(app){
  app=app||document.getElementById(winMode==='0'?'pkm-hud-inline':'pkm-hud-slot');if(!app)return false;
  var active=hudActiveTab(app),scrolls={};['1','2','3','4'].forEach(function(k){var el=app.querySelector('#tab-'+k);if(el)scrolls[k]=el.scrollTop||0;});
  cards=buildCards();
  var h1=app.querySelector('#tab-1'),h2=app.querySelector('#tab-2'),h3=app.querySelector('#tab-3'),h4=app.querySelector('#tab-4');
  if(h1)h1.innerHTML=hudCmdBarHTML()+trainerHTML()+teamHTML()+quickHTML()+nearbyHTML()+'<div id="home-fold">'+homeFoldHTML()+'</div>';
  if(h2)h2.innerHTML=envStripHTML()+worldHTML()+tasksHTML()+rivalsHTML();
  if(h3)h3.innerHTML=cmdPanelHTML()+battleHTML();
  if(h4)h4.innerHTML=menuHTML();
  app.querySelectorAll('.tab-btn').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-tab')===active);});
  app.querySelectorAll('.tab-panel').forEach(function(el){var k=String(el.id||'').replace('tab-','');el.classList.toggle('active',k===active);if(scrolls[k]!=null)el.scrollTop=scrolls[k];});
  for(var i=0;i<cards.length;i++)preloadMoves(cards[i].skills);
  pkImgFix(app);resolvePkmImgs(app);resolveItemImgs(app);hudResolvePkidbImages(app);hudDiagInc('partialRenders');return true;
}
function hudBindRootDelegation(app){
  if(!app||app._pkmDelegated)return;app._pkmDelegated=true;hudDiagInc('rootDelegation');
  app.addEventListener('click',function(e){
    var _et=e.target;if(_et&&_et.nodeType!==1)_et=_et.parentElement;var x=_et&&_et.closest?_et.closest.bind(_et):null;if(!x)return;
    var r=x('[data-hud-refresh]');if(r){e.stopPropagation();hudRefresh();return;}
    var ht=x('[data-hud-cmd-toggle]');if(ht){e.stopPropagation();hudCmdOpen=!hudCmdOpen;refreshHudPanels(app);resizeFrame();return;}
    var hr=x('[data-hud-cmd-remove]');if(hr){e.stopPropagation();hudRemoveAction(hr.getAttribute('data-hud-cmd-remove'));return;}
    var tip=x('[data-tip]');if(tip){e.preventDefault();e.stopPropagation();hudMsg(tip.getAttribute('data-tip'));return;}
    var cmd=x('[data-cmd]');if(cmd){e.preventDefault();e.stopPropagation();var txt=cmd.getAttribute('data-cmd'),old=cmd.textContent;if(fillInput(txt)){cmd.textContent='✔ 已填入输入栏';hudScope.setTimeout(function(){if(cmd&&cmd.isConnected)cmd.textContent=old;},1200);}else hudMsg('无法访问输入栏。指令：'+txt);return;}
    var tab=x('.tab-btn[data-tab]');if(tab){var t=tab.getAttribute('data-tab');app.querySelectorAll('.tab-btn').forEach(function(b){b.classList.toggle('active',b===tab);});app.querySelectorAll('.tab-panel').forEach(function(p){p.classList.toggle('active',p.id==='tab-'+t);});resizeFrame();return;}
    var menu=x('.menu-item[data-page]');if(menu){openPage(menu.getAttribute('data-page'));return;}
    var fold=x('#home-fold [data-fold]');if(fold){var k=fold.getAttribute('data-fold');foldState[k]=!foldState[k];var home=app.querySelector('#home-fold');if(home){home.innerHTML=homeFoldHTML();resolveItemImgs(home);hudResolvePkidbImages(home);}resizeFrame();return;}
    var bag=x('#home-fold .bag-tab[data-bag]');if(bag){activeBag=bag.getAttribute('data-bag');var home2=app.querySelector('#home-fold');if(home2){home2.querySelectorAll('.bag-tab').forEach(function(b){b.classList.toggle('active',b===bag);});var list=home2.querySelector('#bag-list');if(list){list.innerHTML=bagItemsHTML();resolveItemImgs(home2);}}resizeFrame();return;}
    var bd=x('#home-fold [data-bag-discard]');if(bd){e.stopPropagation();discardBagItemAsk(bd.getAttribute('data-bag-discard'));return;}
    var item=x('#home-fold .item-entry[data-item]');if(item){e.stopPropagation();if(itemClickEnabled)showItemInfo(item.getAttribute('data-item'));return;}
    var bc=x('#badge-cycle');if(bc){badgeClick(e);return;}
    var bo=x('[data-badge-open]');if(bo){e.stopPropagation();openPage('badge');return;}
    var card=x('.card-frame[data-slot]');if(card){var sl=parseInt(card.getAttribute('data-slot'),10),c=null;for(var i=0;i<cards.length;i++)if(cards[i].slot===sl){c=cards[i];break;}if(c){currentDetailCard=c;clearBack();overlay.innerHTML=detailHTML(c);overlay.classList.add('open');pkImgFix(overlay);resolvePkmImgs(overlay);resolveMoveTypes(overlay);resolveItemImgs(overlay);hudResolvePkidbImages(overlay);}return;}
    var nb=x('[data-nearby-open]');if(nb){e.stopPropagation();var key=nb.getAttribute('data-nearby-open'),pk=stat_data.附近宝可梦&&stat_data.附近宝可梦[key];if(pk){clearBack();overlay.innerHTML=actionHTML(pk,key);overlay.classList.add('open');pkImgFix(overlay);resolvePkmImgs(overlay);hudResolvePkidbImages(overlay);}return;}
    var nt=x('[data-nearby-toggle]');if(nt){e.stopPropagation();nearbyOpen=!nearbyOpen;var nf=app.querySelector('.nearby-frame');if(nf){nf.outerHTML=nearbyHTML();pkImgFix(app);resolvePkmImgs(app);hudResolvePkidbImages(app);}resizeFrame();return;}
    var sum=x('.cmd-panel>summary');if(sum){var det=sum.parentElement;hudScope.setTimeout(function(){if(det)cmdOpen=!!det.open;},0);}
  });
}
function render(){
  var inline=(winMode==='0');
  var app=inline?document.getElementById('pkm-hud-inline'):document.getElementById('pkm-hud-slot');
  if(!app){app=document.createElement('div');app.id=inline?'pkm-hud-inline':'pkm-hud-slot';if(inline){document.body.appendChild(app);}else{var win=document.getElementById('pkm-hud-win');if(win)win.appendChild(app);else document.body.appendChild(app);}}
  if(inline)applyInlineH(app);
  if(app._pkmOptimizedReady&&app.querySelector('.hud')){refreshHudPanels(app);resizeFrame();return;}
  app.innerHTML='<div class="hud"><div class="hud-inner" id="hud-inner">'+
  '<div class="tab-panel active" id="tab-1">'+hudCmdBarHTML()+trainerHTML()+teamHTML()+quickHTML()+nearbyHTML()+'<div id="home-fold">'+homeFoldHTML()+'</div></div>'+
'<div class="tab-panel" id="tab-2">'+envStripHTML()+worldHTML()+tasksHTML()+rivalsHTML()+'</div>'+
  '<div class="tab-panel" id="tab-3">'+cmdPanelHTML()+battleHTML()+'</div>'+
  '<div class="tab-panel" id="tab-4">'+menuHTML()+'</div>'+
  '</div>'+
  '<div class="tab-bar"><button class="tab-btn active" data-tab="1">主页</button><button class="tab-btn" data-tab="2">世界</button><button class="tab-btn" data-tab="3">战场</button><button class="tab-btn" data-tab="4">菜单</button></div></div>';
pkImgFix(app);
resolvePkmImgs(app);
resolveItemImgs(app);
  var hudEl=app.querySelector('.hud')||document.querySelector('.hud');
overlay=document.createElement('div');overlay.className='overlay pkm-hud-overlay';hudEl.appendChild(overlay);
pageOverlay=document.createElement('div');pageOverlay.className='page-overlay pkm-hud-page-overlay';hudEl.appendChild(pageOverlay);pageOverlayHost=hudEl;
hudBindModalIsolation();
/* 子层内部的 pointer/touch/mouse 手势到此为止，不再冒泡给 HUD/酒馆后层。 */
['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend'].forEach(function(type){
  try{pageOverlay.addEventListener(type,function(e){e.stopPropagation();},{passive:true});}catch(_e){}
  try{overlay.addEventListener(type,function(e){e.stopPropagation();},{passive:true});}catch(_e2){}
});
  cards=buildCards();
for(var i=0;i<cards.length;i++){preloadMoves(cards[i].skills);}
  hudBindRootDelegation(app);
  app._pkmOptimizedReady=true;
  hudResolvePkidbImages(app);

  pageOverlay.addEventListener('click',function(e){
  e.stopPropagation();
  var bagDiscard=e.target.closest('[data-bag-discard]');
  if(bagDiscard){e.stopPropagation();discardBagItemAsk(bagDiscard.getAttribute('data-bag-discard'));return;}
  var dc=e.target.closest('.dex-cell[data-name]');
if(dc){e.stopPropagation();showPokemonInfo(dc.getAttribute('data-name'),dc.getAttribute('data-id'));return;}
var it=e.target.closest('.item-entry[data-item]');
if(it){e.stopPropagation();if(itemClickEnabled)showItemInfo(it.getAttribute('data-item'));return;}
var tb=e.target.closest('[data-tc-big]');
if(tb){e.stopPropagation();overlay.innerHTML='<div class="modal" style="max-width:none;width:100%"><div class="modal-head"><div class="modal-name">属性克制表（可滚动查看）</div><button class="close" data-close>✕</button></div><div class="modal-body" style="padding:8px;overflow:auto;text-align:center"><img src="'+tb.getAttribute('data-tc-big')+'" style="width:200%;max-width:none;height:auto"></div></div>';overlay.classList.add('open');return;}
  if(e.target===pageOverlay||e.target.closest('[data-page-close]')){
  if(e.cancelable)e.preventDefault();hudArmGestureShield(pageOverlay,750);
  pageOverlay.classList.remove('open');
  pageOverlayPopout(false);
  currentPageKey='';
  if(quickMapFromFab){
  quickMapFromFab=false;
  var _win=document.getElementById('pkm-hud-win');
  var _mask=document.getElementById('pkm-hud-mask');
  var _btn=document.getElementById('pkm-hud-btn');
  if(_win)_win.classList.remove('open');
  if(_mask)_mask.classList.remove('open');
  if(_btn)_btn.style.display='';
  try{document.body.style.overflow='';}catch(e2){}
}
  var tf=document.querySelector('.trainer-frame');
  if(tf){tf.outerHTML=trainerHTML();hudResolvePkidbImages(document);}
}
});
  overlay.addEventListener('click',function(e){
    e.stopPropagation();
    if(e.target.closest('[data-move-back]')){e.stopPropagation();var _pb=popBack();if(_pb){overlay.innerHTML=_pb;}else{overlay.classList.remove('open');}return;}
var itm=e.target.closest('[data-item]');if(itm){e.stopPropagation();if(itemClickEnabled)showItemInfo(itm.getAttribute('data-item'),true);return;}
    if(e.target===overlay){if(e.cancelable)e.preventDefault();hudArmGestureShield(overlay,750);diyVisionCancel();var _pb2=popBack();if(_pb2){overlay.innerHTML=_pb2;}else{overlay.classList.remove('open');}return;}
        if(e.target.closest('[data-close]')){if(e.cancelable)e.preventDefault();hudArmGestureShield(overlay,750);diyVisionCancel();overlay.classList.remove('open');clearBack();return;}
var bnc=e.target.closest('[data-box-new-confirm]');if(bnc){e.stopPropagation();var inp=document.getElementById('box-new-name');createBox(inp?inp.value:'');return;}
var ps=e.target.closest('[data-pkm-store]');if(ps){e.stopPropagation();if(currentDetailCard)openBoxPicker(currentDetailCard);return;}
var pw=e.target.closest('[data-pkm-withdraw]');if(pw){e.stopPropagation();if(currentDetailCard)openSlotPicker(currentDetailCard);return;}
var pm=e.target.closest('[data-pkm-movebox]');if(pm){e.stopPropagation();if(currentDetailCard)openMoveBoxPicker(currentDetailCard);return;}
var pe=e.target.closest('[data-pkm-equip]');if(pe){e.stopPropagation();if(currentDetailCard)openItemPicker(currentDetailCard);return;}
var pu=e.target.closest('[data-pkm-unequip]');if(pu){e.stopPropagation();if(currentDetailCard)unequipPkmByCard(currentDetailCard);return;}
var hb=e.target.closest('[data-hud-storebox]');if(hb){e.stopPropagation();storePkm(hudActionCard,hb.getAttribute('data-hud-storebox'));return;}
var hn=e.target.closest('[data-hud-newbox]');if(hn){e.stopPropagation();storePkm(hudActionCard,'盒子1');return;}
var mb=e.target.closest('[data-hud-movebox]');if(mb){e.stopPropagation();moveBoxPkm(hudActionCard,mb.getAttribute('data-hud-movebox'));return;}
var hs=e.target.closest('[data-hud-slot]');if(hs){e.stopPropagation();withdrawPkm(hudActionCard,parseInt(hs.getAttribute('data-hud-slot'),10));return;}
var hi=e.target.closest('[data-hud-item]');if(hi){e.stopPropagation();equipPkm(hudActionCard,hi.getAttribute('data-hud-item'));return;}
var hc=e.target.closest('[data-hud-confirm]');if(hc){e.stopPropagation();var cb=hudConfirmCb;hudConfirmCb=null;if(typeof cb==='function')cb();return;}
var ddc=e.target.closest('[data-diy-confirm]');if(ddc){e.stopPropagation();diyDelConfirm();return;}
var dcl=e.target.closest('[data-diy-clear-confirm]');if(dcl){e.stopPropagation();diyClearConfirm();return;}
var dcp=e.target.closest('[data-diy-copy]');if(dcp){e.stopPropagation();diyCopy(dcp.getAttribute('data-diy-copy-type'),dcp.getAttribute('data-diy-copy'));return;}
var de=e.target.closest('[data-diy-edit]');if(de){e.stopPropagation();diyEdit(de.getAttribute('data-diy-edit-type'),de.getAttribute('data-diy-edit'));return;}
var ccc=e.target.closest('[data-copy-code]');if(ccc){e.stopPropagation();var cd=ccc.getAttribute('data-copy-code');diyCopyText(cd,function(ok){ccc.textContent=ok?'✔ 已复制':'复制失败';});return;}
var vsv=e.target.closest('[data-vision-save]');if(vsv){e.stopPropagation();diyVisionSaveFromModal();return;}
var ip=e.target.closest('[data-isz-plus]');if(ip){e.stopPropagation();iszStep(ip.getAttribute('data-isz-plus'),1);return;}
var im=e.target.closest('[data-isz-minus]');if(im){e.stopPropagation();iszStep(im.getAttribute('data-isz-minus'),-1);return;}
var ia=e.target.closest('[data-isz-apply]');if(ia){e.stopPropagation();iszApply();return;}
var ir=e.target.closest('[data-isz-reset]');if(ir){e.stopPropagation();iszReset();return;}
var fp=e.target.closest('[data-fab-plus]');if(fp){e.stopPropagation();fabStep(1);return;}
var fm=e.target.closest('[data-fab-minus]');if(fm){e.stopPropagation();fabStep(-1);return;}
var fa=e.target.closest('[data-fab-apply]');if(fa){e.stopPropagation();fabApply();return;}
var fr=e.target.closest('[data-fab-reset]');if(fr){e.stopPropagation();fabReset();return;}
var ihp=e.target.closest('[data-inline-h-plus]');if(ihp){e.stopPropagation();inlineHStep(10);return;}
var ihm=e.target.closest('[data-inline-h-minus]');if(ihm){e.stopPropagation();inlineHStep(-10);return;}
var iha=e.target.closest('[data-inline-h-apply]');if(iha){e.stopPropagation();inlineHApply();return;}
var ihr=e.target.closest('[data-inline-h-reset]');if(ihr){e.stopPropagation();inlineHReset();return;}
var fia=e.target.closest('[data-fab-img-apply]');if(fia){e.stopPropagation();fabImgApply();return;}
var fip=e.target.closest('[data-fab-img-preview]');if(fip){e.stopPropagation();var fiuv=document.getElementById('fab-img-url');if(fiuv)fabImgPreview(fiuv.value);return;}
var fir=e.target.closest('[data-fab-img-reset]');if(fir){e.stopPropagation();fabImgReset();return;}
var dmb=e.target.closest('[data-dt-all]');if(dmb){e.stopPropagation();showAllMoves(dmb.getAttribute('data-dt-all'));return;}
    var mv=e.target.closest('[data-move]');if(mv){e.stopPropagation();showMoveInfo(mv.getAttribute('data-move'),mv.getAttribute('data-mvtype'),mv.getAttribute('data-mvcat'));return;}
    var cry=e.target.closest('[data-cry]');if(cry){e.stopPropagation();try{new Audio('https://cdn.jsdelivr.net/gh/PokeAPI/cries@main/cries/pokemon/latest/'+cry.getAttribute('data-cry')+'.ogg').play();}catch(err){}return;}
    var ab=e.target.closest('[data-ability]');if(ab){e.stopPropagation();showAbilityInfo(ab.getAttribute('data-ability'));return;}
var nt=e.target.closest('[data-nature]');if(nt){e.stopPropagation();showNatureInfo(nt.getAttribute('data-nature'));return;}
var st=e.target.closest('[data-shiny-toggle]');if(st){e.stopPropagation();if(curPkm){curPkmShiny=!curPkmShiny;renderPkmForm(curPkmForm);}return;}
    var fm=e.target.closest('[data-form]');if(fm){e.stopPropagation();renderPkmForm(parseInt(fm.getAttribute('data-form'),10));return;}
var cc=e.target.closest('[data-clear-confirm]');if(cc){e.stopPropagation();confirmClearModal();return;}
var pdu=e.target.closest('[data-notice-update]');if(pdu){e.stopPropagation();overlay.classList.remove('open');pkDoUpdate();return;}
var pkc=e.target.closest('[data-pk-copy-content]');if(pkc){e.stopPropagation();if(pkLatestContent){diyCopyText(pkLatestContent,function(ok){pkc.textContent=ok?'✔ 已复制':'复制失败';});}else{pkc.textContent='无内容';}return;}
var pkc2=e.target.closest('[data-pk-copy-content-close]');if(pkc2){e.stopPropagation();if(pkLatestContent){diyCopyText(pkLatestContent,function(ok){pkc2.textContent=ok?'✔ 已复制':'复制失败';hudScope.setTimeout(function(){overlay.classList.remove('open');clearBack();},400);});}else{pkc2.textContent='无内容';}return;}
    var btn=e.target.closest('[data-action]');if(btn){var action=btn.getAttribute('data-action');var key=btn.getAttribute('data-key');var p=stat_data.附近宝可梦&&stat_data.附近宝可梦[key];if(p)sendAction(p,action);}
  });
}

function fail(msg){try{var a=document.getElementById('pkm-hud-slot')||document.body;a.insertAdjacentHTML('beforeend','<div style="color:#faa;background:#300;padding:12px;font-family:monospace">'+msg+'</div>');}catch(e2){}}
function vpSize(){
  var w=WIN.innerWidth||360, h=WIN.innerHeight||640, ox=0, oy=0;
  try{
    var vv=WIN.visualViewport||window.visualViewport;
    if(vv&&vv.width&&vv.height){ w=vv.width; h=vv.height; ox=vv.offsetLeft||0; oy=vv.offsetTop||0; }
  }catch(e){}
  return {w:w,h:h,ox:ox,oy:oy};
}
/* 地图 popout 在手机浏览器上 vh 可能大于实际可见高度，导致页面整体偏高、顶部返回键被裁掉。
 * 这里按 visualViewport 实际可见高度给 .page/.page-body 设 px 上限。 */
function hudSyncMapPopoutHeight(){
  try{
    if(!pageOverlay||!pageOverlay.classList.contains('popout'))return;
    var vh=vpSize().h;
    var padTop=0,padBottom=0;
    try{var cs=WIN.getComputedStyle?WIN.getComputedStyle(pageOverlay):null;if(cs){padTop=parseFloat(cs.paddingTop)||0;padBottom=parseFloat(cs.paddingBottom)||0;}}catch(_e2){}
    var avail=Math.floor(vh-padTop-padBottom-4);
    if(avail<160)avail=160;
    var page=pageOverlay.querySelector('.page');
    if(page)page.style.maxHeight=avail+'px';
    var body=pageOverlay.querySelector('.page-body');
    if(body)body.style.maxHeight=Math.max(120,avail-44)+'px';
  }catch(e){}
}
var VP_Y=0.6;
/* 测量 .hud 的“自然高度”：先临时去掉 max-height，再读 scrollHeight，
 * 避免上一次打开的 max-height 影响本次测量，保证每次打开高度一致。 */
function hudMeasureNaturalH(){
  try{
    var hud=document.querySelector('.hud');
    if(!hud)return 0;
    var had=hud.style.maxHeight;
    hud.style.maxHeight='none';
    var h=hud.scrollHeight;
    if(had)hud.style.maxHeight=had;else hud.style.removeProperty('max-height');
    return h||0;
  }catch(e){return 0;}
}
function resizeFrame(){
  try{
    var hud=document.querySelector('.hud');
    var inner=document.getElementById('hud-inner');
    if(!hud||!inner)return;
    var f=window.frameElement;
    if(f){
      var active=document.querySelector('.tab-panel.active')||document.getElementById('tab-1');
      var h=active?active.scrollHeight:300;
      inner.style.removeProperty('height');
      var want=hud.offsetHeight+32;if(Math.abs((parseFloat(f.style.height)||0)-want)>1)f.style.height=want+'px';
      return;
    }
    var win=document.getElementById('pkm-hud-win');
if(win){
  var maxH=Math.floor(vpSize().h*0.86);
      win.style.maxHeight=maxH+'px';
      var natural=hudMeasureNaturalH();
      hud.style.maxHeight=(Math.min(natural+20,maxH))+'px';
    }
  }catch(e){}
}
function preloadBadges(){var r,t,i,im;for(r in BADGE_MAP){t=BADGE_MAP[r];for(i=0;i<t.length;i++){im=new Image();im.src=badgeUrl(r,t[i][0]);}}}
function ensureHud(){
  if(winMode==='0'){
    try{
      var b0=document.getElementById('pkm-hud-btn');if(b0)b0.style.display='none';
      var w0=document.getElementById('pkm-hud-win');if(w0){w0.classList.remove('open');w0.style.display='none';}
      var m0=document.getElementById('pkm-hud-mask');if(m0)m0.style.display='none';
      var s0=document.getElementById('pkm-hud-slot');if(s0){s0.innerHTML='';}
    }catch(e){}
    return;
  }
  if(document.getElementById('pkm-hud-btn'))return;

  var size=fabSize, edge=14;
var vp=vpSize();

var btn=document.createElement('div');
btn.id='pkm-hud-btn';
btn.title='宝可梦 HUD（可拖动）';
btn.style.width=fabSize+'px';
btn.style.height=fabSize+'px';
btn.style.fontSize=Math.round(fabSize*0.48)+'px';
btn.innerHTML='<img src="'+esc(fabImg||FAB_IMG_DEFAULT)+'" style="width:'+(fabSize-8)+'px;height:'+(fabSize-8)+'px" onerror="this.remove();this.parentNode.textContent=\'⚪\'">';
btn.style.left=(vp.w-size-edge)+'px';
btn.style.top=(vp.oy+vp.h-140-size)+'px';
document.body.appendChild(btn);
applyFabUpdateBadge();

  /* 恢复上次拖动的位置 */
  var saved=null;
  try{ saved=JSON.parse(localStorage.getItem('pkm_fab_pos')); }catch(e){}
  if(saved && saved.l!==undefined && saved.t!==undefined){
    btn.style.left=saved.l+'px';
    btn.style.top=saved.t+'px';
  }

  /* 自动修正酒馆页面的 transform 偏移 */
  function fixPos(wantX,wantY){
    try{
      var r=btn.getBoundingClientRect();
      var l=parseFloat(btn.style.left)||0;
      var t=parseFloat(btn.style.top)||0;
      btn.style.left=(l+(wantX-r.x))+'px';
      btn.style.top=(t+(wantY-r.y))+'px';
    }catch(e){}
  }
  if(!saved){ fixPos(vp.w-size-edge, vp.oy+vp.h-140-size); }

  var mask=document.createElement('div');
  mask.id='pkm-hud-mask';
  document.body.appendChild(mask);
  var win=document.createElement('div');
  win.id='pkm-hud-win';
  var close=document.createElement('button');
  close.id='pkm-hud-close';
  close.type='button';
  close.innerHTML='✕';
  win.appendChild(close);
  var slot=document.createElement('div');
  slot.id='pkm-hud-slot';
  win.appendChild(slot);
  document.body.appendChild(win);

  function centerWin(){
try{
  var vp2=vpSize();
  var cw=vp2.w, ch=vp2.h;
  var w=win.offsetWidth, h=win.offsetHeight;
  if(w<10||h<10){ w=Math.min(cw*0.94,650); h=Math.min(ch*0.86,560); }
  var wantX=Math.max(4, vp2.ox+(cw-w)/2);
  var wantY=Math.max(4, vp2.oy+(ch-h)*VP_Y);
    win.style.left=wantX+'px';
    win.style.top=wantY+'px';
    var r=win.getBoundingClientRect();
    win.style.left=(wantX+(wantX-r.x))+'px';
    win.style.top=(wantY+(wantY-r.y))+'px';
  }catch(e){}
}
/* 阻止悬浮窗内滚动触发浏览器下拉刷新 */
var touchY=0;
win.addEventListener('touchstart', function(e){ if(e.touches&&e.touches[0]) touchY=e.touches[0].clientY; }, {passive:true});
win.addEventListener('touchmove', function(e){
  try{
    if(!e.touches||!e.touches[0]) return;
    var t=e.target;
    if(t&&t.nodeType===1&&t.closest&&(t.closest('#pkm-lv')||t.closest('input,select,button,textarea,label'))){return;}
    var y=e.touches[0].clientY;
    if(y<=touchY){ touchY=y; return; }
    var el=t;
    if(el && el.nodeType!==1) el=el.parentElement;
    var atTop=true;
    while(el && el!==win && el!==document.body && el!==document.documentElement){
      if(el.scrollTop>0){ atTop=false; break; }
      el=el.parentElement;
    }
    touchY=y;
    if(atTop && e.cancelable){ e.preventDefault(); }
  }catch(err){}
}, {passive:false});

function open(){
  try{var _sd=loadStatData();if(_sd){stat_data=_sd;hudExternalStateChanged();hudRebuildLocationIndex();}nearbyOpen=false;foldState={};activeBag='道具';}catch(e){}
try{recordSeen();}catch(e){}
try{render();}catch(e){fail('HUD 渲染失败：'+e.message);}
  btn.style.display='none';
  hideMapFab();
  mask.classList.add('open');
  win.classList.add('open');
  try{ document.body.style.overflow='hidden'; }catch(e){}
  hudScope.setTimeout(function(){
    centerWin();
    resizeFrame();
  }, 30);
  /* 打开动画(0.18s)结束后只再校正一次窗高（不再重定位），
     避免 transform 归位后二次 centerWin 造成窗口自左往右的位移。 */
  hudScope.setTimeout(function(){
    resizeFrame();
  }, 230);
}
function closeHud(){
  btn.style.display='';
  hideMapFab();
  mask.classList.remove('open');
  win.classList.remove('open');
  try{ document.body.style.overflow=''; }catch(e){}
  try{
    var _vp=vpSize();
    var _l=parseFloat(btn.style.left);
    var _t=parseFloat(btn.style.top);
    var _maxL=Math.max(0,_vp.w-size);
    var _maxT=Math.max(0,_vp.h-size);
    if(isNaN(_l)||_l<0||_l>_maxL)_l=_vp.w-size-edge;
    if(isNaN(_t)||_t<0||_t>_maxT)_t=_vp.h-140-size;
    btn.style.left=Math.min(Math.max(0,_l),_maxL)+'px';
    btn.style.top=Math.min(Math.max(0,_t),_maxT)+'px';
    try{localStorage.setItem('pkm_fab_pos',JSON.stringify({l:parseFloat(btn.style.left),t:parseFloat(btn.style.top)}));}catch(e3){}
  }catch(e2){}
}
  function toggleHud(){ if(win.classList.contains('open'))closeHud(); else open(); }

  /* 拖动：手机触摸 + 桌面鼠标（长按弹地图按钮）。
   * 轻点只在 click 里统一 toggleHud，touchend/mouseup 不再直接切换，
   * 避免移动端 touchend 后浏览器补发的兼容 mousedown/mouseup 造成“开→立即关”（要点两次）。
   * 兼容鼠标事件用 fabSuppressMouseUntil 窗口屏蔽；轻点时悬浮球保持可见直到 click，
   * 因此兼容 click 仍落在悬浮球上，不会穿透到下方重叠的按钮。 */
var drag=null;
var longPressTimer=null,longPressFired=false;
var fabSkipClick=false;
var fabSuppressMouseUntil=0;
var mapFab=document.createElement('button');
mapFab.id='pkm-hud-mapfab';
mapFab.type='button';
mapFab.innerHTML='🗺️';
mapFab.title='打开地图';
document.body.appendChild(mapFab);
function showMapFab(){
  try{
    var r=btn.getBoundingClientRect();
    mapFab.style.left=(r.left + r.width/2 - 22)+'px';
    mapFab.style.top=(r.top - 52)+'px';
  }catch(e){}
  mapFab.classList.add('show');
}
function hideMapFab(){mapFab.classList.remove('show');}
mapFab.addEventListener('click',function(e){
  if(e.cancelable)e.preventDefault();e.stopPropagation();try{e.stopImmediatePropagation();}catch(_e){}
  hudArmGestureShield(mapFab,750);
  hideMapFab();
  try{
    quickMapFromFab=true;
    if(!win.classList.contains('open')){open();}
    openPage('map');
  }catch(err){}
});
hudScope.listen(document,'click',function(e){
  var t=e.target&&e.target.closest?e.target:null;
  if(!t||(!t.closest('#pkm-hud-mapfab') && !t.closest('#pkm-hud-btn'))){hideMapFab();}
});
function startDrag(cx,cy){
  hideMapFab();
  hudScope.clearTimeout(longPressTimer);
  longPressFired=false;
  drag={x:cx,y:cy,l:parseFloat(btn.style.left)||0,t:parseFloat(btn.style.top)||0,moved:false};
  longPressTimer=hudScope.setTimeout(function(){
    if(drag && !drag.moved){
      longPressFired=true;
      hudDisarmGestureShield();
      showMapFab();
      try{if(navigator.vibrate)navigator.vibrate(30);}catch(e2){}
    }
  },500);
}
function moveDrag(cx,cy){
  if(!drag)return;
  var dx=cx-drag.x, dy=cy-drag.y;
  if(Math.abs(dx)>8||Math.abs(dy)>8){
    drag.moved=true;
    hudScope.clearTimeout(longPressTimer);longPressTimer=null;
    hideMapFab();
  }
  if(drag.moved){
    btn.style.left=(drag.l+dx)+'px';
    btn.style.top=(drag.t+dy)+'px';
  }
}
function endDrag(e){
  if(!drag)return;
  var wasMove=drag.moved;
  var fired=longPressFired;
  drag=null;
  hudScope.clearTimeout(longPressTimer);longPressTimer=null;
  if(wasMove){
    /* 拖动结束：吞掉随后的 click，避免误开 HUD */
    fabSkipClick=true;
    try{ localStorage.setItem('pkm_fab_pos', JSON.stringify({l:parseFloat(btn.style.left), t:parseFloat(btn.style.top)})); }catch(err){}
    hudArmGestureShield(btn,750);
    if(e && e.cancelable){ e.preventDefault(); }
  }else if(fired){
    /* 长按已弹出地图按钮：吞掉随后的 click，并清除手势盾以免地图按钮点不动 */
    fabSkipClick=true;
    hudDisarmGestureShield();
  }else{
    /* 轻点：交给 click 统一触发 toggleHud，这里只做好手势盾与地图按钮隐藏 */
    fabSkipClick=false;
    hudArmGestureShield(btn,900);
    hideMapFab();
  }
}

  btn.addEventListener('touchstart', function(e){ e.stopPropagation();var t=e.touches[0]; startDrag(t.clientX,t.clientY); }, {passive:true});
  btn.addEventListener('touchmove', function(e){
    e.stopPropagation();if(!drag)return;
    var t=e.touches[0]; moveDrag(t.clientX,t.clientY);
    if(drag && drag.moved && e.cancelable){ e.preventDefault(); }
  }, {passive:false});
  btn.addEventListener('touchend', function(e){ e.stopPropagation();fabSuppressMouseUntil=Date.now()+750;endDrag(e); });
  btn.addEventListener('touchcancel', function(e){try{e.stopPropagation();}catch(_e){}fabSuppressMouseUntil=Date.now()+750;drag=null;hudScope.clearTimeout(longPressTimer);longPressTimer=null;hideMapFab(); });

  btn.addEventListener('mousedown', function(e){ e.stopPropagation();if(Date.now()<fabSuppressMouseUntil){if(e.cancelable)e.preventDefault();return;}startDrag(e.clientX,e.clientY); e.preventDefault(); });
  hudScope.listen(document,'mousemove', function(e){ if(Date.now()<fabSuppressMouseUntil)return; if(drag) moveDrag(e.clientX,e.clientY); });
  hudScope.listen(document,'mouseup', function(e){ if(Date.now()<fabSuppressMouseUntil)return; endDrag(e); });
  /* 轻点时悬浮球在 click 之前保持可见，兼容 click 会命中悬浮球并在此被消费；
     若点击仍落到 HUD 之外的其它按钮，则由 hudGhostClickGuard 短时吞掉。 */
  btn.addEventListener('click', function(e){
    if(e.cancelable)e.preventDefault();e.stopPropagation();try{e.stopImmediatePropagation();}catch(_e){}
    if(fabSkipClick){fabSkipClick=false;return;}
    hudArmGestureShield(btn,900);
    hideMapFab();
    toggleHud();
  });

  mask.addEventListener('click', function(e){if(e.cancelable)e.preventDefault();e.stopPropagation();hudArmGestureShield(mask,700);closeHud();});
  close.addEventListener('click', function(e){ if(e.cancelable)e.preventDefault();e.stopPropagation();hudArmGestureShield(close,700);closeHud(); });

  /* 旋转屏幕/键盘弹出时重新定位 */
  try{
    var _repos=function(){
  try{
    var vp3=vpSize();
    btn.style.left=(vp3.w-size-edge)+'px';
    btn.style.top=(vp3.oy+vp3.h-140-size)+'px';
    if(btn.style.display!=='none'){ fixPos(vp3.w-size-edge, vp3.oy+vp3.h-140-size); }
    if(win.classList.contains('open')){ centerWin(); }
  }catch(e){}
};
    var vv=WIN.visualViewport||window.visualViewport;
    if(vv){
      hudScope.listen(vv,'resize', _repos);
      hudScope.listen(vv,'scroll', _repos);
    }
    hudScope.listen(WIN,'resize', _repos);
  }catch(e){}
}

var pkmInlineAnchorMes=null, pkmLastRenderedSnap='';
function restoreInlineTabs(activeTab){
  try{
    var tabs=document.querySelectorAll('#pkm-hud-inline .tab-btn');
    for(var i=0;i<tabs.length;i++){tabs[i].classList.toggle('active',tabs[i].getAttribute('data-tab')===activeTab);}
    var panels=document.querySelectorAll('#pkm-hud-inline .tab-panel');
    for(var j=0;j<panels.length;j++){panels[j].classList.toggle('active',panels[j].id==='tab-'+activeTab);}
  }catch(e){}
}
function renderStatusBar(force){
  try{
    if(winMode==='1')return;
    var activeTab='1';
    var at=document.querySelector('#pkm-hud-inline .tab-btn.active');
    if(at)activeTab=at.getAttribute('data-tab')||'1';
    var pageWasOpen=false, pageKey=currentPageKey;
    if(pageOverlay&&pageOverlay.classList.contains('open'))pageWasOpen=true;
    var all=document.querySelectorAll('.mes[is_user="false"]');
    if(!all.length){all=document.querySelectorAll('.mes');}
    if(!all.length)return;
    var last=all[all.length-1];
    var inline=document.getElementById('pkm-hud-inline');
    var anchoredOk=!!(inline&&inline.isConnected&&last===pkmInlineAnchorMes);

    if(!anchoredOk){
      /* 首次/新消息：需要重建并移动锚点（低频，直接执行） */
      pkmLastRenderedSnap=pkmStateSnapshot(stat_data);
      document.querySelectorAll('#pkm-hud-inline').forEach(function(el){el.remove();});
      if(pageOverlay&&pageOverlay.parentElement===document.body){try{pageOverlay.remove();}catch(e){}}
      var ic=document.createElement('div');
      ic.id='pkm-hud-inline';
      var textEl=last.querySelector('.mes_text');
      if(textEl){textEl.insertAdjacentElement('afterend',ic);}else{last.appendChild(ic);}
      pkmInlineAnchorMes=last;
      render();
      restoreInlineTabs(activeTab);
      if(pageWasOpen&&pageKey){try{openPage(pageKey);}catch(e){}}
      return;
    }

    /* 锚点没变：就地刷新内容，不移除 #pkm-hud-inline，避免流式生成时闪屏 */
    var snap=pkmStateSnapshot(stat_data);
    if(!force && snap===pkmLastRenderedSnap)return;
    pkmLastRenderedSnap=snap;
    render();
    restoreInlineTabs(activeTab);
  }catch(e){}
}
var pkmAutoRefreshBound=false;
var pkmEventSourceActive=false;
function pkRefreshData(){
  try{
    var next=loadStatData();
    if(next){stat_data=next;hudExternalStateChanged();hudRebuildLocationIndex();}
  }catch(e){hudDiagError('pkRefreshData load',e);}
  try{if(winMode==='1')ensureHud();}catch(e){hudDiagError('pkRefreshData ensureHud',e);}
  try{recordSeen();}catch(e){}
  try{renderStatusBar();}catch(e){hudDiagError('statusbar render',e);}
  try{
    var hw=document.getElementById('pkm-hud-win');
    var ov=document.querySelector('.overlay.open,.page-overlay.open');
    if(hw&&hw.classList.contains('open')&&!ov){render();resizeFrame();}
  }catch(e){hudDiagError('HUD partial refresh',e);}
}
function pkBindAutoRefresh(){
  if(pkmAutoRefreshBound)return pkmEventSourceActive;
  pkmAutoRefreshBound=true;
  try{
    var w=WIN,ST=w&&w.SillyTavern,ctx=ST&&ST.getContext?ST.getContext():null;
    if(!(ctx&&ctx.eventSource&&typeof ctx.eventSource.on==='function'))return false;
    var evs=[
      (ctx.eventTypes&&ctx.eventTypes.MESSAGE_RECEIVED)||'message_received',
      (ctx.eventTypes&&ctx.eventTypes.MESSAGE_SENT)||'message_sent',
      (ctx.eventTypes&&ctx.eventTypes.CHAT_CHANGED)||'chat_changed',
      (ctx.eventTypes&&ctx.eventTypes.MESSAGE_SWIPED)||'message_swiped'
    ].filter(Boolean);
    var handler=function(){hudScope.setTimeout(function(){pkRefreshData();try{pkmAutoSnap=pkmStateSnapshot(stat_data);}catch(e){}},350);};
    evs.forEach(function(ev){hudScope.emitter(ctx.eventSource,ev,handler);});
    pkmEventSourceActive=evs.length>0;
    if(pkmEventSourceActive)hudDiagEvent('auto-sync','SillyTavern eventSource 主通道');
    return pkmEventSourceActive;
  }catch(e){hudDiagError('auto-refresh eventSource',e);return false;}
}
var pkmAutoSnap='';
var pkmAutoTimer=null;
var pkmAutoPending=false;
var pkmAutoChatObserver=null;
var pkmLastLocalWrite=0;
function pkmStateSnapshot(d){
  try{var raw=JSON.stringify(d||{}),h=2166136261;for(var i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16)+':'+raw.length;}catch(e){return '';}
}
function pkmAutoCheck(){
  try{
    if(hudPendingActions&&hudPendingActions.length)return;
    if((Date.now()-pkmLastLocalWrite)<1500)return;
    var ov=document.querySelector('.overlay.open,.page-overlay.open');if(ov)return;
    var d=loadStatDataLight();if(!d)return;
    var snap=pkmStateSnapshot(d);if(snap===pkmAutoSnap)return;
    pkmAutoSnap=snap;stat_data=d;hudExternalStateChanged();hudRebuildLocationIndex();
    try{recordSeen();}catch(e){}
    try{renderStatusBar();}catch(e){}
    try{var hw=document.getElementById('pkm-hud-win');if(hw&&hw.classList.contains('open')){render();resizeFrame();}}catch(e){}
    hudDiagInc('autoSyncUpdates');
  }catch(e){hudDiagError('auto-sync check',e);}
}
function pkmAutoSchedule(){
  if(pkmAutoPending)return;
  pkmAutoPending=true;
  hudScope.setTimeout(function(){pkmAutoPending=false;pkmAutoCheck();},550);
}
function pkmStartAutoUpdate(){
  pkmAutoSnap=pkmStateSnapshot(stat_data);
  /* eventSource 可用时作为主同步通道；仅保留低频安全校验，不再监听整个 document.body。 */
  var hasEvents=pkmEventSourceActive||pkBindAutoRefresh();
  if(!hasEvents){
    try{
      if(window.MutationObserver){
        var root=WIN.document.querySelector('#chat,.chat,.mes_block')||document.querySelector('#chat,.chat,.mes_block')||WIN.document.body||document.body;
        pkmAutoChatObserver=hudScope.observe(new MutationObserver(function(muts){
          for(var i=0;i<muts.length;i++){
            var m=muts[i];if(m.type!=='childList'||!m.addedNodes||!m.addedNodes.length)continue;
            for(var j=0;j<m.addedNodes.length;j++){
              var n=m.addedNodes[j];if(!n||n.nodeType!==1)continue;
              if((n.matches&&n.matches('.mes'))||(n.querySelector&&n.querySelector('.mes'))){pkmAutoSchedule();return;}
            }
          }
        }));
        pkmAutoChatObserver.observe(root,{subtree:true,childList:true});
        hudDiagEvent('auto-sync','局部聊天 MutationObserver fallback');
      }
    }catch(e){hudDiagError('auto-sync observer',e);}
  }
  try{
    var sb=WIN.document.querySelector('.statusbar-data-source')||document.querySelector('.statusbar-data-source');
    if(sb){var h=function(){pkmAutoSchedule();};hudScope.listen(sb,'input',h);hudScope.listen(sb,'change',h);}
  }catch(e){}
  if(!pkmAutoTimer){
    var cadence=hasEvents?30000:8000;
    pkmAutoTimer=hudScope.setInterval(function(){try{if(WIN.document.visibilityState==='hidden')return;}catch(e){}pkmAutoCheck();},cadence);
  }
}
function safeRender(){
  try{pkAutoCheckUpdate();}catch(e){}
  try{pkBindAutoRefresh();}catch(e){}
  try{pkmStartAutoUpdate();}catch(e){}
  try{recordSeen();}catch(e){}
  try{var _udc=WIN['updateDexContext'];if(typeof _udc==='function')_udc();}catch(e){}
  try{renderStatusBar();}catch(e){}
  hudScope.setTimeout(pkRefreshData,1200);
  hudScope.setTimeout(pkRefreshData,3000);
  try{preloadBadges();}catch(e){}
  if(winMode==='1'){try{render();}catch(e){fail('HUD 渲染失败：'+e.message);}try{resizeFrame();}catch(e){}}
  try{
    if(window.ResizeObserver){
      var _ro=hudScope.observe(new window.ResizeObserver(function(){if(window._roRaf)return;window._roRaf=requestAnimationFrame(function(){window._roRaf=0;resizeFrame();});}));
      var _hud=document.querySelector('.hud');if(_hud)_ro.observe(_hud);
    }
    hudScope.setTimeout(resizeFrame,300);hudScope.setTimeout(resizeFrame,1200);
  }catch(e){hudDiagError('ResizeObserver',e);}
}

function showErr(msg){
  try{
    if(msg && !/pkm|hud|poke|宝可梦|resolve|render|diy|badge|stat_data|teamHTML|trainerHTML|cardHTML|battleHTML/i.test(String(msg))){
      return;
    }
    var a=document.getElementById('pkm-hud-win')||document.body;
    var d2=document.createElement('div');
    d2.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#400;color:#fcc;padding:8px 12px;font-family:monospace;font-size:12px;line-height:1.4;white-space:pre-wrap';
    d2.textContent='⚠️ '+msg+'（点击关闭）';
    d2.onclick=function(){try{d2.parentNode&&d2.parentNode.removeChild(d2);}catch(e3){}};
    a.appendChild(d2);
  }catch(e2){}
}
hudScope.listen(WIN,'error',function(e){var m=String(e.message||'未知错误');if(m.indexOf('ResizeObserver')>=0)return;hudDiagError('window.error',new Error(m));showErr(m);});
hudScope.listen(WIN,'unhandledrejection',function(e){var m=String((e.reason&&e.reason.message)||e.reason||'未处理的Promise错误');hudDiagError('unhandledrejection',new Error(m));showErr(m);});
try{pkReadUpdateCache();}catch(e){}
try{ensureHud();}catch(e){}
try{if(boot&&typeof boot.coreReady==='function')boot.coreReady();}catch(e){}
(function(){
  var done=false,finish=function(){if(done)return;done=true;safeRender();try{if(boot&&typeof boot.ready==='function')boot.ready();}catch(e){}};
  try{Promise.race([Promise.resolve(hudCacheInitPromise),new Promise(function(res){hudScope.setTimeout(res,250);})]).then(finish,finish);}catch(e){finish();}
})();
}
/* ===== 启动器：优先运行本地 IndexedDB 里的更高版本 ===== */
var PK_BOOT_DELEGATED=null;
try{PK_BOOT_DELEGATED=WIN.__PK_HUD_DELEGATED_BOOT__||null;}catch(e){}
if(PK_BOOT_DELEGATED){
  try{runPkmHud(PK_BOOT_DELEGATED);}catch(e){}
}else{
  (async function(){
    var fb={coreReady:function(){},ready:function(){},reportError:function(){}};
    try{
      var active=await pkSlotRead('active');
      if(active&&active.version&&pkVerCompare(active.version,PK_VER)>0){
        if(await pkValidRecord(active)){
          var coreAck=false;
          var delegated={coreReady:function(){coreAck=true;},ready:function(){try{pkMarkHealthy(active.version);}catch(e){}},reportError:function(){}};
          WIN.__PK_HUD_DELEGATED_BOOT__=delegated;
          try{
            new Function(active.content).call(window);
            if(!coreAck)throw new Error('新版未完成启动握手');
            try{delete WIN.__PK_HUD_DELEGATED_BOOT__;}catch(e){}
            return;
          }catch(e){
            try{pkRollbackPending(active.version);}catch(e2){}
            var prev=null;
            try{prev=await pkSlotRead('active');}catch(e2){}
            if(prev&&await pkValidRecord(prev)){
              try{new Function(prev.content).call(window);}catch(e2){}
              try{delete WIN.__PK_HUD_DELEGATED_BOOT__;}catch(e2){}
              return;
            }
            try{delete WIN.__PK_HUD_DELEGATED_BOOT__;}catch(e2){}
          }
        }else{
          try{pkRollbackRecord();}catch(e2){}
        }
      }
    }catch(e){}
    try{runPkmHud(fb);}catch(e){}
  })();
}
})();