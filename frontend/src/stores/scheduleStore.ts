import { defineStore } from 'pinia'
import { computed } from 'vue'
import { db, createId } from '@/utils/db'
import { useIdbTable } from '@/hooks/useIdbTable'
import { useHallStore } from '@/stores/hallStore'
import type { Hall } from '@/types/hall'
import type { Element } from '@/types/element'
import type { PaintLayer } from '@/types/layer'
import type { ScheduleEntry, ScheduleStatusFilter } from '@/types/schedule'
import { comparePriority, priorityParts, type PriorityParts } from '@/utils/priority'
import { normalizeDateString } from '@/utils/date'

/** 排程页一行：未修复病害 + 层位 / 构件 / 殿宇归属 + 优先分 + 排期 */
export interface ScheduleRow {
  decayId: string
  decay: import('@/types/decay').Decay
  layer: PaintLayer | null
  element: Element | null
  hallId: string | null
  hallName: string
  parts: PriorityParts
  plannedStart: string | null
}

/** 殿宇排程分组：标题所需的待修条数、已排条数与最早开工日 */
export interface HallScheduleGroup {
  hall: Hall
  rows: ScheduleRow[]
  totalCount: number
  scheduledCount: number
  unscheduledCount: number
  earliestStart: string | null
  /** 组内最高优先分，用于殿宇之间排序 */
  topScore: number
}

/**
 * 处置排程 store：汇总各殿宇未修复病害，按优先分（严重程度 + 面积 + 最外层位置）排定先后，
 * 并维护每条病害的计划开工日期（schedules 表，与档案一起本地存储与备份）。
 */
export const useScheduleStore = defineStore('schedule', () => {
  const schedulesTable = useIdbTable<ScheduleEntry>((database) => database.schedules)
  const hallStore = useHallStore()

  const entries = computed<ScheduleEntry[]>(() => schedulesTable.rows.value)

  /** decayId → 排期记录 */
  const entryByDecay = computed<Map<string, ScheduleEntry>>(() => {
    const map = new Map<string, ScheduleEntry>()
    entries.value.forEach((entry) => map.set(entry.decayId, entry))
    return map
  })

  /** 未修复病害展开行（含层位、构件、殿宇、优先分与排期） */
  const rows = computed<ScheduleRow[]>(() => {
    const layerMap = new Map<string, PaintLayer>()
    hallStore.layers.forEach((layer) => layerMap.set(layer.id, layer))
    const elementMap = new Map<string, Element>()
    hallStore.elements.forEach((element) => elementMap.set(element.id, element))

    return hallStore.decays
      .filter((decay) => !decay.repaired)
      .map((decay) => {
        const layer = layerMap.get(decay.layerId) ?? null
        const element = layer ? elementMap.get(layer.elementId) ?? null : null
        const hallId = element?.hallId ?? null
        const entry = entryByDecay.value.get(decay.id)
        return {
          decayId: decay.id,
          decay,
          layer,
          element,
          hallId,
          hallName: hallId ? hallStore.hallById(hallId)?.name ?? '殿宇已删除' : '殿宇已删除',
          parts: priorityParts(decay, layer?.level ?? null),
          plannedStart: entry?.plannedStart ?? null
        }
      })
  })

  /** 按殿宇分组后的排程；组内按优先分降序、同分面积降序 */
  const groups = computed<HallScheduleGroup[]>(() => {
    const grouped = new Map<string, ScheduleRow[]>()
    rows.value.forEach((row) => {
      if (!row.hallId) return
      const list = grouped.get(row.hallId) ?? []
      list.push(row)
      grouped.set(row.hallId, list)
    })

    const result: HallScheduleGroup[] = []
    grouped.forEach((list, hallId) => {
      const hall = hallStore.hallById(hallId)
      if (!hall) return
      const sorted = [...list].sort((a, b) =>
        comparePriority({ parts: a.parts, areaCm2: a.decay.areaCm2, decayId: a.decayId }, { parts: b.parts, areaCm2: b.decay.areaCm2, decayId: b.decayId })
      )
      const starts = sorted.map((row) => row.plannedStart).filter((value): value is string => Boolean(value)).sort()
      result.push({
        hall,
        rows: sorted,
        totalCount: sorted.length,
        scheduledCount: starts.length,
        unscheduledCount: sorted.length - starts.length,
        earliestStart: starts[0] ?? null,
        topScore: sorted[0]?.parts.total ?? 0
      })
    })

    // 殿宇顺序：组内最高优先分降序 → 最早开工日升序（未排期殿宇垫底）→ 殿宇名
    return result.sort((a, b) => {
      if (b.topScore !== a.topScore) return b.topScore - a.topScore
      if (a.earliestStart && b.earliestStart) {
        const diff = a.earliestStart.localeCompare(b.earliestStart)
        if (diff !== 0) return diff
      } else if (a.earliestStart || b.earliestStart) {
        return a.earliestStart ? -1 : 1
      }
      return a.hall.name.localeCompare(b.hall.name, 'zh-Hans-CN')
    })
  })

  const totalUnrepaired = computed(() => rows.value.length)
  const totalScheduled = computed(() => rows.value.filter((row) => row.plannedStart !== null).length)
  const totalUnscheduled = computed(() => totalUnrepaired.value - totalScheduled.value)
  /** 全部殿宇中最早的计划开工日 */
  const earliestStart = computed<string | null>(() => {
    const starts = rows.value.map((row) => row.plannedStart).filter((value): value is string => Boolean(value)).sort()
    return starts[0] ?? null
  })

  function entryOfDecay(decayId: string): ScheduleEntry | undefined {
    return entryByDecay.value.get(decayId)
  }

  /** 填写或修改计划开工日；date 为空表示清除排期（删除排程记录） */
  async function setPlannedStart(decayId: string, date: string | null): Promise<void> {
    const normalized = date ? normalizeDateString(date) : ''
    const existing = await db.schedules.where('decayId').equals(decayId).first()
    if (!normalized) {
      if (existing) await db.schedules.delete(existing.id)
      return
    }
    if (existing) {
      await db.schedules.update(existing.id, { plannedStart: normalized, updatedAt: Date.now() })
      return
    }
    const now = Date.now()
    await db.schedules.put({
      id: createId('sched'),
      decayId,
      plannedStart: normalized,
      createdAt: now,
      updatedAt: now
    })
  }

  /** 殿宇 / 构件 / 层位 / 病害级联删除时清理对应排程 */
  async function removeByDecayIds(decayIds: string[]): Promise<void> {
    if (decayIds.length === 0) return
    await db.schedules.where('decayId').anyOf(decayIds).delete()
  }

  return {
    entries,
    rows,
    groups,
    totalUnrepaired,
    totalScheduled,
    totalUnscheduled,
    earliestStart,
    entryOfDecay,
    setPlannedStart,
    removeByDecayIds
  }
})

/** 排程页本地筛选项（仅页面态，不入库） */
export interface SchedulePageFilter {
  hallId: string
  status: ScheduleStatusFilter
}
