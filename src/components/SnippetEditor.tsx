"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  snippetId?: string;
  initialTitle?: string;
  initialHtml?: string;
};

export function SnippetEditor({ snippetId, initialTitle, initialHtml }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialHtml ?? "",
    editorProps: {
      attributes: {
        class: "tiptap min-h-[240px] focus:outline-none",
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  async function save() {
    if (!editor) return;
    const html = editor.getHTML();
    const plain = editor.getText().trim();
    if (!title.trim() || !plain) {
      setError("Title and content are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (snippetId) {
        const res = await fetch(`/api/snippets/${snippetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), contentHtml: html }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Failed to save");
        }
        router.refresh();
      } else {
        const res = await fetch("/api/snippets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), contentHtml: html }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Failed to save");
        }
        const { id } = await res.json();
        router.push(`/dashboard/knowledge/${id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!snippetId) return;
    if (!confirm("Delete this snippet?")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/snippets/${snippetId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      router.push("/dashboard/knowledge");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Snippet title"
        className="w-full text-2xl font-medium border-b border-gray-200 focus:border-black outline-none py-2 bg-transparent"
      />

      <div className="border border-gray-200 rounded-md">
        <Toolbar editor={editor} />
        <div className="px-4 py-3">
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-black text-white px-5 py-2.5 rounded-md hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? "Saving…" : snippetId ? "Save changes" : "Save snippet"}
        </button>
        {snippetId && (
          <button
            onClick={remove}
            disabled={deleting}
            className="text-sm text-red-600 hover:text-red-800 transition"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const btn =
    "px-2 py-1 text-xs rounded hover:bg-gray-100 data-[active=true]:bg-gray-200 data-[active=true]:text-gray-900 text-gray-600";
  return (
    <div className="flex items-center gap-1 border-b border-gray-200 px-2 py-1.5">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        data-active={editor.isActive("bold")}
        className={btn}
      >
        Bold
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        data-active={editor.isActive("italic")}
        className={btn}
      >
        Italic
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        data-active={editor.isActive("heading", { level: 2 })}
        className={btn}
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        data-active={editor.isActive("bulletList")}
        className={btn}
      >
        • List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        data-active={editor.isActive("orderedList")}
        className={btn}
      >
        1. List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        data-active={editor.isActive("codeBlock")}
        className={btn}
      >
        Code
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        data-active={editor.isActive("blockquote")}
        className={btn}
      >
        Quote
      </button>
    </div>
  );
}
