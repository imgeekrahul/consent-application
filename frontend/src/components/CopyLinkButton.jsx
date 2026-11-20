import { useEffect, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { copyToClipboard } from '../lib/format.js';

export default function CopyLinkButton({ url, className = 'btn-secondary', label = 'Copy link', compact = false }) {
  const [state, setState] = useState('idle'); // idle | copied | failed
  useEffect(() => {
    if (state === 'idle') return undefined;
    const t = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(t);
  }, [state]);

  const onClick = async () => setState((await copyToClipboard(url)) ? 'copied' : 'failed');
  const text = state === 'copied' ? 'Copied!' : state === 'failed' ? 'Copy failed' : label;
  return (
    <button type="button" onClick={onClick} className={className} title="Copy shareable link" aria-live="polite">
      {state === 'copied' ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
      <span className={compact ? 'sr-only' : ''}>{text}</span>
    </button>
  );
}
