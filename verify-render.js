/* 轻量 DOM mock + 同作用域执行 index.html 渲染逻辑，捕获运行时错误 */
const fs = require('fs');

const els={};const selEls={};
function makeEl(tag){
  const el = {
    tagName:(tag||'div').toUpperCase(), children:[], style:{}, dataset:{},
    classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x));},remove(...c){c.forEach(x=>this._s.delete(x));},
      toggle(c,f){f?this._s.add(c):this._s.delete(c);},contains(c){return this._s.has(c);}},
    _html:'',_text:'',value:'',disabled:false,type:'',
    set innerHTML(v){this._html=v;},get innerHTML(){return this._html;},
    set textContent(v){this._text=v;},get textContent(){return this._text;},
    appendChild(c){this.children.push(c);return c;},remove(){},removeChild(){},focus(){},click(){},
    querySelector(){return makeEl();},querySelectorAll(){return [];},closest(){return null;},
    setSelectionRange(){},scrollIntoView(){},addEventListener(){},removeEventListener(){},
    getContext(){return{clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},closePath(){},createLinearGradient(){return{addColorStop(){}}},fillText(){},save(){},restore(){},translate(){},scale(){},setTransform(){}};},
    set onpointerdown(f){},get onpointerdown(){return null;},
    set onclick(f){},set oninput(f){},set onchange(f){},set onkeydown(f){},set onload(f){},set onerror(f){},set onended(f){},
    isConnected:true,
  };
  return el;
}
const store={};
global.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];},clear:()=>{for(const k in store)delete store[k];}};
global.document={body:makeEl('body'),createElement:t=>makeEl(t),getElementById:(id)=>els[id]||(els[id]=makeEl(id)),querySelector:(s)=>selEls[s]||(selEls[s]=makeEl(s)),querySelectorAll:()=>[],addEventListener(){}};
global.window=global;
global.navigator={mediaDevices:undefined};
global.isSecureContext=false;
global.fetch=()=>Promise.reject(new Error('no network'));
global.AbortController=class{constructor(){this.signal={};}abort(){}};
global.setTimeout=()=>0;global.clearTimeout=()=>{};
global.AudioContext=undefined;global.webkitAudioContext=undefined;
global.Blob=class{constructor(){}};
global.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};
global.FileReader=class{readAsText(){}};
global.confirm=()=>true;global.prompt=()=>null;global.alert=()=>{};


const dataSrc=fs.readFileSync(process.argv[2],'utf8');
const html=fs.readFileSync(process.argv[3],'utf8');
const js=html.match(/<script>\n([\s\S]*?)<\/script>/)[1];

const driver = `
st=defState();
st._libQ='关于推动在线旅游市场';
renderLib();
const h=selEls['#stream']?selEls['#stream'].innerHTML:'';
console.log('stream len:',h.length);
console.log('含新文本:', h.includes('关于推动在线旅游市场高质量发展的意见'));
console.log('含旧碎片:', h.includes('①文旅市场发'));
st=defState(); st._libQ='南宋朱熹编定'; renderLib();
console.log('四书新句:', selEls['#stream'].innerHTML.includes('南宋朱熹编定'));
st=defState(); st._libQ='那达慕大会是蒙古族'; renderLib();
console.log('节日新句:', selEls['#stream'].innerHTML.includes('那达慕大会是蒙古族的传统盛会'));
st=defState(); st._libQ='1928 年正式作为公园'; renderLib();
console.log('颐和园沿革:', selEls['#stream'].innerHTML.includes('1928 年正式作为公园'));
st=defState(); renderBoard();
let b=JSON.stringify(D.lectures)+JSON.stringify(D.quests);
console.log('任务层(书页+goals)含扶贫句:', b.includes('历史性地解决了绝对贫困问题'));
console.log('任务层含旧碎片:', b.includes('经济总量稳居世界第二；制造业规模世界第一；'));
console.log('VERDICT:', (selEls['#stream']?selEls['#stream'].innerHTML:'').includes('①文旅市场发')?'FAIL':'ALL PASS');
`;

eval(dataSrc + "\n" + js + "\n" + driver);
