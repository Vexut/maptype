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
var ring=document.createElementNS(NS,"circle"); cam.appendChild(ring);

function load(k,def,ok){try{var v=localStorage.getItem("tm-"+k);return ok.indexOf(v)>=0?v:def}catch(e){return def}}
function save(k,v){try{localStorage.setItem("tm-"+k,v)}catch(e){}}
var S={
  mode:load("mode","copy",["copy","hint","recall"]),
  region:load("region","world",Object.keys(D.regions)),
  ask:load("ask","country",["country","capital","both"]),
  lang:load("lang","en",["en","fi","both"])
};

var queue=[], ptr=0, cur=null, buf="", reveal=false, finished=false;
var missed=new Set(), requeued=new Set(), good=0, total=0, t0=0;

function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function fold(s){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function key(s){return fold(s).replace(/[^a-z0-9]/g,"")}
function same(a,b){
  a=fold(a); b=fold(b);
  if(a===b) return true;
  if((a==="-"||a===" ")&&(b==="-"||b===" ")) return true;
  if((a==="'"||a==="\u2019")&&(b==="'"||b==="\u2019")) return true;
  return false;
}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t}return a}
function nameOf(c,l){return l==="fi"?c.fi:c.f}
function prep(t){
  var c=t.c;
  if(t.k==="n"){t.t=nameOf(c,t.l); t.al=t.l==="fi"?c.fa:c.a}
  else{t.t=t.l==="fi"?c.pf:c.p; t.al=c.pa}
}
function matches(){
  var k=key(buf); if(!k) return false;
  if(k===key(cur.t)) return true;
  return cur.al.some(function(x){return key(x)===k});
}

/* Camera: no zoom setting. How much of the surroundings is shown, and how slowly the
   camera travels, both depend on the country's size on the map. Small countries get a
   wide view with lots of neighbours and a slow, long flight so you see where they are;
   big countries get a tight view and a quick one. */
var camX=W/2, camY=H/2;
function zoomTo(c){
  if(!c){
    cam.style.transitionDuration="1s";
    cam.style.transform="translate(0px,0px) scale(1)";
    ring.classList.remove("show"); camX=W/2; camY=H/2; return;
  }
  var b=c.b, bw=Math.max(b[2]-b[0],1), bh=Math.max(b[3]-b[1],1);
  var size=Math.max(bw/W,bh/H);                              /* share of the map width/height */
  var t=Math.log(size/.005)/Math.log(.25/.005);              /* 0 = tiny ... 1 = huge */
  t=Math.max(0,Math.min(1,t));
  var f=.07+t*.63;                                           /* share of the view the country fills */
  var k=Math.min(W*f/bw,H*f/bh); k=Math.max(1.3,Math.min(14,k));
  var cx=(b[0]+b[2])/2, cy=(b[1]+b[3])/2;
  var dist=Math.min(1,Math.hypot((cx-camX)/W,(cy-camY)/H)*2);
  var dur=.8+(1-t)*1.2+dist*.8;                              /* seconds: 0.8 .. 2.8 */
  cam.style.transitionDuration=dur.toFixed(2)+"s";
  cam.style.transform="translate("+(W/2-cx*k)+"px,"+(H/2-cy*k)+"px) scale("+k+")";
  camX=cx; camY=cy;
  ring.setAttribute("cx",cx); ring.setAttribute("cy",cy); ring.setAttribute("r",(20/k).toFixed(2));
  ring.classList.toggle("show",bw*k<24&&bh*k<24);
}
function applyRegionDim(){
  var set=new Set(D.regions[S.region]);
  paths.forEach(function(p,i){p.classList.toggle("out",S.region!=="world"&&!set.has(i))});
}
function highlight(c){
  paths.forEach(function(p){p.classList.remove("on")});
  if(c){var p=paths[c.i]; p.classList.add("on"); cam.appendChild(p);}
  cam.appendChild(ring);
}

function captionFor(){
  var w=cur.k==="p"?"capital":"name";
  if(S.mode==="copy") return "type the "+w+" you see";
  if(S.mode==="hint") return "first letter given \u00b7 enter to give up";
  return "type the "+w+" from memory \u00b7 enter to give up";
}
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
    else if(S.mode==="hint"&&i===0){ch=t[0]}
    else continue;
    h+=cls?'<span class="'+cls+'">'+esc(ch)+'</span>':'<span>'+esc(ch)+'</span>';
  }
  lineEl.innerHTML=h;
  var bits=[];
  if(cur.k==="p") bits.push("capital of "+nameOf(cur.c,cur.l));
  if(S.lang==="both") bits.push(cur.l==="fi"?"suomeksi":"in english");
  var lab=bits.length?'<span class="of">'+esc(bits.join(" \u00b7 "))+'</span>':"";
  countEl.innerHTML=(Math.min(ptr+1,queue.length))+"/"+queue.length+lab;
  if(reveal){capEl.className="cap err";capEl.textContent="it\u2019s "+cur.t+" \u2013 type it to learn it"}
  else{capEl.className="cap";capEl.textContent=captionFor()}
  keysEl.hidden=(S.mode==="copy"||reveal);
}

