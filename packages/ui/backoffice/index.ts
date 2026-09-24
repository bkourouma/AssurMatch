/**
 * Shared back-office design system (admin + courtier).
 *
 * Constitution guard-rail: nothing here carries a route table, an access policy or surface-specific
 * wording. Every label, every href and every server action is supplied by the app that renders the
 * component, so the two back-offices stay separate applications that only share a look.
 */

export { Icon, iconNames } from "./icons";
export type { IconName, IconProps } from "./icons";

export { Logo } from "./logo";
export type { LogoProps } from "./logo";

export { Button } from "./button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./button";

export { Badge, StatusBadge, STATUS_TONES } from "./badge";
export type { BadgeProps, StatusBadgeProps, Tone } from "./badge";

export { Notice, StateMessage } from "./notice";
export type { NoticeProps, NoticeTone } from "./notice";

export { EmptyState } from "./empty-state";
export type { EmptyStateProps } from "./empty-state";

export { PageHeader } from "./page-header";
export type { BreadcrumbItem, PageHeaderProps } from "./page-header";

export { Card } from "./card";
export type { CardProps } from "./card";

export { KpiCard } from "./kpi-card";
export type { KpiCardProps, KpiTrend } from "./kpi-card";

export { DescriptionList } from "./description-list";
export type { DescriptionItem, DescriptionListProps } from "./description-list";

export { Cluster, Grid, PageStack, Split, Stack } from "./layout";
export type { BlockProps, GridProps } from "./layout";

export { DataTable, paginateItems, readTableParams, sortItems } from "./data-table";
export type {
  ColumnAlign,
  DataTableColumn,
  DataTableProps,
  ReadTableParamsOptions,
  SortDirection,
  TablePagination,
  TableParams,
  TableSearchParams,
  TableSort
} from "./data-table";

export { FilterBar } from "./filter-bar";
export type { FilterBarProps } from "./filter-bar";

export { Tabs } from "./tabs";
export type { TabItem, TabsProps } from "./tabs";

export { ConfirmDialog } from "./confirm-dialog";
export type { ConfirmDialogProps } from "./confirm-dialog";

export { Skeleton } from "./skeleton";
export type { SkeletonProps } from "./skeleton";

export { Field, fieldControlProps } from "./form/field";
export type { FieldProps } from "./form/field";

export { Checkbox, CheckboxGroup, Input, InputGroup, RadioGroup, Select, Textarea } from "./form/controls";
export type {
  CheckboxGroupProps,
  CheckboxProps,
  ChoiceOption,
  InputGroupProps,
  InputProps,
  RadioGroupProps,
  SelectOption,
  SelectProps,
  TextareaProps
} from "./form/controls";

export { Switch } from "./form/switch";
export type { SwitchProps } from "./form/switch";

export { Form, FormActions, FormRow, FormSection } from "./form/form";
export type { FormActionsProps, FormProps, FormRowProps, FormSectionProps } from "./form/form";

export { ActionNotice } from "./form/action-notice";
export type { ActionNoticeProps, ActionState } from "./form/action-notice";

export { AppShell } from "./shell/app-shell";
export type { AppShellBrand, AppShellProps, AppShellUser } from "./shell/app-shell";

export { UserMenu } from "./shell/user-menu";
// Server-safe helper: a surface layout (a server component) computes the avatar initials.
export { initialsOf } from "./shell/initials";
export type { UserMenuProps } from "./shell/user-menu";

export { AuthShell } from "./shell/auth-shell";
export type { AuthShellProps } from "./shell/auth-shell";

export { findActive, isActive, titleForPath } from "./shell/navigation";
export type { ActiveNavigation, NavChild, NavGroup, NavItem } from "./shell/navigation";
