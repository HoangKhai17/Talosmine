import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './admin-table.module.css';

type AdminTableProps = {
  children: ReactNode;
  minWidth?: 'narrow' | 'standard' | 'wide' | 'content';
  presentation?: 'card' | 'plain';
};

export function AdminTable({
  children,
  minWidth = 'standard',
  presentation = 'card',
}: AdminTableProps) {
  const wrapperClassName =
    presentation === 'plain' ? `${styles.wrapper} ${styles.plain}` : styles.wrapper;
  const tableClassName = ['typeBodySmall', styles.table, styles[minWidth]]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClassName}>
      <table className={tableClassName}>{children}</table>
    </div>
  );
}

function classNames(...names: Array<string | undefined>) {
  return names.filter(Boolean).join(' ');
}

type CaptionProps = ComponentPropsWithoutRef<'caption'> & { unstyled?: boolean };

export function AdminTableCaption({ className, unstyled = false, ...props }: CaptionProps) {
  return (
    <caption className={classNames(unstyled ? undefined : styles.caption, className)} {...props} />
  );
}

type HeadCellProps = ComponentPropsWithoutRef<'th'> & { compact?: boolean };

export function AdminTableHeadCell({ className, compact = false, ...props }: HeadCellProps) {
  return (
    <th
      className={classNames(
        styles.cell,
        compact ? styles.compactCell : undefined,
        compact ? styles.compactHeadCell : styles.headCell,
        className,
      )}
      {...props}
    />
  );
}

type CellProps = ComponentPropsWithoutRef<'td'> & { compact?: boolean };

export function AdminTableCell({ className, compact = false, ...props }: CellProps) {
  return (
    <td
      className={classNames(styles.cell, compact ? styles.compactCell : undefined, className)}
      {...props}
    />
  );
}

export function AdminTableBodyRow({ className, ...props }: ComponentPropsWithoutRef<'tr'>) {
  return <tr className={classNames(styles.bodyRow, className)} {...props} />;
}
