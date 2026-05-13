export default function ExploreLoading() {
  return (
    <div className="w-full max-w-5xl mx-auto animate-pulse">
      <div className="mb-6">
        <div className="h-8 w-48 bg-dark-50/50 rounded-lg mb-2" />
        <div className="h-4 w-80 bg-dark-50/30 rounded" />
      </div>
      <div className="h-10 w-72 bg-dark-50/40 rounded-xl mb-6" />
      <div className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
        <div className="grid grid-cols-5 gap-4 px-4 py-3 border-b border-gray-700/20">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 bg-dark-50/40 rounded" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-5 gap-4 px-4 py-4 border-b border-gray-700/10">
            <div className="h-4 w-6 bg-dark-50/30 rounded" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-dark-50/40" />
              <div className="h-4 w-20 bg-dark-50/30 rounded" />
            </div>
            <div className="h-4 w-16 bg-dark-50/30 rounded ml-auto" />
            <div className="h-4 w-14 bg-dark-50/30 rounded ml-auto" />
            <div className="h-4 w-16 bg-dark-50/30 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
