/* ==================== 问道之旅 · 特效模块（独立可复用） ====================
   window.WDFx —— 任务完成 / 获得经验 / 升级 / 粒子 / 闪光
   纯 DOM+CSS 实现（零依赖、免 canvas 性能开销），宿主需提供 document/body。
   设计约定：角色立绘素材（assets/player、assets/npc）由外部设计提供，
   本模块特效不依赖素材，后续可按 ROLE-DESIGN-HANDOFF.md 扩展帧动画。
   ========================================================================= */
(function(){
"use strict";
function layer(){
  let el=document.getElementById("fxlayer");
  if(!el){ el=document.createElement("div"); el.id="fxlayer"; document.body.appendChild(el); }
  return el;
}
function rnd(a,b){ return a+Math.random()*(b-a); }

const WDFx={

  /* 飘字：text=内容 cls=ok|cy|gold(默认金) x,y=视口坐标%（默认居中偏上） */
  float(text,cls,x,y){
    const l=layer(), s=document.createElement("span");
    s.className="fxf "+(cls||"");
    s.textContent=text;
    s.style.left=(x==null?50:x)+"%";
    s.style.top=(y==null?38:y)+"%";
    l.appendChild(s);
    setTimeout(()=>{ try{ s.remove(); }catch(e){} },1500);
    return s;
  },

  /* 粒子喷发：colors=色数组 n=数量（默认18，屏幕中心向外） */
  burst(colors,n){
    const l=layer(); n=n||18;
    for(let i=0;i<n;i++){
      const p=document.createElement("span");
      p.className="fxp";
      const ang=rnd(0,Math.PI*2), dist=rnd(90,240);
      p.style.setProperty("--dx",Math.cos(ang)*dist+"px");
      p.style.setProperty("--dy",(Math.sin(ang)*dist-60)+"px"); // 整体偏上抛物
      p.style.left=(50+rnd(-3,3))+"%";
      p.style.top=(44+rnd(-3,3))+"%";
      p.style.background=colors[i%colors.length];
      const sz=rnd(5,10);
      p.style.width=sz+"px"; p.style.height=sz+"px";
      l.appendChild(p);
    }
    setTimeout(()=>{ l.querySelectorAll(".fxp").forEach(x=>{ try{x.remove();}catch(e){} }); },1200);
  },

  /* 全屏轻闪（金/品红/青） */
  flash(color){
    const l=layer(), f=document.createElement("div");
    f.className="fxflash";
    if(color) f.style.background="radial-gradient(circle,"+color+",transparent 70%)";
    l.appendChild(f);
    setTimeout(()=>{ try{ f.remove(); }catch(e){} },1000);
  },

  /* 境界突破（升级）：闪光 + 金粒子 + 居中大字 */
  levelUp(lv,titleText){
    this.flash("rgba(255,210,63,.25)");
    this.burst(["#ffd23f","#ff5fa8","#3df0ff","#7fff7f"],26);
    const l=layer(), d=document.createElement("div");
    d.className="fxlv";
    d.innerHTML=`<div class="l1">境界突破</div><div class="l2">Lv.${lv} · ${String(titleText||"").replace(/[<>]/g,"")}</div>`;
    l.appendChild(d);
    setTimeout(()=>{ try{ d.remove(); }catch(e){} },2400);
  },

  /* 任务交付：完成印章 + 修行/铜钱飘字 + 金粒子 */
  questDone(xp,coin){
    const l=layer(), s=document.createElement("div");
    s.className="fxseal";
    s.textContent="交 付";
    l.appendChild(s);
    setTimeout(()=>{ try{ s.remove(); }catch(e){} },1700);
    this.burst(["#ffd23f","#7fff7f"],14);
    this.float("+"+(xp||0)+" 修行","gold",50,30);
    this.float("+"+(coin||0)+" 铜钱","cy",56,42);
  },

  /* 铜钱变动（集市买入为负数） */
  coinGain(n){
    if(!n) return;
    this.float((n>0?"+":"")+n+" 铜钱",n>0?"gold":"",50,34);
  }
};

window.WDFx=WDFx;
})();
