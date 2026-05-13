#!/usr/bin/env node
/**
 * Accessibility audit script using axe-core
 * Runs WCAG compliance checks on key pages
 */

const { chromium } = require('playwright');
const { injectAxe, checkA11y, getViolations } = require('axe-playwright');

const pages = [
  '/',
  '/swap',
  '/explore',
  '/portfolio',
  '/bridge',
  '/predict',
  '/lend',
  '/perps',
  '/governance'
];

async function auditPage(page, url) {
  console.log(`\n🔍 Auditing: ${url}`);

  try {
    await page.goto(`http://localhost:3000${url}`, {
      waitUntil: 'networkidle',
      timeout: 10000
    });

    // Wait for content to load
    await page.waitForTimeout(2000);

    await injectAxe(page);

    const results = await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: { html: false }
    });

    if (results.violations.length === 0) {
      console.log(`✅ No violations found on ${url}`);
    } else {
      console.log(`❌ ${results.violations.length} violation(s) found on ${url}:`);
      results.violations.forEach((violation, i) => {
        console.log(`   ${i + 1}. ${violation.id}: ${violation.description}`);
        console.log(`      Impact: ${violation.impact}`);
        console.log(`      Elements: ${violation.nodes.length} affected`);
        if (violation.nodes.length > 0) {
          console.log(`      First element: ${violation.nodes[0].target[0]}`);
        }
      });
    }

    return results;
  } catch (error) {
    console.log(`⚠️  Error auditing ${url}: ${error.message}`);
    return { violations: [] };
  }
}

async function runAudit() {
  console.log('🚀 Starting accessibility audit...');
  console.log('📋 Checking WCAG compliance on key pages\n');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  let totalViolations = 0;
  const auditResults = [];

  for (const url of pages) {
    const results = await auditPage(page, url);
    auditResults.push({ url, violations: results.violations });
    totalViolations += results.violations.length;
  }

  await browser.close();

  console.log('\n📊 AUDIT SUMMARY');
  console.log('================');
  console.log(`Pages audited: ${pages.length}`);
  console.log(`Total violations: ${totalViolations}`);

  if (totalViolations === 0) {
    console.log('🎉 All pages pass accessibility audit!');
  } else {
    console.log('\n📋 VIOLATIONS BY PAGE:');
    auditResults.forEach(({ url, violations }) => {
      if (violations.length > 0) {
        console.log(`   ${url}: ${violations.length} violation(s)`);
      }
    });
  }

  console.log('\n💡 For detailed analysis, enable AxeDevTools in browser dev console');
  console.log('   Open the page in browser and check console for live violations');
}

// Check if dev server is running
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000');
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log('❌ Development server not running on http://localhost:3000');
    console.log('   Start with: npm run dev');
    process.exit(1);
  }

  await runAudit();
}

if (require.main === module) {
  main().catch(console.error);
}