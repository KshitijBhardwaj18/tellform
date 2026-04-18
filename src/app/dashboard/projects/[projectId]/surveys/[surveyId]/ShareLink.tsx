"use client";

import { useEffect, useState } from "react";

export function ShareLink({ surveyId }: { surveyId: string }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(`/survey/${surveyId}`);

  useEffect(() => {
    setUrl(`${window.location.origin}/survey/${surveyId}`);
  }, [surveyId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={copy}
      className="text-sm bg-white border border-gray-300 rounded-md px-3 py-2 hover:border-black transition"
      title={url}
    >
      {copied ? "Copied ✓" : "Copy share link"}
    </button>
  );
}
