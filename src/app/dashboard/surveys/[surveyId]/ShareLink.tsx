"use client";

import { useEffect, useState } from "react";

export function ShareLink({ surveyId }: { surveyId: string }) {
  const path = `/survey/${surveyId}`;
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
  }, [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be unavailable on insecure contexts
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={url}
        title={url}
        className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 w-72"
      />
      <button
        onClick={copy}
        className="text-xs bg-black text-white px-3 py-2 rounded-md hover:opacity-90 transition"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
