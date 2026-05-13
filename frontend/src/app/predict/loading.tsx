export default function PredictLoading() {
  return (
    <div className="w-full max-w-5xl mx-auto animate-pulse">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-dark-50/40" />
        <div>
          <div className="h-7 w-52 bg-dark-50/50 rounded-lg mb-1" />
          <div className="h-3 w-64 bg-dark-50/30 rounded" />
        </div>
      </div>
      <div className="flex gap-3 mb-6">
        <div className="h-10 w-60 bg-dark-50/40 rounded-xl" />
        <div className="h-10 w-32 bg-dark-50/40 rounded-xl" />
      </div>
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-dark-50/30 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-dark-100 rounded-2xl border border-gray-700/20 p-5">
            <div className="flex justify-between mb-3">
              <div className="h-5 w-16 bg-dark-50/30 rounded-full" />
              <div className="h-4 w-14 bg-dark-50/30 rounded" />
            </div>
            <div className="h-5 w-full bg-dark-50/40 rounded mb-2" />
            <div className="h-4 w-3/4 bg-dark-50/30 rounded mb-4" />
            <div className="h-6 w-16 bg-dark-50/50 rounded mb-3" />
            <div className="h-2 w-full bg-dark-50/30 rounded-full mb-3" />
            <div className="flex justify-between">
              <div className="h-3 w-16 bg-dark-50/30 rounded" />
              <div className="h-3 w-20 bg-dark-50/30 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
