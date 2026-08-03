import type { Challenge, ChallengeConfig, DayRow, ChallengeStats } from '@/lib/challenge';

// ─── Excel Export (CSV-based, opens in Excel) ────────────────────────────────
function csvEscape(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCSV(rows: (string | number)[][]): string {
  return rows.map(r => r.map(csvEscape).join(',')).join('\n');
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportExcel(challenge: Challenge) {
  const { config, days, stats } = challenge;

  // Sheet 1: Challenge Summary
  const summaryRows: (string | number)[][] = [
    ['Compounding Challenge Summary'],
    [],
    ['Challenge Name', config.name],
    ['Start Capital', config.startCapital],
    ['Target Capital', config.targetBalance],
    ['Challenge Days', config.challengeDays],
    ['Trading Sessions/Day', config.sessionsPerDay],
    ['Daily Growth %', stats.requiredDailyGrowthPct.toFixed(4)],
    ['Session Growth %', stats.requiredSessionGrowthPct.toFixed(4)],
    ['Total ROI %', stats.overallROI.toFixed(2)],
    ['Start Date', config.startDate],
    ['Estimated End Date', stats.estimatedFinishDate],
    ['Current Balance', stats.currentBalance.toFixed(2)],
    ['Remaining Profit', stats.remainingProfit.toFixed(2)],
    ['Challenge Progress %', stats.challengeProgressPct.toFixed(2)],
    ['Completed Days', stats.completedDays],
    ['Winning Days', stats.winningDays],
    ['Losing Days', stats.losingDays],
    ['Risk Per Trade %', config.riskPerTrade],
    ['Strategy', config.strategy],
    ['Auto Compounding', config.autoCompounding ? 'Yes' : 'No'],
  ];

  // Sheet 2: Daily Tracker
  const dailyHeader = ['Day', 'Date', 'Start Balance', 'Daily Target', 'Target End Balance', 'Actual End Balance', 'Difference', 'Progress %', 'Status'];
  const dailyRows: (string | number)[][] = [dailyHeader];
  for (const d of days) {
    dailyRows.push([
      d.day, d.date,
      d.startBalance.toFixed(2),
      d.dailyTargetProfit.toFixed(2),
      d.targetEndBalance.toFixed(2),
      d.actualEndBalance.toFixed(2),
      d.difference.toFixed(2),
      d.progressPct.toFixed(2),
      d.status,
    ]);
  }

  // Sheet 3: Session Tracker
  const sessionHeader = ['Day', 'Date', 'Session', 'Start Balance', 'Session Target', 'Actual Profit', 'Actual Balance', 'Trades', 'Wins', 'Losses', 'Win Rate %', 'Status'];
  const sessionRows: (string | number)[][] = [sessionHeader];
  for (const d of days) {
    for (const s of d.sessions) {
      sessionRows.push([
        d.day, d.date, s.session,
        s.startBalance.toFixed(2),
        s.sessionTarget.toFixed(2),
        s.actualProfit.toFixed(2),
        s.actualBalance.toFixed(2),
        s.trades, s.wins, s.losses,
        s.winRate.toFixed(1),
        s.status,
      ]);
    }
  }

  // Sheet 4: Statistics
  const statsRows: (string | number)[][] = [
    ['Challenge Statistics'],
    [],
    ['Highest Balance', stats.highestBalance.toFixed(2)],
    ['Lowest Balance', stats.lowestBalance.toFixed(2)],
    ['Total Profit', stats.totalProfit.toFixed(2)],
    ['ROI %', stats.overallROI.toFixed(2)],
    ['Average Daily Profit', stats.avgDailyProfit.toFixed(2)],
    ['Average Session Profit', stats.avgProfitPerSession.toFixed(2)],
    ['Best Day Profit', stats.bestDay.toFixed(2)],
    ['Worst Day Profit', stats.worstDay.toFixed(2)],
    ['Completed %', stats.completionPct.toFixed(2)],
    ['Remaining %', (100 - stats.completionPct).toFixed(2)],
    ['Winning Days', stats.winningDays],
    ['Losing Days', stats.losingDays],
  ];

  // Combine all sheets into a single CSV with sheet separators
  const csv = [
    '=== Challenge Summary ===',
    ...summaryRows.map(r => r.map(csvEscape).join(',')),
    '',
    '=== Daily Tracker ===',
    ...dailyRows.map(r => r.map(csvEscape).join(',')),
    '',
    '=== Session Tracker ===',
    ...sessionRows.map(r => r.map(csvEscape).join(',')),
    '',
    '=== Statistics ===',
    ...statsRows.map(r => r.map(csvEscape).join(',')),
  ].join('\n');

  const filename = `${config.name.replace(/\s+/g, '_')}_challenge.csv`;
  downloadFile(csv, filename, 'text/csv;charset=utf-8;');
}

// ─── PDF / Print Export ───────────────────────────────────────────────────────
export function exportPDF(challenge: Challenge) {
  const { config, days, stats } = challenge;
  const win = window.open('', '_blank');
  if (!win) return;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${config.name} - Challenge Report</title>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; padding: 40px; color: #1a2a4a; }
    h1 { color: #3b7ef8; border-bottom: 2px solid #3b7ef8; padding-bottom: 10px; }
    h2 { color: #1a5fdb; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 12px; }
    th { background: #3b7ef8; color: white; padding: 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #e0e7ff; }
    tr:nth-child(even) { background: #f8faff; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
    .stat-card { border: 1px solid #e0e7ff; border-radius: 12px; padding: 15px; text-align: center; }
    .stat-label { font-size: 11px; color: #7a8aaa; text-transform: uppercase; }
    .stat-value { font-size: 20px; font-weight: 700; color: #1a2a4a; }
    .green { color: #22c55e; } .red { color: #ef4444; } .yellow { color: #f59e0b; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>${config.name}</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div class="stat-grid">
    <div class="stat-card"><div class="stat-label">Start Capital</div><div class="stat-value">${config.currency} ${config.startCapital.toFixed(2)}</div></div>
    <div class="stat-card"><div class="stat-label">Target Balance</div><div class="stat-value">${config.currency} ${config.targetBalance.toFixed(2)}</div></div>
    <div class="stat-card"><div class="stat-label">Current Balance</div><div class="stat-value">${config.currency} ${stats.currentBalance.toFixed(2)}</div></div>
    <div class="stat-card"><div class="stat-label">Progress</div><div class="stat-value">${stats.challengeProgressPct.toFixed(1)}%</div></div>
    <div class="stat-card"><div class="stat-label">Total ROI</div><div="stat-value">${stats.overallROI.toFixed(2)}%</div></div>
    <div class="stat-card"><div class="stat-label">Daily Target</div><div class="stat-value">${config.currency} ${stats.dailyTarget.toFixed(2)}</div></div>
    <div class="stat-card"><div class="stat-label">Session Target</div><div class="stat-value">${config.currency} ${stats.sessionTarget.toFixed(2)}</div></div>
    <div class="stat-card"><div class="stat-label">Remaining Days</div><div class="stat-value">${stats.remainingDays}</div></div>
  </div>

  <h2>Daily Tracker</h2>
  <table>
    <tr><th>Day</th><th>Date</th><th>Start Balance</th><th>Daily Target</th><th>Target End</th><th>Actual End</th><th>Diff</th><th>Progress</th><th>Status</th></tr>
    ${days.map(d => `<tr>
      <td>${d.day}</td><td>${d.date}</td>
      <td>${d.startBalance.toFixed(2)}</td><td>${d.dailyTargetProfit.toFixed(2)}</td>
      <td>${d.targetEndBalance.toFixed(2)}</td><td>${d.actualEndBalance.toFixed(2)}</td>
      <td class="${d.difference >= 0 ? 'green' : 'red'}">${d.difference >= 0 ? '+' : ''}${d.difference.toFixed(2)}</td>
      <td>${d.progressPct.toFixed(1)}%</td>
      <td class="${d.status === 'achieved' ? 'green' : d.status === 'partial' ? 'yellow' : d.status === 'missed' ? 'red' : ''}">${d.status}</td>
    </tr>`).join('')}
  </table>

  <h2>Statistics</h2>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Highest Balance</td><td>${config.currency} ${stats.highestBalance.toFixed(2)}</td></tr>
    <tr><td>Lowest Balance</td><td>${config.currency} ${stats.lowestBalance.toFixed(2)}</td></tr>
    <tr><td>Total Profit</td><td class="green">${config.currency} ${stats.totalProfit.toFixed(2)}</td></tr>
    <tr><td>ROI</td><td>${stats.overallROI.toFixed(2)}%</td></tr>
    <tr><td>Average Daily Profit</td><td>${config.currency} ${stats.avgDailyProfit.toFixed(2)}</td></tr>
    <tr><td>Best Day</td><td class="green">${config.currency} ${stats.bestDay.toFixed(2)}</td></tr>
    <tr><td>Worst Day</td><td class="red">${config.currency} ${stats.worstDay.toFixed(2)}</td></tr>
    <tr><td>Winning Days</td><td>${stats.winningDays}</td></tr>
    <tr><td>Losing Days</td><td>${stats.losingDays}</td></tr>
    <tr><td>Completion</td><td>${stats.completionPct.toFixed(1)}%</td></tr>
  </table>

  <script>setTimeout(() => window.print(), 500);</script>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}

export function printChallenge(challenge: Challenge) {
  exportPDF(challenge);
}
