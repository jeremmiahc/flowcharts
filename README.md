
# EdgeFlow Command Center Finished v12

Finished polished version based on the approved mockup.

Key behavior:
- No dashboard data loads unless Supabase and Free Flow are connected.
- Frontend only calls `/api/freeflow` for Free Flow data.
- FreeFlow key stays server-side in `api/freeflow.js` using `process.env.FREEFLOW_API_KEY`.
- QQQ Free Flow gamma data converts into estimated NQ zones using:
  `NQ Level = QQQ Level × (Current NQ Spot ÷ QQQ Spot)`
- Manual NQ spot input recalculates zones instantly.
- Gamma map uses real Free Flow GEX rows.
- Auto-refresh is every 5 minutes.
- Snapshots save every 5 minutes with localStorage + Supabase fallback.
- Trade log includes selectable order-flow tags and mistake tags.
- Trade grade updates from tags, screenshots, exit type, and R multiple.
- Dedicated ATAS and Bookmap screenshot sections.
- Winning-trade popup triggers on saved positive trades.
- Stats, Today, History, Log, Gamma, and Settings are polished.

Required Vercel environment variables:
```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
FREEFLOW_API_KEY
```

Push:
```bash
cd ~/Downloads/edgeflow-command-center-finished-v12
git init
git add .
git commit -m "Finish polished EdgeFlow command center"
git branch -M main
git remote add origin https://github.com/jeremmiahc/edgeflow-command-center.git
git push -u origin main --force
```


v13 changes:
- NQ spot is fetched automatically server-side from Yahoo NQ=F when available.
- Manual NQ spot is now optional override, not required.
- Today tab is expanded with mission board, session coach, checklist, risk used, daily lock.
- Stats tab is expanded with expectancy, profit factor, payoff ratio, exit-type breakdown, setup breakdown, time-window breakdown.
- Settings tab is refined with connection center, setup status, required env vars, rules, session settings, gamma defaults.


v14 changes:
- Removed large visible conversion formula panel; replaced with compact source strip.
- Removed estimation wording from UI; uses NQ zones language.
- Expiration selector now displays 0DTE/1DTE/etc instead of raw dates.
- Gamma map now aggregates strike rows into visible NQ buckets so bars display clearly.
- Added Total DEX, Call OI Wall, Put OI Wall, and Rows Loaded cards on Gamma.


v15 changes:
- Fixed Gamma map bars not showing by using gamma*OI fallback when GEX is tiny/missing.
- Added minimum visual bar width so valid exposure does not disappear.
- Improved GEX axis formatting and chart height.


v16 changes:
- Settings cleaned: removed 3 keys card, 2 tables card, winning popup card, risk-controls block, and time-window block.
- Cutoff default set to 9:00.
- Added selectable settings for popup, confetti, sound, fade in/out.
- Added winning-trade audio upload and sound test.
- Winning trade sound plays full file and fades in/out if enabled.
- History/Stats language clarified: only trades saved in Supabase are displayed/calculated.


v17 changes:
- Fixed History/Stats showing $0 by normalizing common Supabase column names.
- Trade loader now accepts pnl, profit_loss, net_pnl, points_finished, pointsFinished, points, pts, result_points, contracts/qty/size, rr/r_multiple.
- Row display now shows 'R unavailable' instead of fake 0.00R if risk/result data is missing.
- Added warning that existing Supabase rows need pnl or points_finished to calculate real totals.

v18 changes:
- Log Trade session window is automatically determined from entry time.
- Removed manual session-window selection from logging workflow.
- Gamma map now guarantees visible bars by falling back to wall-zone pressure when strike-level GEX is missing.
- Gamma map hover identifies whether bars came from API strike rows or wall-zone fallback.


v19 changes:
- Replaced the Gamma map with a true 2D SVG chart.
- Removed Plotly/3D dependency entirely.
- Bars, wall zones, NQ spot, and labels all share the same 2D x/y scale.