function makeTasks(list){
  var out=[], langs=S.lang==="both"?["fi","en"]:[S.lang];
  function add(c,k){
    var seen={};
    langs.forEach(function(l){
      var t={c:c,k:k,l:l}; prep(t);
      var kk=key(t.t); if(seen[kk]) return; seen[kk]=1; out.push(t);
    });
  }
  shuffle(list.slice()).forEach(function(c){
    if(S.ask!=="capital") add(c,"n");
    if(S.ask!=="country") add(c,"p");
  });
  return out;
}
function next(){
  if(ptr>=queue.length){finish();return}
  cur=queue[ptr]; prep(cur); buf=""; inp.value=""; reveal=false;
  highlight(cur.c); zoomTo(cur.c); render();
}
function start(tasks){
  queue=tasks; ptr=0; missed=new Set(); requeued=new Set();
  good=0; total=0; t0=0; finished=false;
  resEl.hidden=true; typing.hidden=false;
  next(); focusInput();
}
function startRegion(){start(makeTasks(D.regions[S.region].map(function(i){return D.c[i]})))}
function success(){ptr++;next()}
function miss(){
  reveal=true; missed.add(cur);
  if(!requeued.has(cur)){requeued.add(cur);queue.push(cur)}
  buf=""; inp.value=""; render();
}
function fmt(ms){var s=Math.round(ms/1000),m=Math.floor(s/60);return m+":"+(s%60<10?"0":"")+(s%60)}
function finish(){
  finished=true; cur=null; highlight(null); zoomTo(null);
  var acc=total?Math.round(100*good/total):100;
  var time=t0?fmt(performance.now()-t0):"0:00";
  var list=Array.from(missed);
  var h='<div class="stats">'+
    '<div class="stat"><div class="l">accuracy</div><div class="val">'+acc+'%</div></div>'+
    '<div class="stat"><div class="l">answers</div><div class="val">'+(queue.length-requeued.size)+'</div></div>'+
    '<div class="stat"><div class="l">time</div><div class="val">'+time+'</div></div></div>';
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
    if(!t0) t0=performance.now();
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
    if(cur&&!reveal&&S.mode!=="copy") miss();
  }
});
document.addEventListener("keydown",function(e){
  if(document.activeElement!==inp&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(e.key==="Tab"){e.preventDefault();startRegion();return}
    if(e.key.length===1) inp.focus();
  }
});
function focusInput(){inp.focus({preventScroll:true})}
inp.addEventListener("focus",function(){typing.classList.remove("blurred")});
inp.addEventListener("blur",function(){typing.classList.add("blurred")});
typing.addEventListener("click",focusInput);
el("restart").addEventListener("click",function(e){e.stopPropagation();startRegion()});

function syncButtons(){
  document.querySelectorAll("[data-k]").forEach(function(b){
    b.setAttribute("aria-pressed",String(S[b.dataset.k]===b.dataset.v));
  });
}
el("opts").addEventListener("click",function(e){
  var b=e.target.closest("[data-k]"); if(!b) return;
  var k=b.dataset.k; S[k]=b.dataset.v; save(k,S[k]);
  syncButtons(); if(k==="region") applyRegionDim();
  startRegion();
});

/* themes */
var THEMES=[
["dark","dark","#323437","#2c2e31","#e2b714","#646669","#d1d0c5","#ca4754"],
["light","light","#eceef1","#e0e3e8","#9a6b00","#80858e","#2a2e35","#c23b4a"],
["midnight","midnight","#0b1020","#121a33","#5eead4","#4a5580","#cfd8ff","#ff6b81"],
["frost","frost","#2e3440","#3b4252","#88c0d0","#616e88","#d8dee9","#bf616a"],
["violet","violet","#282a36","#21222c","#bd93f9","#6272a4","#f8f8f2","#ff5555"],
["forest","forest","#1e2a22","#17211b","#9ccc65","#5d7a66","#dfe8dc","#e57373"],
["sunset","sunset","#2b1d2a","#231622","#ff9e64","#7a5c78","#f3e3ea","#f7768e"],
["ocean","ocean","#e8f1f5","#d6e4ec","#0b7285","#7b97a6","#17323f","#c0392b"],
["paper","paper","#efefef","#e2e2e2","#d6336c","#9a9a9a","#333333","#b02a37"],
["mono","mono","#000000","#111111","#ffffff","#777777","#dddddd","#ff4d4d"]
];
var LIGHT={light:1,ocean:1,paper:1};
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
