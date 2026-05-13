import { test, expect } from '@playwright/test'

test.describe('Header navigation — desktop', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders GoodDollar logo and brand name', async ({ page }) => {
    const header = page.locator('header')
    await expect(header.getByText('GoodDollar')).toBeVisible()
    await expect(header.getByText('G$')).toBeVisible()
  })

  test('desktop nav has Swap, Explore, Pool, Bridge, Stocks, Predict, Perps, Lend links', async ({ page }) => {
    const nav = page.locator('nav.hidden.sm\\:flex, header nav').first()
    await expect(nav.getByRole('link', { name: 'Swap' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Explore' })).toBeVisible()
    await expect(nav.getByRole('link', { name: /Stocks/ })).toBeVisible()
    await expect(nav.getByRole('link', { name: /Predict/ })).toBeVisible()
    await expect(nav.getByRole('link', { name: /Perps/ })).toBeVisible()
    await expect(nav.getByRole('link', { name: /Lend/ })).toBeVisible()
  })

  test('Pool and Bridge show "Soon" badge', async ({ page }) => {
    const soonBadges = page.locator('[data-testid="soon-badge"]')
    await expect(soonBadges.first()).toBeVisible()
    const count = await soonBadges.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('clicking Explore navigates to /explore', async ({ page }) => {
    const nav = page.locator('header nav').first()
    await nav.getByRole('link', { name: 'Explore' }).click()
    await expect(page).toHaveURL('/explore')
    await expect(page.getByRole('heading', { name: /explore tokens/i })).toBeVisible()
  })

  test('clicking Stocks navigates to /stocks', async ({ page }) => {
    await page.locator('header nav').first().getByRole('link', { name: 'Stocks' }).click()
    await expect(page).toHaveURL('/stocks')
  })

  test('clicking Predict navigates to /predict', async ({ page }) => {
    await page.locator('header nav').first().getByRole('link', { name: 'Predict' }).click()
    await expect(page).toHaveURL('/predict')
  })

  test('clicking Perps navigates to /perps', async ({ page }) => {
    await page.locator('header nav').first().getByRole('link', { name: 'Perps' }).click()
    await expect(page).toHaveURL('/perps')
  })

  test('clicking Lend navigates to /lend', async ({ page }) => {
    await page.locator('header nav').first().getByRole('link', { name: 'Lend' }).click()
    await expect(page).toHaveURL('/lend')
  })

  test('portfolio icon link navigates to /portfolio', async ({ page }) => {
    await page.getByRole('link', { name: /portfolio/i }).click()
    await expect(page).toHaveURL('/portfolio')
  })

  test('clicking Swap nav link navigates to /', async ({ page }) => {
    await page.goto('/explore')
    await page.locator('header nav').first().getByRole('link', { name: 'Swap' }).click()
    await expect(page).toHaveURL('/')
  })
})

test.describe('Header navigation — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('hamburger button is visible on mobile', async ({ page }) => {
    const hamburger = page.getByLabel('Open menu')
    await expect(hamburger).toBeVisible()
  })

  test('desktop nav is hidden on mobile', async ({ page }) => {
    const desktopNav = page.locator('nav.hidden.sm\\:flex')
    await expect(desktopNav).toBeHidden()
  })

  test('tapping hamburger opens mobile menu', async ({ page }) => {
    await page.getByLabel('Open menu').click()
    await expect(page.getByTestId('mobile-nav')).toBeVisible()
  })

  test('mobile menu contains all nav items', async ({ page }) => {
    await page.getByLabel('Open menu').click()
    const mobileNav = page.getByTestId('mobile-nav')
    await expect(mobileNav.getByText('Swap')).toBeVisible()
    await expect(mobileNav.getByText('Explore')).toBeVisible()
    await expect(mobileNav.getByText('Stocks')).toBeVisible()
    await expect(mobileNav.getByText('Predict')).toBeVisible()
    await expect(mobileNav.getByText('Perps')).toBeVisible()
    await expect(mobileNav.getByText('Lend')).toBeVisible()
  })

  test('mobile menu shows Coming Soon for Pool and Bridge', async ({ page }) => {
    await page.getByLabel('Open menu').click()
    const mobileNav = page.getByTestId('mobile-nav')
    const comingSoon = mobileNav.getByText('Coming Soon')
    await expect(comingSoon.first()).toBeVisible()
    const count = await comingSoon.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('tapping close button dismisses mobile menu', async ({ page }) => {
    await page.getByLabel('Open menu').click()
    await expect(page.getByTestId('mobile-nav')).toBeVisible()
    await page.getByLabel('Close menu').click()
    await expect(page.getByTestId('mobile-nav')).not.toBeVisible()
  })

  test('pressing Escape dismisses mobile menu', async ({ page }) => {
    await page.getByLabel('Open menu').click()
    await expect(page.getByTestId('mobile-nav')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('mobile-nav')).not.toBeVisible()
  })

  test('tapping a menu item navigates and closes the menu', async ({ page }) => {
    await page.getByLabel('Open menu').click()
    await page.getByTestId('mobile-nav').getByText('Explore').click()
    await expect(page).toHaveURL('/explore')
    await expect(page.getByTestId('mobile-nav')).not.toBeVisible()
  })
})
