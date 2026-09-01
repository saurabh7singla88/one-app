import { Box, Typography } from '@mui/material';

// ── Inline renderer: **bold** and <u>underline</u> ────────────────────────────
function renderInline(text, keyBase) {
  const regex = /(\*\*(?:[^*]|\*(?!\*))+\*\*|<u>[\s\S]*?<\/u>)/g;
  const parts = [];
  let lastIdx = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={`${keyBase}-b${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<u key={`${keyBase}-u${i++}`}>{token.slice(3, -4)}</u>);
    }
    lastIdx = match.index + token.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length ? parts : [text];
}

// ── HTML renderer (TipTap-generated content) ──────────────────────────────────
function RichHtml({ html, sx }) {
  return (
    <Box
      sx={{
        color: 'text.primary',
        fontSize: '0.875rem',
        lineHeight: 1.75,
        '& p': { m: 0, mb: 0.5 },
        '& ol, & ul': { pl: '1.4em', m: 0, mb: 0.5 },
        '& li': { mb: 0.25 },
        '& li > p': { m: 0 },
        '& strong': { fontWeight: 700 },
        '& em': { fontStyle: 'italic' },
        '& code': { fontFamily: 'monospace', fontSize: '0.82em', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 },
        ...sx,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── Block renderer ─────────────────────────────────────────────────────────────
export default function RichText({ text = '', sx = {} }) {
  if (!text) return null;

  // TipTap saves HTML; fall through to HTML renderer when detected
  if (text.trimStart().startsWith('<')) return <RichHtml html={text} sx={sx} />;

  const lines = text.split('\n');
  const elements = [];
  let ulBuffer = [];
  let olBuffer = [];
  let k = 0;

  const flushUl = () => {
    if (ulBuffer.length) {
      elements.push(
        <ul key={`ul-${k++}`} style={{ margin: '2px 0 4px', paddingLeft: 22 }}>
          {ulBuffer}
        </ul>
      );
      ulBuffer = [];
    }
  };
  const flushOl = () => {
    if (olBuffer.length) {
      elements.push(
        <ol key={`ol-${k++}`} style={{ margin: '2px 0 4px', paddingLeft: 22 }}>
          {olBuffer}
        </ol>
      );
      olBuffer = [];
    }
  };

  lines.forEach((line, i) => {
    if (/^-\s/.test(line)) {
      flushOl();
      ulBuffer.push(<li key={`uli-${i}`} style={{ fontSize: '0.875rem', lineHeight: 1.7 }}>{renderInline(line.slice(2), `uli-${i}`)}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      flushUl();
      olBuffer.push(<li key={`oli-${i}`} style={{ fontSize: '0.875rem', lineHeight: 1.7 }}>{renderInline(line.replace(/^\d+\.\s/, ''), `oli-${i}`)}</li>);
    } else {
      flushUl();
      flushOl();
      if (line === '') {
        elements.push(<Box key={`sp-${k++}`} sx={{ height: 6 }} />);
      } else {
        elements.push(
          <Typography key={`p-${k++}`} variant="body2" component="p" sx={{ m: 0, mb: 0.25, lineHeight: 1.75 }}>
            {renderInline(line, `p-${i}`)}
          </Typography>
        );
      }
    }
  });
  flushUl();
  flushOl();

  return <Box sx={{ color: 'text.primary', ...sx }}>{elements}</Box>;
}

// ── Strip markup for plain-text previews ──────────────────────────────────────
export function stripMarkdown(text = '') {
  if (text.trimStart().startsWith('<')) {
    // Strip HTML tags and collapse whitespace for a clean preview
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/<u>(.*?)<\/u>/gs, '$1')
    .replace(/^-\s/gm, '')
    .replace(/^\d+\.\s/gm, '');
}
