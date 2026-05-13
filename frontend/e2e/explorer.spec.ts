import { test, expect } from '@playwright/test'

// Blockscout explorer address used for all explorer tests.
// This address has on-chain transaction history on the GoodDollar L2 devnet.
const TEST_ADDRESS = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const EXPLORER_URL = 'https://explorer.goodclaw.org'

test.describe('explorer/address', () => {
  test('transactions_visible — address page loads and shows transactions', async ({ page }) => {
    // Navigate directly to the Blockscout explorer address page
    await page.goto(`${EXPLORER_URL}/address/${TEST_ADDRESS}`, {
      waitUntil: 'domcontentloaded',
    })

    // Wait for the page to finish client-side hydration and data loading.
    // Blockscout renders transactions client-side via React Query.
    // The transactions tab contains a table or a list of tx hashes.
    const txTable = page.locator('[data-test="transactions_table"], table').first()
    await expect(txTable).toBeVisible({ timeout: 15_000 })

    // Verify at least one transaction row is present
    const txRows = page.locator(
      '[data-test="transactions_table"] tr, table tbody tr',
    )
    await expect(txRows.first()).toBeVisible({ timeout: 15_000 })
  })

  test('transactions_visible — transactions tab is populated on page load', async ({ page }) => {
    await page.goto(`${EXPLORER_URL}/address/${TEST_ADDRESS}`, {
      waitUntil: 'networkidle',
    })

    // After full load (networkidle) the Transactions tab content should be present.
    // A loading spinner or "no data" state would fail this assertion.
    const noTxsMsg = page.getByText(/no transactions/i)
    await expect(noTxsMsg).not.toBeVisible()

    // At least one transaction hash link (0x...) should be in the DOM
    const txHashLink = page.locator('a[href*="/tx/0x"]').first()
    await expect(txHashLink).toBeVisible({ timeout: 15_000 })
  })
})
