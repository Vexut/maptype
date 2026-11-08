/* maptype app */
(function(){
"use strict";
var D=window.TYPEMAP_DATA;
var NS="http://www.w3.org/2000/svg";
var W=D.vb[0], H=D.vb[1];
var el=function(id){return document.getElementById(id)};
var svg=el("map"), cam=el("cam"), inp=el("inp"), lineEl=el("line"), capEl=el("cap"), countEl=el("count");
var typing=el("typing"), resEl=el("res"), keysEl=el("keys");
var CONTACT=""; /* optional: put an email address here to show it in the privacy section */
svg.setAttribute("viewBox","0 0 "+W+" "+H);

var paths=D.c.map(function(c,i){
  var p=document.createElementNS(NS,"path");
  p.setAttribute("d",c.d); cam.appendChild(p); c.i=i; return p;
});
/* rivers, seas, mountains and deserts: hidden until one of them is the current question.
   Seas sit under the countries, everything else on top. */
var PHYS=(window.TYPEMAP_PHYS||[]).map(function(f){
  var p=document.createElementNS(NS,"path");
  p.setAttribute("d",f.d); p.setAttribute("class","ph "+f.k);
  if(f.k==="sea") cam.insertBefore(p,paths[0]); else cam.appendChild(p);
  f.el=p; f.b2=f.b; return f;
});
var TOPICS={countries:null,rivers:"river",seas:"sea",mountains:"mountain",deserts:"desert"};   /* any combination can be on */
var CAPS=window.TYPEMAP_CAPS||{};
/* items switched off in the settings sheet (countries "c:Name", others "river:Name" ...) */
var OFF=(function(){try{return new Set(JSON.parse(localStorage.getItem("tm-off")||"[]"))}catch(e){return new Set()}})();
function idOf(c){return (c.k||"c")+":"+c.f}
function included(c){return !OFF.has(idOf(c))}

function load(k,def,ok){try{var v=localStorage.getItem("tm-"+k);return ok.indexOf(v)>=0?v:def}catch(e){return def}}
function save(k,v){try{localStorage.setItem("tm-"+k,v)}catch(e){}}
/* Languages for the name picker. Country names come from the browser (Intl.DisplayNames);
   English and a few other languages use our own hand-checked names. */
var ISO=window.TYPEMAP_ISO||{}, dn={};
var LANGS=[["en","English"],["fi","Suomi"],["sv","Svenska"],["da","Dansk"],["nb","Norsk"],["de","Deutsch"],["nl","Nederlands"],
["fr","Français"],["es","Español"],["pt","Português"],["it","Italiano"],["ca","Català"],["pl","Polski"],["cs","Čeština"],["sk","Slovenčina"],
["hu","Magyar"],["ro","Română"],["et","Eesti"],["lv","Latviešu"],["lt","Lietuvių"],["tr","Türkçe"],["id","Bahasa Indonesia"],
["ru","Русский"],["uk","Українська"],["bg","Български"],["sr","Српски"],["el","Ελληνικά"]];
var S={
  mode:load("mode","copy",["copy","recall","hint"]),
  region:load("region","world",Object.keys(D.regions)),
  ask:load("ask","country",["country","capital","both"]),
  lang:load("lang","en",LANGS.map(function(l){return l[0]}).concat("both")),
  topics:(function(){
    try{var v=(localStorage.getItem("tm-topics")||"").split(",").filter(function(t){return t in TOPICS});if(v.length) return v}catch(e){}
    return ["countries"];
  })(),
  limit:load("limit","all",["all","10","20","30","50","100"]),   /* questions per round */
  order:load("order","random",["random","az"]),
  retry:load("retry","on",["on","off"]),                          /* ask missed ones again at the end */
  speed:load("speed","normal",["slow","normal","fast","instant"]), /* camera travel */
  game:load("game","off",["off","on"])   /* stopwatch on / off */
};
if(S.mode==="hint") S.mode="recall";   /* the old hint mode now lives inside recall */
if(S.lang==="both") S.lang="fi"; /* old saved setting */

var timer=0, hintOn=false, hintBtn=document.getElementById("hintBtn");
var queue=[], ptr=0, cur=null, buf="", reveal=false, finished=false;
var missed=new Set(), requeued=new Set(), good=0, total=0, t0=0;

function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function fold(s){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function key(s){return fold(s).replace(/[^\p{L}\p{N}]/gu,"")}
function same(a,b){
  a=fold(a); b=fold(b);
  if(a===b) return true;
  if((a==="-"||a===" ")&&(b==="-"||b===" ")) return true;
  if((a==="'"||a==="\u2019")&&(b==="'"||b==="\u2019")) return true;
  return false;
}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t}return a}
function nameOf(c,l){
  if(l==="en") return c.f;
  if(c.k) return l==="fi"?c.fi:((c.n&&c.n[l])||c.f);   /* rivers, seas, mountains, deserts */
  if(l==="fi") return c.fi;
  var code=ISO[c.f]; if(!code) return c.f;
  try{
    var d=dn[l]||(dn[l]=new Intl.DisplayNames([l],{type:"region"}));
    var n=d.of(code); return n&&n!==code?n:c.f;
  }catch(e){return c.f}
}
function langLabel(l){for(var i=0;i<LANGS.length;i++) if(LANGS[i][0]===l) return LANGS[i][1]; return l}
function prep(t){
  var c=t.c;
  if(t.k==="n"){
    t.t=nameOf(c,t.l);
    t.al=t.l==="fi"?c.fa:t.l==="en"?c.a:(c.k?[c.f].concat(c.a):[])
  }else{
    var cp=t.l==="fi"?c.pf:((CAPS[t.l]&&CAPS[t.l][ISO[c.f]])||c.p);
    t.t=cp; t.al=c.pa.concat(cp!==c.p?[c.p]:[]);          /* the English name is accepted too */
  }
}
function matches(){
  var k=key(buf); if(!k) return false;
  if(k===key(cur.t)) return true;
  return cur.al.some(function(x){return key(x)===k});
}

/* Camera: no zoom setting. How much of the surroundings is shown, and how slowly the
   camera travels, both depend on the country's size on the map. Small countries get a
   wide view with lots of neighbours and a slow flight; big countries get a tight view and
   a quick one. Between two countries the camera first zooms OUT, pans, then zooms in, so
   you see where the next one is relative to the last. */
var reduceMotion=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
/* On a phone the map box is taller than the world is wide, so the map is cropped at the sides
   (slice) instead of shrunk. viewScale() is how much of the map width is visible (1 = all). */
function viewScale(){
  var narrow=window.matchMedia&&matchMedia("(max-width:640px)").matches;
  svg.setAttribute("preserveAspectRatio",narrow?"xMidYMid slice":"xMidYMid meet");
  if(!narrow) return 1;
  var r=svg.getBoundingClientRect(); if(!r.width||!r.height) return 1;
  return Math.max(.3,Math.min(1,H*(r.width/r.height)/W));
}
var camX=W/2, camY=H/2, camRaf=0;
var camS={k:1,cx:W/2,cy:H/2};               /* what the camera shows right now */
cam.style.transition="none";
function camNow(){return camS}
function setCam(k,cx,cy){
  camS={k:k,cx:cx,cy:cy};
  /* an SVG attribute, not CSS: the browser can never turn it into a stretched bitmap */
  cam.setAttribute("transform","translate("+(W/2-cx*k)+" "+(H/2-cy*k)+") scale("+k+")");
}
/* The camera is moved by redrawing the vector map every frame (not by animating a bitmap
   of it), so lines and borders stay sharp the whole way, also when zoomed in mid-flight. */
function flyTo(k,cx,cy,dur,midK){
  if(camRaf){cancelAnimationFrame(camRaf);camRaf=0}
  if(reduceMotion||S.speed==="instant"){setCam(k,cx,cy);return}
  var a=camS, lk0=Math.log(a.k), lk1=Math.log(k), lkm=Math.log(midK||Math.min(a.k,k));
  var t0=performance.now();
  function ease(u){u=Math.max(0,Math.min(1,u));return u*u*u*(u*(6*u-15)+10)} /* smootherstep */
  function lerp(x,y,w){return x+(y-x)*w}
  /* 1) zoom out where we are  2) glide across while zoomed out  3) zoom in on the target.
     The three stages overlap a little so the motion never stops dead between them. */
  function frame(now){
    var u=Math.min(1,Math.max(0,(now-t0)/(dur*1000))), lk;
    if(u<.32) lk=lerp(lk0,lkm,ease(u/.32));
    else if(u<.62) lk=lkm;
    else lk=lerp(lkm,lk1,ease((u-.62)/.38));
    var w=ease((u-.2)/.6);
    setCam(Math.exp(lk),lerp(a.cx,cx,w),lerp(a.cy,cy,w));
    camRaf=u<1?requestAnimationFrame(frame):0;
  }
  camRaf=requestAnimationFrame(frame);
}

/* The bounding box stored in the data only covers the biggest piece of a country, so island
   countries (Indonesia, Japan, the Philippines ...) would not fit in the window. Build the
   box from all pieces that lie reasonably close to the main one. Far-away overseas bits
   (Alaska-style exclaves, wrap-around pieces at the map edge) are ignored. */
function fullBox(c){
  var parts=c.d.split("M").slice(1).map(function(sp){
    var n=sp.match(/-?\d+\.?\d*/g).map(Number), b=[1e9,1e9,-1e9,-1e9];
    for(var i=0;i+1<n.length;i+=2){
      if(n[i]<b[0])b[0]=n[i]; if(n[i]>b[2])b[2]=n[i];
      if(n[i+1]<b[1])b[1]=n[i+1]; if(n[i+1]>b[3])b[3]=n[i+1];
    }
    return b;
  });
  var u=c.b.slice(), gap=W*.12, grew=true, used={};
  while(grew){
    grew=false;
    parts.forEach(function(p,i){
      if(used[i]) return;
      if(p[0]<u[2]+gap&&p[2]>u[0]-gap&&p[1]<u[3]+gap&&p[3]>u[1]-gap){
        used[i]=1; grew=true;
        u=[Math.min(u[0],p[0]),Math.min(u[1],p[1]),Math.max(u[2],p[2]),Math.max(u[3],p[3])];
      }
    });
  }
  return u;
}
D.c.forEach(function(c){c.b2=fullBox(c)});
/* Never zoom in further than this. At 2.4x the window still shows about 40% of the world
   across, so you can always see which continent the country is on and what is around it. */
var MAX_K=2.4;
var CROWD_OK=24; /* up to this many other countries in view is fine */
function neighboursInView(c,cx,cy,k){
  var x0=cx-W/(2*k), x1=cx+W/(2*k), y0=cy-H/(2*k), y1=cy+H/(2*k), n=0;
  for(var i=0;i<D.c.length;i++){
    if(D.c[i]===c) continue;
    var b=D.c[i].b, mx=(b[0]+b[2])/2, my=(b[1]+b[3])/2;
    if(mx>x0&&mx<x1&&my>y0&&my<y1) n++;
  }
  return n;
}
var manualCam=false;   /* true while the player has zoomed / panned by hand */
function zoomTo(c){
  manualCam=false;
  if(!c){
    camX=W/2; camY=H/2;
    flyTo(viewScale(),W/2,H/2,1,0); return;
  }
  var b=c.b2, bw=Math.max(b[2]-b[0],1), bh=Math.max(b[3]-b[1],1);
  var size=Math.max(bw/W,bh/H);                              /* share of the map width/height */
  var t=Math.log(size/.005)/Math.log(.25/.005);              /* 0 = tiny ... 1 = huge */
  t=Math.max(0,Math.min(1,t));
  var f=.03+.4*Math.pow(t,2.2);                             /* share of the view the country fills */
  var k=Math.min(W*f/bw,H*f/bh); k=Math.max(1,Math.min(MAX_K,k));
  var cx=(b[0]+b[2])/2, cy=(b[1]+b[3])/2;
  /* Crowded places (Europe, the Balkans, Central Asia, West Africa ...) turn into a mess of
     border lines when zoomed in. The more countries that would be in view, the further we
     pull back (by at most about a third). */
  var crowd=neighboursInView(c,cx,cy,k);
  k=Math.max(1,k*Math.max(.7,Math.min(1,CROWD_OK/Math.max(crowd,1))));
  k=Math.max(1,Math.min(k,W*.9/bw,H*.9/bh));                 /* the whole country must fit in the window */
  var sc=viewScale(); k*=sc;                                  /* narrow phone window: show a smaller part of the map */
  var dx=Math.abs(cx-camX), dy=Math.abs(cy-camY);
  var dist=Math.min(1,Math.hypot(dx/W,dy/H)*2);
  var dur=(1+(1-t)*1.2+dist*.9)*({slow:1.7,normal:1,fast:.6,instant:0}[S.speed]||1);   /* seconds, normally 1 .. 3.1 */
  /* zoomed-out level for the middle of the trip: wide enough to show both ends */
  var from=camNow();
  var lowest=Math.min(from.k,k);
  var midK=Math.min(lowest*.9,sc*W/(dx*1.4+W*.25),sc*H/(dy*1.4+H*.3));   /* very subtle: about a tenth out, a bit more only if far */
  midK=Math.max(sc,lowest*.8,midK);
  flyTo(k,cx,cy,dur,(midK<lowest*.97)?midK:0);
  camX=cx; camY=cy;
}
function hasTopic(t){return S.topics.indexOf(t)>=0}
function applyRegionDim(){
  var set=new Set(D.regions[S.region]), dim=hasTopic("countries")&&S.region!=="world";
  paths.forEach(function(p,i){p.classList.toggle("out",dim&&!set.has(i))});
}
function highlight(c){
  paths.forEach(function(p){p.classList.remove("on")});
  PHYS.forEach(function(f){f.el.classList.remove("on")});
  if(c){var p=c.el||paths[c.i]; p.classList.add("on"); if(c.k!=="sea") cam.appendChild(p);}
}

function captionFor(){
  var w=cur.k==="p"?"capital":"name";
  if(timed()&&!t0) return "the stopwatch starts when you type the first letter";
  if(S.mode==="copy") return "type the "+w+" you see";
  if(hintOn) return "first letter given \u00b7 enter to give up";
  return "type the "+w+" from memory \u00b7 enter for a hint";
}
function timed(){return S.game==="on"}
function clock(ms){
  /* plain words: seconds, then minutes, then hours when needed */
  ms=Math.max(0,Number(ms)||0);
  var tot=ms/1000, h=Math.floor(tot/3600), m=Math.floor((tot%3600)/60), sec=tot%60;
  if(h) return h+" h "+m+" min "+Math.floor(sec)+" s";
  if(m) return m+" min "+Math.floor(sec)+" s";
  return sec.toFixed(1)+" s";
}
var lastLab="";
function counterHtml(lab){
  if(lab!==undefined) lastLab=lab;
  var prog=(Math.min(ptr+1,queue.length))+"/"+queue.length+lastLab;
  if(!timed()) return prog;
  return '<span class="clk">'+clock(t0?performance.now()-t0:0)+"</span> \u00b7 "+prog;
}
function stopTimer(){if(timer){clearInterval(timer);timer=0}}
function startTimer(){
  stopTimer();
  timer=setInterval(function(){countEl.innerHTML=counterHtml()},100);
}
function bestKey(){return "tm-besttime-"+S.region+"-"+S.ask+"-"+S.lang+"-"+S.mode}
function getBest(){try{return parseInt(localStorage.getItem(bestKey()),10)||0}catch(e){return 0}}
function setBest(n){try{localStorage.setItem(bestKey(),String(n))}catch(e){}}
function render(){
  if(!cur) return;
  var t=cur.t, n=Math.max(t.length,buf.length), h="", showFull=(S.mode==="copy"||reveal);
  for(var i=0;i<=n;i++){
    if(i===buf.length) h+='<span class="caret"></span>';
    if(i>=n) break;
    var ch, cls="";
    if(i<buf.length){
      var ok=i<t.length&&same(buf[i],t[i]);
      if(ok){ch=t[i];cls="ok"}
      else{ch=(S.mode==="copy"&&i<t.length)?t[i]:buf[i];cls="bad"+(ch===" "?" sp":"")}
    }else if(showFull){ch=t[i]}
    else if(hintOn&&i===0){ch=t[0]}
    else continue;
    h+=cls?'<span class="'+cls+'">'+esc(ch)+'</span>':'<span>'+esc(ch)+'</span>';
  }
  lineEl.innerHTML=h;
  var bits=[];
  if(cur.k==="p") bits.push("capital of "+nameOf(cur.c,cur.l));
  var KIND={river:"river",sea:"sea / ocean",mountain:"mountain range",desert:"desert"}, kc=cur.c.k;
  var lab=bits.length?'<span class="of">'+esc(bits.join(" \u00b7 "))+'</span>':"";
  if(kc) lab+='<span class="of">'+KIND[kc]+'</span>';     /* what kind of thing is highlighted, styled like "capital of ..." */
  countEl.innerHTML=counterHtml(lab);
  if(reveal){capEl.className="cap err";capEl.textContent="it\u2019s "+cur.t+" \u2013 type it to learn it"}
  else{capEl.className="cap";capEl.textContent=captionFor()}
  keysEl.hidden=(S.mode==="copy"||reveal);
  keysEl.innerHTML=(S.mode==="recall"&&!hintOn)?"<kbd>enter</kbd> hint \u00b7 <kbd>enter</kbd> again to give up":"<kbd>enter</kbd> give up and see the answer";
  hintBtn.hidden=!(S.mode==="recall"&&!hintOn&&!reveal);
}

function makeTasks(list){
  var out=[], langs=[S.lang];
  function add(c,k){
    var seen={};
    langs.forEach(function(l){
      var t={c:c,k:k,l:l}; prep(t);
      var kk=key(t.t); if(seen[kk]) return; seen[kk]=1; out.push(t);
    });
  }
  var ordered=S.order==="az"
    ? list.slice().sort(function(a,b){return nameOf(a,S.lang).localeCompare(nameOf(b,S.lang),S.lang)})
    : shuffle(list.slice());
  ordered.forEach(function(c){
    var ask=c.k?"country":S.ask;   /* rivers, seas ... are always asked by name */
    if(ask!=="capital") add(c,"n");
    if(ask!=="country") add(c,"p");
  });
  if(S.limit!=="all") out=out.slice(0,parseInt(S.limit,10));
  return out;
}
function next(){
  if(ptr>=queue.length){finish();return}
  cur=queue[ptr]; prep(cur); buf=""; inp.value=""; reveal=false; hintOn=false;
  highlight(cur.c); zoomTo(cur.c); render();
}
function start(tasks){
  stopTimer();
  queue=tasks; ptr=0; missed=new Set(); requeued=new Set();
  good=0; total=0; t0=0; finished=false;
  resEl.hidden=true; typing.hidden=false;
  next(); focusInput();
}
function nothingSelected(){
  stopTimer(); cur=null; finished=true; highlight(null); zoomTo(null);
  resEl.innerHTML='<h2>nothing selected</h2><p class="best">Everything in the chosen topics is switched off.</p>'+
    '<div class="acts"><button type="button" id="openSet2">open settings</button></div>';
  resEl.hidden=false; typing.hidden=true; keysEl.hidden=true;
  el("openSet2").onclick=function(){openSheet()};
}
function startRegion(){
  applyRegionDim();
  var list=[];
  if(hasTopic("countries")) list=D.regions[S.region].map(function(i){return D.c[i]});
  var kinds=S.topics.map(function(t){return TOPICS[t]}).filter(Boolean);
  list=list.concat(PHYS.filter(function(f){return kinds.indexOf(f.k)>=0})).filter(included);
  if(!list.length){ nothingSelected(); return; }
  start(makeTasks(list));
}
function success(){ptr++;next()}
function miss(){
  reveal=true; missed.add(cur);
  if(S.retry==="on"&&!requeued.has(cur)){requeued.add(cur);queue.push(cur)}
  buf=""; inp.value=""; render();
}
function fmt(ms){return clock(ms)}
function finish(){
  stopTimer();
  finished=true; cur=null; highlight(null); zoomTo(null);
  var acc=total?Math.round(100*good/total):100;
  var elapsed=t0?performance.now()-t0:0, time=t0?fmt(elapsed):"0.0 s", best=0, isBest=false;
  if(timed()&&t0){
    var prev=getBest(); best=prev;
    if(!prev||elapsed<prev){setBest(Math.round(elapsed)); isBest=!!prev; best=Math.round(elapsed)}
  }
  var list=Array.from(missed);
  var h='<div class="stats">'+
    '<div class="stat"><div class="l">accuracy</div><div class="val">'+acc+'%</div></div>'+
    '<div class="stat"><div class="l">answers</div><div class="val">'+(queue.length-requeued.size)+'</div></div>'+
    '<div class="stat"><div class="l">time</div><div class="val">'+time+'</div></div></div>';
  if(timed()&&t0) h+='<p class="best">'+(isBest?"new best time!":"best time: "+fmt(best))+"</p>";
  if(list.length){
    h+='<h2>missed</h2><div class="miss">'+list.map(function(t){
      return "<span>"+esc(t.t)+(t.k==="p"?" ("+esc(nameOf(t.c,t.l))+")":"")+"</span>"}).join("")+"</div>";
  }
  h+='<div class="acts">'+(list.length?'<button type="button" id="retry">practise missed</button>':"")+
     '<button type="button" id="again">go again</button></div>';
  resEl.innerHTML=h; resEl.hidden=false; typing.hidden=true; keysEl.hidden=true;
  var r=el("retry"); if(r) r.onclick=function(){start(list.map(function(t){return {c:t.c,k:t.k,l:t.l}}))};
  el("again").onclick=startRegion;
}

inp.addEventListener("input",function(){
  if(!cur||finished){inp.value="";return}
  var v=inp.value.replace(/[\r\n]/g,"");
  if(v.length>buf.length){
    if(!t0){t0=performance.now(); if(timed()) startTimer()}
    for(var i=buf.length;i<v.length;i++){total++; if(i<cur.t.length&&same(v[i],cur.t[i])) good++}
  }
  buf=v;
  if(matches()){success();return}
  if(!reveal&&S.mode!=="copy"&&key(buf).length>=key(cur.t).length){miss();return}
  render();
});
inp.addEventListener("keydown",function(e){
  if(e.key==="Tab"){e.preventDefault();startRegion();return}
  if(e.key==="Enter"){
    e.preventDefault();
    if(cur&&!reveal&&S.mode!=="copy"){
      if(S.mode==="recall"&&!hintOn){hintOn=true;render()}   /* first enter = hint, second = give up */
      else miss();
    }
  }
});
document.addEventListener("keydown",function(e){
  var ae=document.activeElement;
  if(!el("sheet").hidden) return;                  /* settings sheet is open */
  if(ae&&ae.tagName==="INPUT"&&ae!==inp) return; /* typing in the language search */
  if(ae!==inp&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(e.key==="Tab"){e.preventDefault();startRegion();return}
    if(e.key.length===1) inp.focus();
  }
});
function focusInput(){inp.focus({preventScroll:true})}
inp.addEventListener("focus",function(){typing.classList.remove("blurred")});
inp.addEventListener("blur",function(){typing.classList.add("blurred")});
typing.addEventListener("click",focusInput);
hintBtn.addEventListener("click",function(e){
  e.stopPropagation();
  if(cur&&!reveal&&S.mode==="recall"&&!hintOn){hintOn=true;render()}
  focusInput();
});
el("restart").addEventListener("click",function(e){e.stopPropagation();startRegion()});

function syncButtons(){
  var geo=hasTopic("countries");
  el("swBtn").setAttribute("aria-pressed",String(S.game==="on"));
  document.querySelectorAll("[data-topic]").forEach(function(b){b.setAttribute("aria-pressed",String(hasTopic(b.dataset.topic)))});
  el("regionGrp").hidden=!geo; el("askGrp").hidden=!geo;
  el("langCur").textContent=langLabel(S.lang);
  document.querySelectorAll("[data-k]").forEach(function(b){
    b.setAttribute("aria-pressed",String(S[b.dataset.k]===b.dataset.v));
  });
}
el("opts").addEventListener("click",function(e){
  if(e.target.closest("#swBtn")){                  /* stopwatch: tick on / off */
    S.game=S.game==="on"?"off":"on"; save("game",S.game); syncButtons(); startRegion(); return;
  }
  var tb=e.target.closest("[data-topic]");
  if(tb){                                          /* switch a topic on or off; at least one stays on */
    var t=tb.dataset.topic, i=S.topics.indexOf(t);
    if(i>=0){ if(S.topics.length>1) S.topics.splice(i,1); else return; }
    else S.topics.push(t);
    save("topics",S.topics.join(",")); syncButtons(); startRegion(); return;
  }
  var b=e.target.closest("[data-k]"); if(!b) return;
  var k=b.dataset.k; S[k]=b.dataset.v; save(k,S[k]);
  syncButtons();
  startRegion();
});

/* language picker: button + searchable list */
var langBtn=el("langBtn"), langPanel=el("langPanel"), langSearch=el("langSearch"), langList=el("langList");
function fillLangs(q){
  q=fold(q||"").trim(); var h="";
  LANGS.forEach(function(l){
    if(q&&fold(l[1]).indexOf(q)<0&&l[0].indexOf(q)<0) return;
    h+='<button type="button" role="option" data-lang="'+l[0]+'" aria-selected="'+(l[0]===S.lang)+'">'+esc(l[1])+'</button>';
  });
  langList.innerHTML=h||'<span class="none">no match</span>';
}
function toggleLangs(open){
  langPanel.hidden=!open; langBtn.setAttribute("aria-expanded",String(open));
  if(open){langSearch.value=""; fillLangs(""); langSearch.focus()}
}
function pickLang(l){
  toggleLangs(false); S.lang=l; save("lang",l); syncButtons(); startRegion();
}
langBtn.addEventListener("click",function(e){e.stopPropagation();toggleLangs(langPanel.hidden)});
langSearch.addEventListener("input",function(){fillLangs(langSearch.value)});
langSearch.addEventListener("keydown",function(e){
  if(e.key==="Enter"){e.preventDefault();var f=langList.querySelector("[data-lang]");if(f) pickLang(f.dataset.lang)}
  if(e.key==="Escape"){e.stopPropagation();toggleLangs(false);focusInput()}
});
langList.addEventListener("click",function(e){var b=e.target.closest("[data-lang]"); if(b) pickLang(b.dataset.lang)});
document.addEventListener("click",function(e){if(!langPanel.hidden&&!e.target.closest(".langpick")) toggleLangs(false)});

/* settings: always visible on wide screens, folded behind a button on phones */
var optsEl=el("opts"), optsBtn=el("optsBtn");
optsBtn.addEventListener("click",function(e){
  e.stopPropagation(); var open=!optsEl.classList.contains("open");
  optsEl.classList.toggle("open",open); optsBtn.setAttribute("aria-expanded",String(open));
});
optsEl.addEventListener("click",function(e){
  /* on a phone, picking a topic / difficulty closes the panel so the game is in view */
  if(e.target.closest("[data-k]")&&window.matchMedia("(max-width:640px)").matches){
    optsEl.classList.remove("open"); optsBtn.setAttribute("aria-expanded","false");
  }
});

/* settings sheet: pick exactly which items are asked, plus the more niche options */
var sheet=el("sheet"), sheetBody=el("sheetBody"), sheetChanged=false;
var TOPIC_TITLES=[["countries","Countries",null],["rivers","Rivers","river"],["seas","Seas & oceans","sea"],["mountains","Mountains","mountain"],["deserts","Deserts","desert"]];
function itemsOf(topic){
  var kind=TOPICS[topic];
  var arr=kind?PHYS.filter(function(f){return f.k===kind}):D.c.slice();
  return arr.sort(function(a,b){return a.f.localeCompare(b.f)});
}
function optRow(label,key,vals,hint){
  return '<div class="srow"><div class="slabel">'+label+(hint?'<small>'+hint+'</small>':'')+'</div><div class="grp">'+
    vals.map(function(v){return '<button type="button" data-set="'+key+'" data-val="'+v[0]+'" aria-pressed="'+(S[key]===v[0])+'">'+v[1]+'</button>'}).join("")+'</div></div>';
}
function buildSheet(){
  var h='<input type="text" id="itemSearch" class="isearch" placeholder="search all lists" autocomplete="off" spellcheck="false" aria-label="Search the lists">';
  h+='<h3>What to include</h3><p class="snote">Tick exactly what you want to be asked. Switch topics on or off in the main bar.</p>';
  TOPIC_TITLES.forEach(function(t){
    var items=itemsOf(t[0]);
    h+='<details class="sec" data-topic-sec="'+t[0]+'"><summary><span class="stitle">'+t[1]+'</span><span class="cnt" data-cnt="'+t[0]+'"></span></summary>'+
      '<div class="stools">'+
      '<button type="button" data-all="'+t[0]+'">select all</button><button type="button" data-none="'+t[0]+'">select none</button>';
    if(t[0]==="countries"){
      h+='<span class="only">only:</span>'+Object.keys(D.regions).filter(function(r){return r!=="world"}).map(function(r){
        return '<button type="button" data-only="'+r+'">'+r+'</button>'}).join("");
    }
    h+='</div><div class="items">'+items.map(function(c){
      var id=idOf(c);
      return '<label class="it" data-n="'+esc(fold(c.f))+'"><input type="checkbox" data-id="'+esc(id)+'"'+(OFF.has(id)?'':' checked')+'> <span>'+esc(c.f)+'</span></label>';
    }).join("")+'</div></details>';
  });
  h+='<h3>Round</h3>'+
    optRow("Questions per round","limit",[["all","all"],["10","10"],["20","20"],["30","30"],["50","50"],["100","100"]])+
    optRow("Order","order",[["random","random"],["az","A to Z"]])+
    optRow("Missed ones","retry",[["on","ask again"],["off","skip"]],"ask them again at the end of the round")+
    '<h3>Camera</h3>'+
    optRow("Travel speed","speed",[["slow","slow"],["normal","normal"],["fast","fast"],["instant","instant"]])+
    '<h3>Data</h3><div class="srow"><div class="slabel">Reset everything<small>settings, selections and best times</small></div><button type="button" class="danger" id="resetAll">reset</button></div>';
  sheetBody.innerHTML=h; refreshCounts();
}
function refreshCounts(){
  TOPIC_TITLES.forEach(function(t){
    var items=itemsOf(t[0]), on=items.filter(included).length, c=sheetBody.querySelector('[data-cnt="'+t[0]+'"]');
    if(c) c.textContent=on+" / "+items.length;
  });
}
function openSheet(){
  sheetChanged=false; buildSheet(); sheet.hidden=false; document.body.classList.add("noscroll");
  el("sheetClose").focus();
}
function closeSheet(){
  if(sheet.hidden) return;
  sheet.hidden=true; document.body.classList.remove("noscroll");
  if(sheetChanged){syncButtons(); applyRegionDim(); startRegion()}
  focusInput();
}
el("settingsBtn").addEventListener("click",function(e){e.stopPropagation();openSheet()});
el("sheetClose").addEventListener("click",closeSheet);
sheet.addEventListener("click",function(e){if(e.target===sheet) closeSheet()});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!sheet.hidden){e.preventDefault();closeSheet()}});
function setItems(topic,fn){
  itemsOf(topic).forEach(function(c){ if(fn(c)) OFF.delete(idOf(c)); else OFF.add(idOf(c)); });
  save("off",JSON.stringify(Array.from(OFF))); sheetChanged=true;
  sheetBody.querySelectorAll('[data-topic-sec="'+topic+'"] [data-id]').forEach(function(cb){cb.checked=!OFF.has(cb.dataset.id)});
  refreshCounts();
}
sheetBody.addEventListener("change",function(e){
  var t=e.target;
  if(t.dataset.id){
    if(t.checked) OFF.delete(t.dataset.id); else OFF.add(t.dataset.id);
    save("off",JSON.stringify(Array.from(OFF))); sheetChanged=true; refreshCounts();
  }
});
sheetBody.addEventListener("click",function(e){
  var b=e.target.closest("button"); if(!b) return;
  if(b.dataset.all) setItems(b.dataset.all,function(){return true});
  else if(b.dataset.none) setItems(b.dataset.none,function(){return false});
  else if(b.dataset.only){
    var set=new Set(D.regions[b.dataset.only]);
    setItems("countries",function(c){return set.has(c.i)});
  }else if(b.dataset.set){
    S[b.dataset.set]=b.dataset.val; save(b.dataset.set,b.dataset.val); sheetChanged=true;
    b.parentNode.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))});
  }else if(b.id==="resetAll"){
    if(window.confirm("Reset all settings, selections and best times?")){
      try{Object.keys(localStorage).filter(function(k){return k.indexOf("tm-")===0}).forEach(function(k){localStorage.removeItem(k)})}catch(err){}
      location.reload();
    }
  }
});
sheetBody.addEventListener("input",function(e){
  if(e.target.id!=="itemSearch") return;
  var q=fold(e.target.value).trim();
  sheetBody.querySelectorAll(".it").forEach(function(l){l.hidden=!!q&&l.dataset.n.indexOf(q)<0});
  if(q) sheetBody.querySelectorAll("details.sec").forEach(function(d){d.open=!!d.querySelector(".it:not([hidden])")});
});

