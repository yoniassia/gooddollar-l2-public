const links = [
  { label: 'Docs', href: 'https://docs.gooddollar.org' },
  { label: 'GitHub', href: 'https://github.com/GoodDollar' },
  { label: 'Community', href: 'https://community.gooddollar.org' },
]

export function LandingFooter() {
  return (
    <footer className="w-full max-w-5xl mx-auto mt-auto pt-8 mb-4 px-4">
      <div className="border-t border-gray-700/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          Powered by GoodDollar L2
        </p>
        <nav className="flex items-center gap-4">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
