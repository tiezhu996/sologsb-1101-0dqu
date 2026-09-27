import type { Severity } from '@/types/decay'
import { SEVERITY_WEIGHT } from '@/utils/severity'

/**
 * 处置排程：给未修复病害排计划开工日期，按病害一一对应。
 */
export interface ScheduleEntry {
  /** 主键，与病害 id 一致，每条病害至多一条排程 */
  id: string
  /** 外键，冗余存放（与 id 相同）便于按病害检索与备份迁移 */
  decayId: string
  /** 计划开工日期，YYYY-MM-DD */
  plannedStart: string
  createdAt: number
  updatedAt: number
}

/** 面积计分：每 100 cm² 记 1 分，封顶 20 分，避免超大面积完全压过严重程度 */
export const AREA_UNIT_CM2 = 100
export const AREA_SCORE_CAP = 20

/** 病害位于最外层彩画层（level = 1）时的加分 */
export const OUTER_LAYER_BONUS = 10

/** 计算面积得分 */
export function areaScore(areaCm2: number): number {
  if (!Number.isFinite(areaCm2) || areaCm2 <= 0) return 0
  return Math.min(AREA_SCORE_CAP, Math.floor(areaCm2 / AREA_UNIT_CM2))
}

/**
 * 处置优先分：严重程度分 + 面积分 + 最外层位置加分。
 * 分数越高越应先动手；同分由调用方按面积降序等规则兜底。
 */
export function priorityScore(input: {
  severity: Severity
  areaCm2: number
  isOuterLayer: boolean
}): number {
  return (
    SEVERITY_WEIGHT[input.severity] +
    areaScore(input.areaCm2) +
    (input.isOuterLayer ? OUTER_LAYER_BONUS : 0)
  )
}

/** 把 Date / 时间戳格式化为日期选择器使用的 YYYY-MM-DD（本地时区） */
export function toDateInputValue(value: Date | number): string {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 判断 YYYY-MM-DD 是否为合法日期 */
export function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
