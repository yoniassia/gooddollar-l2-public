const steps = [
  {
    number: '1',
    title: 'Trade Any Asset',
    description: 'Swap tokens, trade stocks, predict events, or trade perpetual futures — all on one platform.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    number: '2',
    title: 'Fees Fund UBI',
    description: '33% of every trading fee goes directly to the GoodDollar UBI pool — automatically.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    number: '3',
    title: 'People Earn Income',
    description: 'Verified humans worldwide receive daily universal basic income payouts from the pool.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
]

export function HowItWorks() {
  return (
    <section className="w-full max-w-2xl mx-auto mt-16 px-4">
      <h2 className="text-xl font-bold text-white text-center mb-8">How It Works</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {steps.map((step) => (
          <div
            key={step.number}
            className="flex flex-col items-center text-center p-5 rounded-2xl bg-dark-100/60 border border-gray-700/30 hover:border-goodgreen/30 hover:bg-dark-100/80 transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-full bg-goodgreen/10 border border-goodgreen/20 flex items-center justify-center text-goodgreen font-semibold mb-3">
              {step.number}
            </div>
            <div className="text-goodgreen mb-2">{step.icon}</div>
            <h3 className="text-sm font-semibold text-white mb-1">{step.title}</h3>
            <p className="text-xs text-gray-400 leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
