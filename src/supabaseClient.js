
import { createClient } from "@supabase/supabase-js";
const url=import.meta.env.VITE_SUPABASE_URL;
const anon=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabaseReady=Boolean(url&&anon);
export const supabase=supabaseReady?createClient(url,anon):null;

export async function testSupabase(){
  if(!supabase)return{ok:false,message:"Missing Supabase environment variables."};
  try{
    const {error}=await supabase.from("trades").select("id").limit(1);
    if(error)return{ok:false,message:error.message};
    return{ok:true,message:"Supabase connected."};
  }catch(e){return{ok:false,message:e.message}}
}

function normalizeTrade(t){
  const num = v => {
    if(v==null || v==="") return null;
    if(typeof v==="number") return Number.isFinite(v) ? v : null;
    const n = Number(String(v).replace(/[$,+]/g,""));
    return Number.isFinite(n) ? n : null;
  };
  const pointsFinished =
    num(t.points_finished) ??
    num(t.pointsFinished) ??
    num(t.points) ??
    num(t.pts) ??
    num(t.result_points) ??
    num(t.resultPts) ??
    num(t.pnl_points) ??
    num(t.pnlPoints);

  const pointsRisked =
    num(t.points_risked) ??
    num(t.pointsRisked) ??
    num(t.risk_points) ??
    num(t.riskPts) ??
    num(t.stop_points) ??
    num(t.stopPts);

  const contracts = num(t.contracts) ?? num(t.size) ?? num(t.qty) ?? 1;
  const pnl =
    num(t.pnl) ??
    num(t.profit_loss) ??
    num(t.profitLoss) ??
    num(t.net_pnl) ??
    (pointsFinished != null ? pointsFinished * contracts * 20 : null);

  const rr =
    num(t.rr) ??
    num(t.r_multiple) ??
    num(t.rMultiple) ??
    (pointsFinished != null && pointsRisked ? pointsFinished / pointsRisked : null);

  const created =
    t.created_at ??
    t.createdAt ??
    t.date ??
    t.trade_date ??
    t.tradeDate ??
    new Date().toISOString();

  return {
    ...t,
    created_at: created,
    symbol: t.symbol ?? "NQ",
    direction: t.direction ?? t.side ?? t.long_short ?? "",
    entry_time: t.entry_time ?? t.entryTime ?? t.time ?? "",
    contracts,
    points_finished: pointsFinished,
    points_risked: pointsRisked,
    pnl,
    rr,
    orderflow_tags: t.orderflow_tags ?? t.orderflowTags ?? t.tags ?? [],
    mistake_tags: t.mistake_tags ?? t.mistakeTags ?? t.mistakes ?? []
  };
}

export async function loadTrades(){
  if(!supabase)return{ok:false,message:"Supabase is not configured.",data:[]};
  const {data,error}=await supabase.from("trades").select("*").order("created_at",{ascending:false}).limit(250);
  if(error)return{ok:false,message:error.message,data:[]};
  return{ok:true,data:(data||[]).map(normalizeTrade)};
}

export async function saveTrade(payload){
  if(!supabase)return{ok:false,message:"Supabase is not configured."};
  const {data,error}=await supabase.from("trades").insert([payload]).select().single();
  if(error)return{ok:false,message:error.message};
  return{ok:true,data};
}

export async function saveGammaSnapshot(payload){
  if(!supabase)return{ok:false,message:"Supabase is not configured."};
  const {data,error}=await supabase.from("gamma_snapshots").insert([payload]).select().single();
  if(error)return{ok:false,message:error.message};
  return{ok:true,data};
}
