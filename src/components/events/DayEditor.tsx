"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List, ListOrdered, Heading2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DayEditorProps {
  placeholder?: string;
  content?: string;
  onChange?: (html: string) => void;
}

export function DayEditor({ placeholder, content = "", onChange }: DayEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: placeholder ?? "Опишите этот день: что увидите, где остановитесь, что нужно взять...",
      }),
    ],
    content,
    onUpdate({ editor }) {
      onChange?.(editor.getHTML());
    },
  });

  if (!editor) return null;

  const toolbarBtn = (active: boolean, onClick: () => void, icon: React.ReactNode, title: string) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded-lg transition-colors",
        active ? "bg-[#F4632A] text-white" : "text-[#71717A] hover:bg-[#F5F4F1] hover:text-[#1C1C1E]"
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="tiptap-editor border border-[#E4E4E7] rounded-xl overflow-hidden focus-within:border-[#F4632A] transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#E4E4E7] bg-[#FAFAF9]">
        {toolbarBtn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold size={14} />, "Жирный")}
        {toolbarBtn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic size={14} />, "Курсив")}
        {toolbarBtn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={14} />, "Заголовок")}
        <div className="w-px h-4 bg-[#E4E4E7] mx-1" />
        {toolbarBtn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List size={14} />, "Список")}
        {toolbarBtn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={14} />, "Нумерованный список")}
      </div>
      <EditorContent editor={editor} className="text-sm text-[#1C1C1E]" />
    </div>
  );
}
