const stats = [
  { label: 'UBI Distributed', value: '$2.4M' },
  { label: 'Daily Claimers', value: '640K+' },
  { label: 'Total Swaps', value: '1.2M' },
]

export function StatsRow() {
  return (
    <section className="w-full max-w-2xl mx-auto mt-10 px-4">
      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center text-center py-4 px-2 rounded-xl bg-dark-100/40 border border-gray-700/15"
          >
            <span className="text-lg sm:text-xl font-bold text-goodgreen">{stat.value}</span>
            <span className="text-[11px] sm:text-xs text-gray-400 mt-1">{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
