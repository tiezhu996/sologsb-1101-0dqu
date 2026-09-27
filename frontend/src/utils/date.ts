/**
 * 计划开工日统一用本地日历日字符串（YYYY-MM-DD）存取，
 * 避免 toISOString() 把本地零点转成前一天 UTC 的时区偏移。
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayString(): string {
  return toLocalDateString(new Date())
}

/** 今天起 offset 天后的本地日历日 */
export function offsetDateString(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return toLocalDateString(date)
}

/** 合法 YYYY-MM-DD 字符串原样返回，否则返回空串 */
export function normalizeDateString(value: unknown): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? value : ''
}

/** 中文回显：YYYY-MM-DD → YYYY年M月D日；输入非法返回空串 */
export function formatChineseDate(value: string): string {
  if (!normalizeDateString(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  return `${year}年${month}月${day}日`
}
