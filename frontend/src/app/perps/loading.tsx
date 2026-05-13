export default function PerpsLoading() {
  return (
    <div className="w-full max-w-5xl mx-auto animate-pulse">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-dark-50/40" />
        <div>
          <div className="h-7 w-48 bg-dark-50/50 rounded-lg mb-1" />
          <div className="h-3 w-56 bg-dark-50/30 rounded" />
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-dark-50/30 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 py-2 mb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 w-24 bg-dark-50/30 rounded" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div>
          <div className="flex gap-2 mb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 w-10 bg-dark-50/30 rounded-lg" />
            ))}
          </div>
          <div className="w-full bg-dark-50/20 rounded-xl" style={{ height: 400 }} />
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4 h-48" />
            <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4 h-48" />
          </div>
        </div>
        <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-5 h-96" />
      </div>
    </div>
  )
}
