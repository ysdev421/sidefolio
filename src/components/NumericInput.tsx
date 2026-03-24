import type { InputHTMLAttributes } from 'react';

interface NumericInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** 整数のみ（小数点・e を不許可）*/
  integer?: boolean;
}

/** 数値専用 input。フォーカス時全選択・余計なキー入力をブロック */
export function NumericInput({ integer = false, onFocus, onKeyDown, className, readOnly, ...props }: NumericInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const blocked = ['e', 'E', '+', '-', ...(integer ? ['.', ','] : [])];
    if (blocked.includes(e.key)) e.preventDefault();
    onKeyDown?.(e);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!readOnly) e.target.select();
    onFocus?.(e);
  };

  return (
    <input
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      readOnly={readOnly}
      className={className ?? 'input-field'}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}
