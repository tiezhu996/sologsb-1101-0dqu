import { SEVERITY_WEIGHT } from '@/utils/severity'
import type { Decay } from '@/types/decay'

/** 面积分档阈值（平方厘米）与分值：≤100 得 5 分，≤1000 得 10 分，>1000 得 20 分 */
export const AREA_SCORE_TIERS: ReadonlyArray<{ maxCm2Exclusive: number; score: number; label: string }> = [
  { maxCm2Exclusive: 100, score: 5, label: '小面积' },
  { maxCm2Exclusive: 1000, score: 10, label: '中面积' },
  { maxCm2Exclusive: Number.POSITIVE_INFINITY, score: 20, label: '大面积' }
]

/** 最外层（由外至内第 1 层）位置加分 */
export const OUTER_LAYER_SCORE = 10

export function areaScore(areaCm2: number): { score: number; label: string } {
  const area = Number.isFinite(areaCm2) ? areaCm2 : 0
  const hit = AREA_SCORE_TIERS.find((tier) => area < tier.maxCm2Exclusive) ?? AREA_SCORE_TIERS[AREA_SCORE_TIERS.length - 1]
  return { score: hit.score, label: hit.label }
}

export interface PriorityParts {
  /** 严重程度分：轻度 10 / 中度 20 / 重度 30 */
  severity: number
  /** 面积分：5 / 10 / 20 */
  area: number
  /** 最外层位置分：第 1 层 10，其余层位 0 */
  outer: number
  /** 合计优先分 */
  total: number
}

/**
 * 处置优先分 = 严重程度 + 面积分档 + 最外层位置加分。
 * layerLevel 缺省（层位记录缺失）时不记位置分。
 */
export function priorityParts(decay: Pick<Decay, 'severity' | 'areaCm2'>, layerLevel?: number | null): PriorityParts {
  const severity = SEVERITY_WEIGHT[decay.severity]
  const area = areaScore(decay.areaCm2).score
  const outer = layerLevel === 1 ? OUTER_LAYER_SCORE : 0
  return { severity, area, outer, total: severity + area + outer }
}

/** 排程排序：优先分降序，同分按面积降序；仍相同再按病害 id 稳定排序 */
export function comparePriority(
  a: { parts: PriorityParts; areaCm2: number; decayId: string },
  b: { parts: PriorityParts; areaCm2: number; decayId: string }
): number {
  const diff = b.parts.total - a.parts.total
  if (diff !== 0) return diff
  const areaDiff = b.areaCm2 - a.areaCm2
  if (areaDiff !== 0) return areaDiff
  return a.decayId.localeCompare(b.decayId)
}
