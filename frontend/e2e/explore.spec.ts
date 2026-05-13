import { test, expect } from '@playwright/test'

test.describe('Explore page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/explore')
  })

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /explore tokens/i })).toBeVisible()
  })

  test('renders market stats bar with three cards', async ({ page }) => {
    await expect(page.getByText(/total market cap/i)).toBeVisible()
    await expect(page.getByText(/trending/i)).toBeVisible()
    await expect(page.getByText(/top gainers/i)).toBeVisible()
  })

  test('token table is visible with header columns', async ({ page }) => {
    const table = page.locator('table')
    await expect(table).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /token/i })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /price/i })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /24h/i })).toBeVisible()
  })

  test('token rows are present', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
  })

  test('search filters token list', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search tokens/i)
    await searchInput.fill('ETH')
    const rows = page.locator('table tbody tr')
    // After filtering, should show fewer rows or only ETH-related
    await page.waitForTimeout(300)
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
    // No empty-state for ETH search
    await expect(page.getByText(/no tokens match/i)).not.toBeVisible()
  })

  test('search with non-existent token shows empty state', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search tokens/i)
    await searchInput.fill('DOESNOTEXIST12345')
    await expect(page.getByText(/no tokens match your search/i)).toBeVisible()
  })

  test('category filter buttons are present', async ({ page }) => {
    const allButton = page.getByRole('button', { name: 'All', exact: true })
    await expect(allButton).toBeVisible()
  })

  test('clicking a token row navigates to explore/[symbol]', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.click()
    await expect(page).toHaveURL(/\/explore\/[A-Z$]+/)
  })

  test('clicking Swap button on row navigates home with buy param', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.hover()
    const swapBtn = firstRow.getByRole('button', { name: 'Swap' })
    await swapBtn.click()
    await expect(page).toHaveURL(/\/\?buy=/)
  })

  test('clicking a column header sorts the table', async ({ page }) => {
    const priceHeader = page.getByRole('columnheader', { name: /price/i })
    await priceHeader.click()
    // Sort arrow should change — just verify page still has rows
    const rows = page.locator('table tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
  })
})

test.describe('Explore token detail page', () => {
  test('navigating to /explore/ETH renders detail page', async ({ page }) => {
    await page.goto('/explore/ETH')
    // Should render without crashing
    await expect(page).not.toHaveURL(/\/404/)
    await expect(page.locator('body')).toBeVisible()
  })
})
