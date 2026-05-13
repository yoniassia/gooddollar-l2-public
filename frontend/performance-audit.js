#!/usr/bin/env node
/**
 * GoodDollar L2 Performance Audit Script
 * Uses Lighthouse to audit key pages and generate performance report
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Key pages to audit
const pages = [
  { name: 'Home/Swap', url: 'http://localhost:3100' },
  { name: 'Explore', url: 'http://localhost:3100/explore' },
  { name: 'Stocks', url: 'http://localhost:3100/stocks' },
  { name: 'Bridge', url: 'http://localhost:3100/bridge' },
  { name: 'Portfolio', url: 'http://localhost:3100/portfolio' }
];

// Create output directory
const outputDir = path.join(__dirname, 'lighthouse-reports');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🚀 Starting GoodDollar L2 Performance Audit...\n');

const results = [];

for (const page of pages) {
  console.log(`📊 Auditing ${page.name} (${page.url})`);

  try {
    // Run Lighthouse with performance-focused flags
    const outputFile = path.join(outputDir, `${page.name.toLowerCase().replace('/', '-')}.json`);

    const command = `lighthouse "${page.url}" \
      --only-categories=performance \
      --chrome-flags="--headless --no-sandbox --disable-dev-shm-usage" \
      --output=json \
      --output-path="${outputFile}" \
      --quiet`;

    execSync(command, { stdio: 'pipe' });

    // Parse results
    const report = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    const performance = report.categories.performance;
    const audits = report.audits;

    const result = {
      page: page.name,
      url: page.url,
      score: Math.round(performance.score * 100),
      metrics: {
        fcp: audits['first-contentful-paint']?.displayValue || 'N/A',
        lcp: audits['largest-contentful-paint']?.displayValue || 'N/A',
        cls: audits['cumulative-layout-shift']?.displayValue || 'N/A',
        si: audits['speed-index']?.displayValue || 'N/A',
        tti: audits['interactive']?.displayValue || 'N/A',
        fid: audits['max-potential-fid']?.displayValue || 'N/A'
      },
      opportunities: audits['unused-javascript']?.details?.items?.length || 0,
      bundleSize: audits['total-byte-weight']?.displayValue || 'N/A'
    };

    results.push(result);
    console.log(`   ✅ Score: ${result.score}/100 | FCP: ${result.metrics.fcp} | LCP: ${result.metrics.lcp}`);

  } catch (error) {
    console.error(`   ❌ Failed to audit ${page.name}: ${error.message}`);
    results.push({
      page: page.name,
      url: page.url,
      score: 0,
      error: error.message
    });
  }

  console.log('');
}

// Generate summary report
console.log('📈 Performance Audit Summary:');
console.log('================================');

const validResults = results.filter(r => !r.error);
const averageScore = validResults.reduce((sum, r) => sum + r.score, 0) / validResults.length;

console.log(`Average Performance Score: ${Math.round(averageScore)}/100`);
console.log('');

results.forEach(result => {
  if (result.error) {
    console.log(`❌ ${result.page}: Error - ${result.error}`);
  } else {
    const status = result.score >= 90 ? '✅' : result.score >= 70 ? '⚠️' : '❌';
    console.log(`${status} ${result.page}: ${result.score}/100`);
    console.log(`   FCP: ${result.metrics.fcp} | LCP: ${result.metrics.lcp} | CLS: ${result.metrics.cls}`);
    console.log(`   Bundle: ${result.bundleSize}`);
  }
  console.log('');
});

// Save detailed results
const summaryFile = path.join(outputDir, 'summary.json');
fs.writeFileSync(summaryFile, JSON.stringify(results, null, 2));

console.log(`📁 Detailed reports saved to: ${outputDir}`);
console.log('🏁 Performance audit complete!');