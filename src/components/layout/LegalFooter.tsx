import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="mt-auto border-t border-[#E4E4E7] bg-[#FAFAF9]">
      <div className="max-w-5xl mx-auto px-4 py-4 pb-20 sm:pb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[#A1A1AA]">
        <span>© {new Date().getFullYear()} CycleConnect</span>
        <Link href="/legal/privacy" className="hover:text-[#F4632A] transition-colors">
          Политика ПДн
        </Link>
        <Link href="/legal/consent" className="hover:text-[#F4632A] transition-colors">
          Согласие
        </Link>
        <Link href="/legal/terms" className="hover:text-[#F4632A] transition-colors">
          Соглашение
        </Link>
      </div>
    </footer>
  );
}
