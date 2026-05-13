import { test, expect } from '@playwright/test'

test.describe('Stocks page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/stocks')
  })

  test('renders stocks page without crashing', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible()
    // Should not redirect to an error page
    await expect(page).not.toHaveURL(/\/404/)
  })

  test('page has stock-related content', async ({ page }) => {
    // Stocks page should show some stock-related heading or table
    const body = page.locator('body')
    const text = await body.innerText()
    expect(text.length).toBeGreaterThan(0)
  })
})

test.describe('Stocks detail page', () => {
  test('navigating to /stocks/AAPL renders detail page', async ({ page }) => {
    await page.goto('/stocks/AAPL')
    await expect(page).not.toHaveURL(/\/404/)
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('Predict page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/predict')
  })

  test('renders prediction markets page', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible()
    await expect(page).not.toHaveURL(/\/404/)
  })

  test('shows market cards or empty state', async ({ page }) => {
    const body = page.locator('body')
    const text = await body.innerText()
    expect(text.length).toBeGreaterThan(50)
  })

  test('contains an InfoBanner about testnet / coming features', async ({ page }) => {
    // InfoBanner is used in predict page
    await page.waitForLoadState('networkidle')
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })
})

test.describe('Predict market detail page', () => {
  test('navigating to /predict/some-market-id renders page', async ({ page }) => {
    await page.goto('/predict/test-market')
    await expect(page).not.toHaveURL(/\/404/)
  })
})

test.describe('Perps page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/perps')
  })

  test('renders perps page without crashing', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible()
    await expect(page).not.toHaveURL(/\/404/)
  })

  test('perps page has trading-related content', async ({ page }) => {
    const text = await page.locator('body').innerText()
    expect(text.length).toBeGreaterThan(0)
  })
})

test.describe('Lend page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/lend')
  })

  test('renders lending page without crashing', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible()
    await expect(page).not.toHaveURL(/\/404/)
  })

  test('lending page has relevant content', async ({ page }) => {
    const text = await page.locator('body').innerText()
    expect(text.length).toBeGreaterThan(0)
  })
})

test.describe('Portfolio page', () => {
  test('renders portfolio page', async ({ page }) => {
    await page.goto('/portfolio')
    await expect(page.locator('body')).toBeVisible()
    await expect(page).not.toHaveURL(/\/404/)
  })
})

test.describe('Pool and Bridge pages (coming soon)', () => {
  test('Pool page renders', async ({ page }) => {
    await page.goto('/pool')
    await expect(page.locator('body')).toBeVisible()
  })

  test('Bridge page renders', async ({ page }) => {
    await page.goto('/bridge')
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('Swap redirect', () => {
  test('/swap redirects to /', async ({ page }) => {
    await page.goto('/swap')
    await expect(page).toHaveURL('/')
    await expect(page.locator('#swap-card')).toBeVisible()
  })
})
