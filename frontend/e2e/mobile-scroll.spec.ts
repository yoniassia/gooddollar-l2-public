import { test, expect } from '@playwright/test'

test.describe('Mobile horizontal scroll', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('homepage should not have horizontal scroll at 375px (iPhone SE)', async ({ page }) => {
    await page.goto('/')
    // Wait for page to settle
    await page.waitForLoadState('networkidle')

    // Primary check: body.scrollWidth should not exceed window.innerWidth
    const overflow = await page.evaluate(() => {
      const bodyScrollWidth = document.body.scrollWidth
      const windowWidth = window.innerWidth
      return {
        bodyScrollWidth,
        windowWidth,
        hasOverflow: bodyScrollWidth > windowWidth,
        overflowAmount: bodyScrollWidth - windowWidth,
      }
    })

    console.log('Overflow check:', JSON.stringify(overflow))

    // Find offending elements
    const offenders = await page.evaluate(() => {
      const elements: Array<{ tag: string; id: string; className: string; right: number; width: number }> = []
      const allElements = document.querySelectorAll('*')
      const vw = window.innerWidth

      allElements.forEach((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.right > vw + 1) {
          const htmlEl = el as HTMLElement
          elements.push({
            tag: htmlEl.tagName,
            id: htmlEl.id,
            className: htmlEl.className?.toString().slice(0, 120),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          })
        }
      })
      return elements.slice(0, 20) // top 20 offenders
    })

    console.log('Offending elements:', JSON.stringify(offenders, null, 2))

    // Take a screenshot for the report
    await page.screenshot({ path: 'playwright-report/mobile-scroll-375px.png', fullPage: false })

    expect(
      overflow.hasOverflow,
      `Horizontal overflow detected: body.scrollWidth (${overflow.bodyScrollWidth}px) > window.innerWidth (${overflow.windowWidth}px) by ${overflow.overflowAmount}px. Offenders: ${JSON.stringify(offenders.slice(0, 3))}`
    ).toBe(false)
  })

  test('homepage body and html overflow-x CSS is set correctly', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const styles = await page.evaluate(() => {
      const bodyStyle = window.getComputedStyle(document.body)
      const htmlStyle = window.getComputedStyle(document.documentElement)
      return {
        bodyOverflowX: bodyStyle.overflowX,
        htmlOverflowX: htmlStyle.overflowX,
      }
    })

    console.log('Overflow CSS:', JSON.stringify(styles))
    // Even if overflow-x hidden is set, scroll width can still exceed viewport
    // This test documents the CSS state
    expect(styles.bodyOverflowX).toBe('hidden')
    expect(styles.htmlOverflowX).toBe('hidden')
  })
})
