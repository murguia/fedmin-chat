import Chat from '@/components/Chat';
import AboutSection from '@/components/AboutSection';

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-100">
                  Fed Minutes Chat
                </h1>
                <p className="text-sm text-slate-400">
                  Federal Reserve Meeting Minutes 1967-1973
                </p>
              </div>
            </div>
            <AboutSection />
          </div>
        </div>
      </header>

      <Chat />

      <footer className="border-t border-slate-800 py-4">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-slate-500">
          <p>
            Powered by AI semantic search over Federal Reserve Board of Governors
            meeting minutes (never previously public) obtained via FOIA by{' '}
            <a
              href="https://www.crisesnotes.com/database/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              Crisis Notes / Nathan Tankus
            </a>
            . Built with Next.js, OpenAI, and Pinecone.
          </p>
        </div>
      </footer>
    </main>
  );
}
