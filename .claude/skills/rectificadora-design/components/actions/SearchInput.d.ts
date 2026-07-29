import React from 'react';
export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  placeholder?: string;
  /** Leading icon node (e.g. a Lucide search glyph). */
  icon?: React.ReactNode;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  width?: number | string;
}
export function SearchInput(props: SearchInputProps): JSX.Element;
