/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const next = argv[i + 1];
    args[token.slice(2)] = next && !next.startsWith('--') ? next : true;
  }
  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listReportFiles(dirPath) {
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(dirPath, name));
}

function average(values) {
  const items = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (items.length === 0) return null;
  return items.reduce((sum, value) => sum + value, 0) / items.length;
}

function buildSummary(filePath, payload) {
  const report = Array.isArray(payload?.report) ? payload.report : [];
  if (report.length === 0) return null;

  const passCount = report.filter((item) => item?.status === 'PASS').length;
  const avgLatency = average(report.map((item) => item?.latencyMs));
  const avgConfidence = average(report.map((item) => item?.output?.confidence));
  const avgSelectors = average(report.map((item) => Array.isArray(item?.output?.candidateSelectors) ? item.output.candidateSelectors.length : 0));
  const avgActions = average(report.map((item) => Array.isArray(item?.output?.recommendedActions) ? item.output.recommendedActions.length : 0));

  return {
    file: path.basename(filePath),
    model: String(payload?.model || report[0]?.model || 'unknown'),
    endpoint: String(payload?.endpoint || ''),
    scenarios: report.length,
    passCount,
    failCount: report.length - passCount,
    passRate: passCount / report.length,
    avgLatencyMs: avgLatency,
    avgConfidence,
    avgSelectors,
    avgActions
  };
}

function compareSummaries(left, right) {
  if (right.passRate !== left.passRate) return right.passRate - left.passRate;
  if ((left.avgLatencyMs ?? Number.POSITIVE_INFINITY) !== (right.avgLatencyMs ?? Number.POSITIVE_INFINITY)) {
    return (left.avgLatencyMs ?? Number.POSITIVE_INFINITY) - (right.avgLatencyMs ?? Number.POSITIVE_INFINITY);
  }
  return (right.avgConfidence ?? 0) - (left.avgConfidence ?? 0);
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatNumber(value, digits = 0) {
  if (!Number.isFinite(Number(value))) return '-';
  return Number(value).toFixed(digits);
}

function renderTable(rows) {
  const header = [
    'Rank',
    'Model',
    'Pass',
    'Avg Latency',
    'Avg Confidence',
    'Avg Selectors',
    'Avg Actions',
    'Report'
  ];

  const body = rows.map((row, index) => [
    String(index + 1),
    row.model,
    `${row.passCount}/${row.scenarios} (${formatPercent(row.passRate)})`,
    `${formatNumber(row.avgLatencyMs, 0)} ms`,
    formatNumber(row.avgConfidence, 2),
    formatNumber(row.avgSelectors, 1),
    formatNumber(row.avgActions, 1),
    row.file
  ]);

  const widths = header.map((title, columnIndex) =>
    Math.max(title.length, ...body.map((row) => row[columnIndex].length))
  );

  const pad = (value, width) => value.padEnd(width, ' ');
  const separator = widths.map((width) => '-'.repeat(width)).join(' | ');

  console.log(header.map((value, index) => pad(value, widths[index])).join(' | '));
  console.log(separator);
  body.forEach((row) => {
    console.log(row.map((value, index) => pad(value, widths[index])).join(' | '));
  });
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const reportsDir = path.resolve(args.dir || path.join(__dirname, 'reports'));
  const outputPath = args.out ? path.resolve(args.out) : '';
  const files = listReportFiles(reportsDir);
  const summaries = files
    .map((filePath) => buildSummary(filePath, loadJson(filePath)))
    .filter(Boolean)
    .sort(compareSummaries);

  if (summaries.length === 0) {
    console.error(`No comparable provider reports found in ${reportsDir}`);
    process.exit(1);
  }

  renderTable(summaries);

  const preferred = summaries[0];
  console.log('');
  console.log(`Recommended first choice: ${preferred.model}`);
  console.log(`Reason: passRate=${formatPercent(preferred.passRate)}, avgLatency=${formatNumber(preferred.avgLatencyMs, 0)}ms, avgConfidence=${formatNumber(preferred.avgConfidence, 2)}`);

  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          reportsDir,
          summaries,
          preferredModel: preferred.model
        },
        null,
        2
      )
    );
    console.log(`Saved comparison report to ${outputPath}`);
  }
}

run();
