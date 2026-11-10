// Low stock alert level: each product can set its own; otherwise the default applies.
export const DEFAULT_ALERT = 5;
// SQL for a product row aliased `p`.
export const ALERT_SQL = `COALESCE(p.low_stock_alert, ${DEFAULT_ALERT})`;
