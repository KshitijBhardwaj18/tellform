"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      setName("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-black text-white text-sm px-4 py-2 rounded-md hover:opacity-90 transition"
      >
        New project
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        autoFocus
        className="border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-black"
      />
      <button
        type="submit"
        disabled={submitting}
        className="bg-black text-white text-sm px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50 transition"
      >
        {submitting ? "Creating..." : "Create"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        className="text-sm text-gray-500 px-2 py-2 hover:text-gray-900 transition"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
    </form>
  );
}