/* manual zoom and pan: mouse wheel, drag, pinch, and the + / - / reset buttons.
   The next question puts the camera back on its own. */
(function(){
  var pts={}, last=null;
  function toView(clientX,clientY){
    var m=svg.getScreenCTM(); if(!m) return {x:W/2,y:H/2};
    var p=svg.createSVGPoint(); p.x=clientX; p.y=clientY; p=p.matrixTransform(m.inverse());
    return {x:p.x,y:p.y};
  }
  var kbWas=false;   /* was the typing field focused (phone keyboard open) when the touch began? */
  function manual(){ manualCam=true; if(camRaf){cancelAnimationFrame(camRaf);camRaf=0} }
  function keepKeyboard(){ if(kbWas) inp.focus({preventScroll:true}) }
  function zoomAt(f,vx,vy){
    manual();
    var a=camS, kMin=viewScale()*.85, k=Math.max(kMin,Math.min(40,a.k*f));
    var lx=a.cx+(vx-W/2)/a.k, ly=a.cy+(vy-H/2)/a.k;          /* map point under the cursor stays put */
    setCam(k,Math.max(0,Math.min(W,lx-(vx-W/2)/k)),Math.max(0,Math.min(H,ly-(vy-H/2)/k)));
  }
  function panBy(dvx,dvy){
    manual(); var a=camS;
    setCam(a.k,Math.max(0,Math.min(W,a.cx-dvx/a.k)),Math.max(0,Math.min(H,a.cy-dvy/a.k)));
  }
  svg.addEventListener("wheel",function(e){
    e.preventDefault(); var v=toView(e.clientX,e.clientY);
    zoomAt(Math.exp(-e.deltaY*(e.deltaMode===1?.05:.0015)),v.x,v.y);
  },{passive:false});
  svg.addEventListener("pointerdown",function(e){
    if(!Object.keys(pts).length) kbWas=document.activeElement===inp;
    e.preventDefault();                                     /* do not steal focus from the typing field */
    try{svg.setPointerCapture(e.pointerId)}catch(err){}
    pts[e.pointerId]={x:e.clientX,y:e.clientY}; last=null; svg.classList.add("grab");
  });
  svg.addEventListener("pointermove",function(e){
    if(!pts[e.pointerId]) return;
    var ids=Object.keys(pts), prev=pts[e.pointerId];
    if(ids.length===1){
      var a=toView(prev.x,prev.y), b=toView(e.clientX,e.clientY); panBy(b.x-a.x,b.y-a.y);
    }else if(ids.length===2){
      var o=pts[ids[0]===String(e.pointerId)?ids[1]:ids[0]];
      var d0=Math.hypot(prev.x-o.x,prev.y-o.y), d1=Math.hypot(e.clientX-o.x,e.clientY-o.y);
      var mid=toView((e.clientX+o.x)/2,(e.clientY+o.y)/2), mp=toView((prev.x+o.x)/2,(prev.y+o.y)/2);
      if(d0>0&&d1>0) zoomAt(d1/d0,mid.x,mid.y);
      panBy(mid.x-mp.x,mid.y-mp.y);
    }
    pts[e.pointerId]={x:e.clientX,y:e.clientY};
  });
  function up(e){delete pts[e.pointerId]; if(!Object.keys(pts).length){svg.classList.remove("grab"); keepKeyboard()}}
  svg.addEventListener("pointerup",up); svg.addEventListener("pointercancel",up);
  svg.addEventListener("mousedown",function(e){e.preventDefault()});
  document.querySelector(".mapctl").addEventListener("mousedown",function(e){kbWas=document.activeElement===inp;e.preventDefault()});
  svg.addEventListener("dblclick",function(e){var v=toView(e.clientX,e.clientY);zoomAt(2,v.x,v.y)});
  el("zin").addEventListener("click",function(e){e.stopPropagation();zoomAt(1.5,W/2,H/2);keepKeyboard()});
  el("zout").addEventListener("click",function(e){e.stopPropagation();zoomAt(1/1.5,W/2,H/2);keepKeyboard()});
  el("zreset").addEventListener("click",function(e){e.stopPropagation();zoomTo(cur?cur.c:null);focusInput()});
})();

