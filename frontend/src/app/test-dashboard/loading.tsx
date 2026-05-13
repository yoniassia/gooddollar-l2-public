export default function TestDashboardLoading() {
  return (
    <div className="w-full max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-7 w-40 bg-dark-50 rounded" />
          <div className="h-4 w-56 bg-dark-50 rounded" />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-dark-50 rounded-xl p-4 space-y-2">
            <div className="h-3 w-20 bg-dark-100 rounded" />
            <div className="h-7 w-16 bg-dark-100 rounded" />
            <div className="h-3 w-24 bg-dark-100 rounded" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="h-9 w-40 bg-dark-50 rounded-lg mb-4" />

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <div className="flex flex-col gap-4">
          <div className="bg-dark-50 rounded-xl p-4 space-y-3">
            <div className="h-4 w-32 bg-dark-100 rounded" />
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 bg-dark-100 rounded" />
            ))}
          </div>
          <div className="bg-dark-50 rounded-xl p-4 space-y-3">
            <div className="h-4 w-40 bg-dark-100 rounded" />
            <div className="h-16 bg-dark-100 rounded" />
          </div>
        </div>
        <div className="bg-dark-50 rounded-xl p-4 space-y-3">
          <div className="h-4 w-28 bg-dark-100 rounded" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-dark-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}
