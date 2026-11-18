import { useEffect, useRef } from 'react';

// Six boxes for a one-time code. Supports typing, backspace, arrow keys, pasting the whole
// code, and phones auto-filling it from the email (autocomplete="one-time-code").
export default function OtpInput({ value, onChange, onComplete, disabled, autoFocus = true, label }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function setAt(index, chars) {
    const next = digits.slice();
    let i = index;
    for (const ch of chars.replace(/\D/g, '')) {
      if (i > 5) break;
      next[i++] = ch;
    }
    const code = next.join('');
    onChange(code);
    refs.current[Math.min(i, 5)]?.focus();
    if (code.length === 6 && !next.includes('')) onComplete?.(code);
  }

  function onKeyDown(e, i) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = digits.slice();
      if (next[i]) next[i] = '';
      else if (i > 0) {
        next[i - 1] = '';
        refs.current[i - 1]?.focus();
      }
      onChange(next.join(''));
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  }

  return (
    <div className="otp" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className={`otp-box ${d ? 'filled' : ''}`}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? 6 : 1}
          value={d}
          disabled={disabled}
          aria-label={`${label} ${i + 1}`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            // A full code at once = phone auto-fill; otherwise keep just the newest digit.
            if (v.length >= 6) setAt(0, v);
            else setAt(i, v.slice(-1));
          }}
          onPaste={(e) => {
            e.preventDefault();
            setAt(0, e.clipboardData.getData('text'));
          }}
          onKeyDown={(e) => onKeyDown(e, i)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
