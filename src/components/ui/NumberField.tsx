import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  style?: React.CSSProperties;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  /** Value to fall back to on blur when the field is left empty/unparseable. Defaults to 0. */
  fallback?: number;
  /** Parse keystrokes with parseInt instead of parseFloat (e.g. Lots, day counts). */
  integer?: boolean;
}

// Displayed text is decoupled from the committed value so mid-typing states
// (e.g. "1.") aren't clobbered by re-stringifying `value` on every render.
export function NumberField({
  value,
  onChange,
  className,
  style,
  step,
  min,
  max,
  placeholder,
  fallback = 0,
  integer = false,
}: Props) {
  const [text, setText] = useState(() => String(value));
  const isFocused = useRef(false);

  // Sync from parent when the field isn't actively being edited (e.g. a
  // strategy template load, or another field driving this one).
  useEffect(() => {
    if (!isFocused.current) setText(String(value));
  }, [value]);

  const parse = integer ? parseInt : parseFloat;

  return (
    <input
      type="number"
      className={className}
      style={style}
      value={text}
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      onFocus={(e) => {
        isFocused.current = true;
        e.target.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === '') return;
        const n = parse(raw);
        if (!Number.isNaN(n)) onChange(n);
      }}
      onBlur={(e) => {
        isFocused.current = false;
        const raw = e.target.value;
        const n = parse(raw);
        const finalValue = raw.trim() === '' || Number.isNaN(n) ? fallback : n;
        setText(String(finalValue));
        if (finalValue !== value) onChange(finalValue);
      }}
    />
  );
}
