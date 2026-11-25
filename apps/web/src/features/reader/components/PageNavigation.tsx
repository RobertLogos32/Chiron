import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { boundedPage } from '../lib/pageCamera';

type PageNavigationProps = {
  page: number;
  count: number;
  onChange: (page: number) => void;
};

export function PageNavigation({ page, count, onChange }: PageNavigationProps) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);
  const commit = () => {
    const next = boundedPage(Number(draft), count);
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div className="pdf-page-navigation" role="group" aria-label="Pagine del PDF">
      <button
        aria-label="Pagina precedente"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={17} />
      </button>
      <div>
        <input
          aria-label="Numero pagina"
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft(String(page));
              event.currentTarget.select();
            }
          }}
          style={{ width: `${Math.max(2, String(count).length)}ch` }}
        />
        <span>/ {count}</span>
      </div>
      <button
        aria-label="Pagina successiva"
        disabled={page >= count}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
}
