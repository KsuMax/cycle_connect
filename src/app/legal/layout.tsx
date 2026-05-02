import Link from "next/link";
import { Bike } from "lucide-react";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <header className="bg-white border-b border-[#E4E4E7]">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#F4632A" }}
            >
              <Bike size={18} color="white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-bold">
              <span style={{ color: "#1C1C1E" }}>Cycle</span>
              <span style={{ color: "#F4632A" }}>Connect</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
        <nav className="flex flex-wrap gap-2 mb-6 text-xs">
          <Link
            href="/legal/privacy"
            className="px-3 py-1.5 rounded-lg bg-white border border-[#E4E4E7] text-[#71717A] hover:border-[#F4632A] hover:text-[#F4632A] transition-colors"
          >
            Политика ПДн
          </Link>
          <Link
            href="/legal/consent"
            className="px-3 py-1.5 rounded-lg bg-white border border-[#E4E4E7] text-[#71717A] hover:border-[#F4632A] hover:text-[#F4632A] transition-colors"
          >
            Согласие на обработку
          </Link>
          <Link
            href="/legal/terms"
            className="px-3 py-1.5 rounded-lg bg-white border border-[#E4E4E7] text-[#71717A] hover:border-[#F4632A] hover:text-[#F4632A] transition-colors"
          >
            Пользовательское соглашение
          </Link>
        </nav>

        <article
          className="bg-white rounded-2xl border border-[#E4E4E7] p-6 sm:p-8 text-sm
            [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-[#1C1C1E] [&_h1]:mt-0 [&_h1]:mb-2
            [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-[#1C1C1E] [&_h2]:mt-8 [&_h2]:mb-3
            [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[#1C1C1E] [&_h3]:mt-6 [&_h3]:mb-2
            [&_p]:text-[#3F3F46] [&_p]:leading-relaxed [&_p]:my-3
            [&_ul]:my-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5
            [&_li]:text-[#3F3F46] [&_li]:leading-relaxed [&_li]:pl-1
            [&_strong]:text-[#1C1C1E] [&_strong]:font-semibold
            [&_a]:text-[#F4632A] hover:[&_a]:underline"
        >
          {children}
        </article>
      </main>
    </div>
  );
}
