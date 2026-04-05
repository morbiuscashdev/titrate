import { useState, useCallback, useRef, useEffect } from 'react';

export type InlineEditProps = {
  readonly value: string;
  readonly onSave: (newValue: string) => void;
  readonly className?: string;
};

/**
 * Text that becomes an editable input on double-click.
 * Saves on Enter or blur, cancels on Escape.
 */
export function InlineEdit({ value, onSave, className = '' }: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    setIsEditing(false);
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') handleSave();
      if (event.key === 'Escape') {
        setDraft(value);
        setIsEditing(false);
      }
    },
    [handleSave, value],
  );

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-gray-800 border border-blue-500 rounded px-1 py-0 text-gray-900 dark:text-white outline-none ${className}`}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(value);
        setIsEditing(true);
      }}
      className={`cursor-text ${className}`}
      title="Double-click to rename"
    >
      {value}
    </span>
  );
}
