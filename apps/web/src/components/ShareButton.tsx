import { useState } from 'react';
import { useT } from '../i18n';

interface Props {
  title: string;
  url?: string;
}

export function ShareButton({ title, url }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    const shareUrl = url ?? window.location.href;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try { await navigator.share({ title, url: shareUrl }); return; }
      catch { /* user cancelled — fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* if even clipboard fails there's nothing graceful left */ }
  };

  return (
    <span style={{ position: 'relative' }}>
      <button type="button" className="btn ghost" onClick={onClick}>
        {t('story.share')}
      </button>
      {copied && (
        <span className="share-toast" role="status">
          {t('story.shareCopied')}
        </span>
      )}
    </span>
  );
}
