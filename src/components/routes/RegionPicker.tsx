"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export interface RegionOption {
  name: string;
  aliases: string[];
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: RegionOption[];
  placeholder?: string;
}

export function RegionPicker({ value, onChange, options, placeholder = "Не указан" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      if (o.name.toLowerCase().includes(q)) return true;
      return o.aliases.some((a) => a.toLowerCase().includes(q));
    });
  }, [query, options]);

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  function commit(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlighted];
      if (pick) commit(pick.name);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  useEffect(() => {
    if (!open || !listRef.current) return;
    const li = listRef.current.children[highlighted] as HTMLLIElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Введите название…"
          className="w-full px-3 py-2 rounded-xl border border-[#F4632A] bg-white text-sm outline-none transition-colors"
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm text-left flex items-center justify-between gap-2 hover:border-[#F4632A] focus:border-[#F4632A] focus:outline-none transition-colors"
        >
          <span className={value ? "text-[#1C1C1E]" : "text-[#A1A1AA]"}>
            {value || placeholder}
          </span>
          <span className="flex items-center gap-1 text-[#A1A1AA]">
            {value && (
              <X
                size={14}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="hover:text-[#1C1C1E] cursor-pointer"
              />
            )}
            <ChevronDown size={16} />
          </span>
        </button>
      )}
      {open && (
        <ul
          ref={listRef}
          className="absolute z-20 mt-1 left-0 right-0 max-h-64 overflow-auto rounded-xl border border-[#E4E4E7] bg-white shadow-lg py-1"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-[#A1A1AA]">Ничего не найдено</li>
          )}
          {filtered.map((o, i) => (
            <li
              key={o.name}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(o.name);
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`px-3 py-2 text-sm cursor-pointer ${
                i === highlighted ? "bg-[#F5F4F1] text-[#1C1C1E]" : "text-[#1C1C1E] hover:bg-[#F5F4F1]"
              } ${value === o.name ? "font-medium" : ""}`}
            >
              {o.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
