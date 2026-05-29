import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Box, IconButton, Tooltip, Divider } from '@mui/material';
import {
  FormatBold, FormatItalic, StrikethroughS,
  FormatListBulleted, FormatListNumbered, FormatQuote,
  Undo, Redo,
} from '@mui/icons-material';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

const btnSx = (active) => ({
  minWidth: 26, height: 26, p: 0, borderRadius: 0.75,
  color: active ? 'primary.main' : 'text.secondary',
  bgcolor: active ? 'action.selected' : 'transparent',
  '&:hover': { bgcolor: 'action.hover' },
});

/**
 * TipTapEditor — shared rich text editor component.
 *
 * Props:
 *   content     {string}   Initial HTML content. Changes after mount are synced
 *                          via useEffect (safe to update externally e.g. from AI).
 *   onChange    {fn}       Called with HTML string on every content change.
 *   placeholder {string}   Placeholder text shown when editor is empty.
 *   minHeight   {number|string}  Min-height of the editable area (px or CSS string).
 *   fontSize    {string}   CSS font-size for the editor body.
 *
 * Ref API (via forwardRef):
 *   setContent(html)  — programmatically set content without firing onChange.
 *   getText()         — return plain-text representation of current content.
 */
const TipTapEditor = forwardRef(function TipTapEditor(
  {
    content = '',
    onChange,
    placeholder = 'Start writing…',
    minHeight = 80,
    fontSize = '0.875rem',
  },
  ref,
) {
  const settingFromProp = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: content || '',
    onUpdate: ({ editor: e }) => {
      // Guard against onUpdate firing during editor teardown or after unmount
      if (settingFromProp.current || e.isDestroyed || !isMounted.current) return;
      onChange?.(e.getHTML());
    },
  });

  // Expose imperative API for parent components (e.g. RephraseTool apply)
  useImperativeHandle(ref, () => ({
    setContent: (html) => {
      if (!editor) return;
      settingFromProp.current = true;
      editor.commands.setContent(html || '');
      requestAnimationFrame(() => { settingFromProp.current = false; });
    },
    getText: () => editor?.getText() ?? '',
  }), [editor]);

  // Sync when content prop changes externally (e.g. RephraseTool onApply)
  const lastContent = useRef(content);
  useEffect(() => {
    if (!editor || content === lastContent.current) return;
    lastContent.current = content;
    if (editor.getHTML() !== content) {
      settingFromProp.current = true;
      editor.commands.setContent(content || '');
      requestAnimationFrame(() => { settingFromProp.current = false; });
    }
  }, [editor, content]);

  if (!editor) return null;

  const toolbarItems = [
    { icon: <FormatBold fontSize="inherit" />,        cmd: () => editor.chain().focus().toggleBold().run(),         active: editor.isActive('bold'),        title: 'Bold (Ctrl+B)' },
    { icon: <FormatItalic fontSize="inherit" />,      cmd: () => editor.chain().focus().toggleItalic().run(),       active: editor.isActive('italic'),      title: 'Italic (Ctrl+I)' },
    { icon: <StrikethroughS fontSize="inherit" />,    cmd: () => editor.chain().focus().toggleStrike().run(),       active: editor.isActive('strike'),      title: 'Strikethrough' },
    null,
    { icon: <FormatListBulleted fontSize="inherit" />, cmd: () => editor.chain().focus().toggleBulletList().run(),  active: editor.isActive('bulletList'),  title: 'Bullet list' },
    { icon: <FormatListNumbered fontSize="inherit" />, cmd: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList'), title: 'Numbered list' },
    { icon: <FormatQuote fontSize="inherit" />,        cmd: () => editor.chain().focus().toggleBlockquote().run(),  active: editor.isActive('blockquote'), title: 'Blockquote' },
    null,
    { icon: <Undo fontSize="inherit" />, cmd: () => editor.chain().focus().undo().run(), active: false, title: 'Undo (Ctrl+Z)', disabled: !editor.can().undo() },
    { icon: <Redo fontSize="inherit" />, cmd: () => editor.chain().focus().redo().run(), active: false, title: 'Redo (Ctrl+Y)', disabled: !editor.can().redo() },
  ];

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        overflow: 'hidden',
        '& .tiptap': {
          outline: 'none',
          p: '10px 12px',
          minHeight,
          fontSize,
          lineHeight: 1.7,
          color: 'text.primary',
          '& p': { m: 0, mb: '4px' },
          '& ul, & ol': { pl: '24px', m: 0, mb: '4px' },
          '& li': { mb: '2px' },
          '& blockquote': {
            borderLeft: '3px solid',
            borderColor: 'primary.light',
            pl: '10px',
            color: 'text.secondary',
            m: 0,
            mb: '4px',
            fontStyle: 'italic',
          },
          '& p.is-editor-empty:first-of-type::before': {
            content: 'attr(data-placeholder)',
            color: 'text.disabled',
            pointerEvents: 'none',
            float: 'left',
            height: 0,
          },
        },
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.25,
          px: 0.75, py: 0.5,
          borderBottom: '1px solid', borderColor: 'divider',
          bgcolor: 'action.hover',
        }}
      >
        {toolbarItems.map((item, i) =>
          item === null
            ? <Divider key={i} orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            : (
              <Tooltip key={i} title={item.title} placement="top">
                <span>
                  <IconButton
                    size="small"
                    onMouseDown={e => { e.preventDefault(); item.cmd(); }}
                    disabled={item.disabled}
                    sx={btnSx(item.active)}
                  >
                    {item.icon}
                  </IconButton>
                </span>
              </Tooltip>
            )
        )}
      </Box>
      {/* Editable area */}
      <EditorContent editor={editor} />
    </Box>
  );
});

export default TipTapEditor;
