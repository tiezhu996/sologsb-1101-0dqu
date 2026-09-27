import { defineStore } from 'pinia'
import { computed } from 'vue'
import { db } from '@/utils/db'
import { useIdbTable } from '@/hooks/useIdbTable'
import { useHallStore } from '@/stores/hallStore'
import type { Decay } from '@/types/decay'
import type { Element } from '@/types/element'
import type { Hall } from '@/types/hall'
import type { PaintLayer } from '@/types/layer'
import { areaScore, isValidDateInput, priorityScore, type ScheduleEntry } from '@/types/schedule'

/** 排程页一行：未修复病害 + 层位/构件/殿宇 + 优先分与计划开工日 */
export interface ScheduleRow {
  decay: Decay
  layer: PaintLayer | null
  element: Element | null
  hall: Hall | null
  isOuterLayer: boolean
  areaScore: number
  score: number
  /** 殿宇内排名（按优先分），从 1 开始 */
  rank: number
  plannedStart: string | null
  schedule: ScheduleEntry | null
}

/** 殿宇分组：殿宇信息 + 其下排好序的待修病害 */
export interface ScheduleHallGroup {
  hallId: string
  hall: Hall
  rows: ScheduleRow[]
  /** 待修条数 */
  count: number
  /** 已排期条数 */
  scheduledCount: number
  /** 最早计划开工日（YYYY-MM-DD），无排期为 null */
  earliestStart: string | null
  /** 该殿宇最高优先分，用于殿宇之间排序 */
  topScore: number
}

/**
 * 处置排程 store：把各殿宇未修复病害按优先分排序，维护计划开工日期。
 */
export const useScheduleStore = defineStore('schedule', () => {
  const schedulesTable = useIdbTable<ScheduleEntry>((database) => database.schedules)
  const hallStore = useHallStore()

  const schedules = computed<ScheduleEntry[]>(() => schedulesTable.rows.value)

  /** 病害 id → 排程记录，仅保留计划开工日合法的条目 */
  const scheduleMap = computed<Map<string, ScheduleEntry>>(() => {
    const map = new Map<string, ScheduleEntry>()
    schedules.value.forEach((entry) => {
      if (isValidDateInput(entry.plannedStart)) map.set(entry.decayId, entry)
    })
    return map
  })

  /** 全部未修复病害的排程行（不区分殿宇筛选），已按优先分 / 面积排好序 */
  const allRows = computed<ScheduleRow[]>(() => {
    const layerMap = new Map<string, PaintLayer>()
    hallStore.layers.forEach((layer) => layerMap.set(layer.id, layer))
    const elementMap = new Map<string, Element>()
    hallStore.elements.forEach((element) => elementMap.set(element.id, element))
    const hallMap = new Map<string, Hall>()
    hallStore.halls.forEach((hall) => hallMap.set(hall.id, hall))

    const rows: ScheduleRow[] = hallStore.decays
      .filter((decay) => !decay.repaired)
      .map((decay) => {
        const layer = layerMap.get(decay.layerId) ?? null
        const element = layer ? elementMap.get(layer.elementId) ?? null : null
        const hall = element ? hallMap.get(element.hallId) ?? null : null
        const isOuterLayer = layer?.level === 1
        const schedule = scheduleMap.value.get(decay.id) ?? null
        return {
          decay,
          layer,
          element,
          hall,
          isOuterLayer,
          areaScore: areaScore(decay.areaCm2),
          score: priorityScore({ severity: decay.severity, areaCm2: decay.areaCm2, isOuterLayer }),
          rank: 0,
          plannedStart: schedule?.plannedStart ?? null,
          schedule
        }
      })

    rows.sort(compareRows)
    return rows
  })

  /** 按殿宇归组的排程结果 */
  const groups = computed<ScheduleHallGroup[]>(() => {
    const grouped = new Map<string, ScheduleRow[]>()
    allRows.value.forEach((row) => {
      if (!row.hall) return
      const list = grouped.get(row.hall.id) ?? []
      list.push({ ...row })
      grouped.set(row.hall.id, list)
    })

    const result: ScheduleHallGroup[] = []
    grouped.forEach((rows, hallId) => {
      rows.sort(compareRows)
      rows.forEach((row, index) => {
        row.rank = index + 1
      })
      const plannedDates = rows.map((row) => row.plannedStart).filter((value): value is string => value !== null)
      result.push({
        hallId,
        hall: rows[0].hall as Hall,
        rows,
        count: rows.length,
        scheduledCount: plannedDates.length,
        earliestStart: plannedDates.length > 0 ? [...plannedDates].sort()[0] : null,
        topScore: rows[0].score
      })
    })

    result.sort((a, b) => {
      if (b.topScore !== a.topScore) return b.topScore - a.topScore
      if (b.count !== a.count) return b.count - a.count
      return a.hall.name.localeCompare(b.hall.name, 'zh-Hans-CN')
    })
    return result
  })

  const totalUnrepaired = computed(() => allRows.value.length)
  const totalScheduled = computed(
    () => allRows.value.filter((row) => row.plannedStart !== null).length
  )
  const totalUnscheduled = computed(() => totalUnrepaired.value - totalScheduled.value)
  const hallCount = computed(() => groups.value.length)

  /** 全部待修病害中最早的计划开工日 */
  const earliestStart = computed(() => {
    const dates = allRows.value.map((row) => row.plannedStart).filter((value): value is string => value !== null)
    return dates.length > 0 ? [...dates].sort()[0] : null
  })

  function scheduleOf(decayId: string): ScheduleEntry | null {
    return scheduleMap.value.get(decayId) ?? null
  }

  /**
   * 填写 / 修改 / 清空计划开工日期。
   * date 为空字符串或 null 时删除该病害的排程记录。
   */
  async function setPlannedStart(decayId: string, date: string | null): Promise<void> {
    const normalized = date && isValidDateInput(date) ? date : null
    if (normalized) {
      const now = Date.now()
      const existing = scheduleMap.value.get(decayId)
      const record: ScheduleEntry = {
        id: decayId,
        decayId,
        plannedStart: normalized,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      }
      await db.schedules.put(record)
    } else {
      await db.schedules.delete(decayId)
    }
  }

  return {
    schedules,
    allRows,
    groups,
    totalUnrepaired,
    totalScheduled,
    totalUnscheduled,
    hallCount,
    earliestStart,
    scheduleOf,
    setPlannedStart
  }
})

/** 优先分高者在前；同分按面积降序，仍同则按创建时间与 id 兜底，保证顺序稳定 */
function compareRows(a: ScheduleRow, b: ScheduleRow): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.decay.areaCm2 !== a.decay.areaCm2) return b.decay.areaCm2 - a.decay.areaCm2
  if (b.decay.createdAt !== a.decay.createdAt) return b.decay.createdAt - a.decay.createdAt
  return a.decay.id.localeCompare(b.decay.id)
}
