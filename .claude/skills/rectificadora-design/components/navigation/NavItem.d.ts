import React from 'react';
export interface NavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  active?: boolean;
  children?: React.ReactNode;
}
export function NavItem(props: NavItemProps): JSX.Element;
