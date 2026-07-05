"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X, Check } from "lucide-react";

export interface RegionOption {
  name: string;
  aliases: string[];
}

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
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

  function toggle(name: string) {
    if (value.includes(name)) {
      onChange(value.filter((v) => v !== name));
    } else {
      onChange([...value, name]);
    }
    // Keep the dropdown open so multiple regions can be picked in a row.
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(name: string) {
    onChange(value.filter((v) => v !== name));
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
      if (pick) toggle(pick.name);
    } else if (e.key === "Backspace" && !query && value.length > 0) {
      // Quick-remove the last chip when the search box is empty.
      remove(value[value.length - 1]);
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
        <div className="w-full px-2 py-1.5 rounded-xl border border-[#F4632A] bg-white flex flex-wrap items-center gap-1.5">
          {value.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-[#F5F4F1] text-xs text-[#1C1C1E]"
            >
              {name}
              <X
                size={12}
                onClick={() => remove(name)}
                className="hover:text-[#F4632A] cursor-pointer"
              />
            </span>
          ))}
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={value.length ? "Добавить ещё…" : "Введите название…"}
            className="flex-1 min-w-[8rem] px-1 py-0.5 bg-transparent text-sm outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm text-left flex items-center justify-between gap-2 hover:border-[#F4632A] focus:border-[#F4632A] focus:outline-none transition-colors"
        >
          {value.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1.5">
              {value.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-[#F5F4F1] text-xs text-[#1C1C1E]"
                >
                  {name}
                  <X
                    size={12}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(name);
                    }}
                    className="hover:text-[#F4632A] cursor-pointer"
                  />
                </span>
              ))}
            </span>
          ) : (
            <span className="text-[#A1A1AA]">{placeholder}</span>
          )}
          <ChevronDown size={16} className="text-[#A1A1AA] shrink-0" />
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
          {filtered.map((o, i) => {
            const selected = value.includes(o.name);
            return (
              <li
                key={o.name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggle(o.name);
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-2 ${
                  i === highlighted ? "bg-[#F5F4F1] text-[#1C1C1E]" : "text-[#1C1C1E] hover:bg-[#F5F4F1]"
                } ${selected ? "font-medium" : ""}`}
              >
                <span>{o.name}</span>
                {selected && <Check size={14} className="text-[#F4632A] shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
