
function asNumber(v){if(v==null||v==="")return null;if(typeof v==="number")return Number.isFinite(v)?v:null;if(typeof v==="string"){const n=Number(v.replace(/[$,+]/g,""));return Number.isFinite(n)?n:null}if(typeof v==="object")return asNumber(v.level??v.strike??v.value??v.price);return null}
function dte(exp){const e=new Date(`${exp}T00:00:00Z`);if(Number.isNaN(e.getTime()))return null;const now=new Date();const s=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));return Math.max(0,Math.round((e-s)/86400000))}
function first(d,ks){for(const k of ks){if(d?.[k]!=null&&d?.[k]!=="")return d[k]}return null}
function wall(v){const q=asNumber(v);if(q==null)return null;const exposure=typeof v==="object"?asNumber(v.exposure??v.gex??v.value):null;return {qqqLevel:q,rawStrike:q,exposure}}
function strikes(snap){const rows=Array.isArray(snap)?snap:Array.isArray(snap?.contracts)?snap.contracts:Array.isArray(snap?.data)?snap.data:[];const m=new Map();for(const r of rows){const q=asNumber(r.strike??r.qqqLevel??r.level);if(q==null)continue;const g=asNumber(r.gex??r.gamma_exposure??0)??0;const gamma=asNumber(r.gamma)??0;const oi=asNumber(r.oi)??0;const dex=asNumber(r.dex)??0;const vex=asNumber(r.vex)??0;const vanna=asNumber(r.vanna)??0;const charm=asNumber(r.charm)??0;const x=m.get(q)||{qqqLevel:q,rawStrike:q,gex:0,gamma:0,oi:0,dex:0,vex:0,vanna:0,charm:0};x.gex+=g;x.gamma+=gamma;x.oi+=oi;x.dex+=dex;x.vex+=vex;x.vanna+=vanna;x.charm+=charm;m.set(q,x)}return Array.from(m.values()).sort((a,b)=>a.qqqLevel-b.qqqLevel).map(r=>({...r,type:r.gex>=0?"positive":"negative"}))}
async function ff(path,key){const res=await fetch(`https://www.free-flow.site/public${path}`,{headers:{"X-API-Key":key}});const txt=await res.text();let j;try{j=JSON.parse(txt)}catch{j={raw:txt}}if(!res.ok){const e=new Error("Free Flow request failed");e.status=res.status;throw e}return j}
async function getNqQuote(){
 try{
  const res=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/NQ=F?interval=1m&range=1d",{headers:{"User-Agent":"Mozilla/5.0"}});
  const j=await res.json();
  const result=j?.chart?.result?.[0];
  const meta=result?.meta||{};
  const price=asNumber(meta.regularMarketPrice??meta.previousClose);
  if(price)return {price,source:"Yahoo NQ=F",timestamp:new Date().toISOString()};
 }catch(e){console.error("NQ quote fetch failed",{message:e.message})}
 return {price:null,source:"Unavailable",timestamp:new Date().toISOString()};
}
export default async function handler(req,res){
 const key=process.env.FREEFLOW_API_KEY;
 if(!key)return res.status(500).json({ok:false,message:"Free Flow API data unavailable. Check API key, endpoint, or symbol mapping."});
 try{
  const expsRaw=await ff("/expirations?symbol=QQQ",key);
  const expirations=Array.isArray(expsRaw?.expirations)?expsRaw.expirations:Array.isArray(expsRaw)?expsRaw:[];
  const expiration=req.query.exp||expirations[0];
  if(!expiration)return res.status(502).json({ok:false,message:"Free Flow API data unavailable. Check API key, endpoint, or symbol mapping."});
  const [wallsRaw,snapRaw,nqQuote]=await Promise.all([ff(`/walls?symbol=QQQ&exp=${expiration}`,key),ff(`/snapshot?symbol=QQQ&exp=${expiration}`,key),getNqQuote()]);
  const walls=wallsRaw?.data||wallsRaw||{}; const snap=snapRaw?.data||snapRaw||{};
  const qqqSpot=asNumber(first(snap,["spot","price","underlying_price"]));
  const totalGex=asNumber(first(snap,["total_gex","totalGex"]))??asNumber(first(walls,["total_gex","totalGex"]));
  const totalDex=asNumber(first(snap,["total_dex","totalDex"]))??asNumber(first(walls,["total_dex","totalDex"]));
  const netGex=asNumber(first(walls,["net_gex","netGex"]))??totalGex;
  return res.json({ok:true,symbol:"QQQ",targetSymbol:"NQ",expiration,dte:dte(expiration),qqqSpot,nqSpot:nqQuote.price,nqSpotSource:nqQuote.source,nqSpotUpdated:nqQuote.timestamp,
   callWall:wall(first(walls,["call_wall","callWall"])),
   putWall:wall(first(walls,["put_wall","putWall"])),
   gammaFlip:wall(first(walls,["gamma_flip","gammaFlip","zero_gamma","flip"])),
   callOiWall:wall(first(walls,["call_oi_wall","callOiWall"])),
   putOiWall:wall(first(walls,["put_oi_wall","putOiWall"])),
   netGex,totalGex,totalDex,strikes:strikes(snap),expirations,lastUpdated:new Date().toISOString()});
 }catch(e){console.error("FreeFlow server error",{status:e.status,message:e.message});return res.status(e.status||500).json({ok:false,message:"Free Flow API data unavailable. Check API key, endpoint, or symbol mapping."})}
}