/* phone rotated / window resized: frame the current question again */
var resizeT=0, lastW=window.innerWidth;
window.addEventListener("resize",function(){
  /* The phone keyboard opening or closing only changes the HEIGHT: ignore that, so a hand-set
     zoom is not thrown away. Only a real width change (rotation, window resize) re-frames. */
  if(Math.abs(window.innerWidth-lastW)<2) return;
  lastW=window.innerWidth;
  clearTimeout(resizeT);
  resizeT=setTimeout(function(){ var sp=S.speed; S.speed="instant"; zoomTo(cur?cur.c:null); S.speed=sp },200);
});

/* themes */
var THEMES=[
["dark","dark","#2e3238","#272b30","#e6b43c","#686c73","#d5d3c8","#cf4d5d"],
["light","light","#eceef1","#e0e3e8","#9a6b00","#80858e","#2a2e35","#c23b4a"],
["midnight","midnight","#0b1020","#121a33","#5eead4","#4a5580","#cfd8ff","#ff6b81"],
["frost","frost","#2e3440","#3b4252","#88c0d0","#616e88","#d8dee9","#bf616a"],
["violet","violet","#282a36","#21222c","#bd93f9","#6272a4","#f8f8f2","#ff5555"],
["forest","forest","#1e2a22","#17211b","#9ccc65","#5d7a66","#dfe8dc","#e57373"],
["sunset","sunset","#2b1d2a","#231622","#ff9e64","#7a5c78","#f3e3ea","#f7768e"],
["ocean","ocean","#e8f1f5","#d6e4ec","#0b7285","#7b97a6","#17323f","#c0392b"],
["paper","paper","#efefef","#e2e2e2","#d6336c","#9a9a9a","#333333","#b02a37"],
["catppuccin","catppuccin","#1e1e2e","#181825","#cba6f7","#6c7086","#cdd6f4","#f38ba8"],
["latte","catppuccin latte","#eff1f5","#e6e9ef","#8839ef","#8c8fa1","#4c4f69","#d20f39"],
["mono","mono","#000000","#111111","#ffffff","#777777","#dddddd","#ff4d4d"]
];
var LIGHT={light:1,ocean:1,paper:1,latte:1};
var TVARS=["bg","panel","main","sub","text","err"];
var themesEl=el("themes"), themeBtn=el("theme"), theme=load("theme","auto",["auto"].concat(THEMES.map(function(t){return t[0]})));
var th='<button type="button" data-theme="auto" aria-pressed="false">auto (system)</button>';
THEMES.forEach(function(t){
  th+='<button type="button" data-theme="'+t[0]+'" aria-pressed="false" style="background:'+t[2]+';color:'+t[6]+'">'+t[1]+
     '<i><b style="background:'+t[4]+'"></b><b style="background:'+t[5]+'"></b><b style="background:'+t[7]+'"></b></i></button>';
});
themesEl.innerHTML=th;
function applyTheme(id){
  var root=document.documentElement, t=THEMES.filter(function(x){return x[0]===id})[0];
  TVARS.forEach(function(v){root.style.removeProperty("--"+v)});
  root.style.removeProperty("color-scheme");
  if(!t){id="auto"; root.removeAttribute("data-theme")}
  else{
    TVARS.forEach(function(v,i){root.style.setProperty("--"+v,t[i+2])});
    root.style.setProperty("color-scheme",LIGHT[id]?"light":"dark");
    root.setAttribute("data-theme",id);
  }
  theme=id; save("theme",id);
  themesEl.querySelectorAll("button").forEach(function(b){b.setAttribute("aria-pressed",String(b.dataset.theme===id))});
}
function toggleThemes(open){themesEl.hidden=!open; themeBtn.setAttribute("aria-expanded",String(open))}
themeBtn.addEventListener("click",function(e){e.stopPropagation();toggleThemes(themesEl.hidden)});
themesEl.addEventListener("click",function(e){
  var b=e.target.closest("[data-theme]"); if(b) applyTheme(b.dataset.theme);
});
document.addEventListener("click",function(e){
  if(!themesEl.hidden&&!e.target.closest("header")) toggleThemes(false);
});
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"&&!themesEl.hidden){toggleThemes(false);focusInput()}
});
applyTheme(theme);

var aboutEl=el("about"), aboutBtn=el("aboutBtn");
aboutBtn.addEventListener("click",function(e){
  e.stopPropagation(); aboutEl.hidden=!aboutEl.hidden;
  aboutBtn.setAttribute("aria-expanded",String(!aboutEl.hidden));
  if(!aboutEl.hidden) aboutEl.scrollIntoView({block:"start"});
});
if(CONTACT){var a=el("contact"); a.textContent=CONTACT; a.href="mailto:"+CONTACT; el("contactLine").hidden=false}

syncButtons(); applyRegionDim(); startRegion();
typing.classList.toggle("blurred",document.activeElement!==inp);
})();
