import { type NewsItem } from '@/lib/api';

interface Props {
  items: NewsItem[];
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = diff / 3_600_000;
    if (hours < 1) return `${Math.round(diff / 60_000)}m ago`;
    if (hours < 24) return `${Math.round(hours)}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  } catch {
    return dateStr;
  }
}

export default function NewsCard({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-4 text-center">No recent news found.</div>
    );
  }

  return (
    <ul className="divide-y divide-gray-50 space-y-0">
      {items.map((item, i) => (
        <li key={i} className="py-3 first:pt-0 last:pb-0">
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <p className="text-sm font-medium text-gray-800 group-hover:text-blue-600 transition-colors line-clamp-2">
              {item.title}
            </p>
            <div className="flex gap-2 items-center mt-1">
              <span className="text-xs text-gray-400">{item.source}</span>
              {item.pubDate && (
                <>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400">{timeAgo(item.pubDate)}</span>
                </>
              )}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
