export default function Footer() {
  return (
    <footer className="relative border-t border-white/5 bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-gray-500">&copy; 2026 MangaZap. All rights reserved.</p>
        <div className="flex items-center gap-6">
          <a href="#" className="text-sm text-gray-500 hover:text-white transition-colors">Twitter</a>
          <a href="#" className="text-sm text-gray-500 hover:text-white transition-colors">GitHub</a>
          <a href="#" className="text-sm text-gray-500 hover:text-white transition-colors">Discord</a>
        </div>
      </div>
    </footer>
  )
}
