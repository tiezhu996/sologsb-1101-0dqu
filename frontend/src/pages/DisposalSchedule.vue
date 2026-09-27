<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Calendar, Tools } from '@element-plus/icons-vue'
import EmptyPanel from '@/components/common/EmptyPanel.vue'
import SeverityTag from '@/components/common/SeverityTag.vue'
import StatBadge from '@/components/common/StatBadge.vue'
import { useHallStore } from '@/stores/hallStore'
import { useRepairStore } from '@/stores/repairStore'
import { useScheduleStore, type HallScheduleGroup, type ScheduleRow } from '@/stores/scheduleStore'
import type { ScheduleStatusFilter } from '@/types/schedule'
import { AREA_SCORE_TIERS, OUTER_LAYER_SCORE } from '@/utils/priority'
import { formatArea } from '@/utils/severity'
import { formatChineseDate, todayString } from '@/utils/date'

const router = useRouter()
const hallStore = useHallStore()
const repairStore = useRepairStore()
const scheduleStore = useScheduleStore()

const hallFilter = ref<string>('')
const statusFilter = ref<ScheduleStatusFilter>('all')

const hallOptions = computed(() =>
  hallStore.halls.map((hall) => ({ label: `${hall.name}（${hall.era}）`, value: hall.id }))
)

const visibleGroups = computed<HallScheduleGroup[]>(() =>
  scheduleStore.groups
    .filter((group) => (hallFilter.value ? group.hall.id === hallFilter.value : true))
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => {
        if (statusFilter.value === 'scheduled') return row.plannedStart !== null
        if (statusFilter.value === 'unscheduled') return row.plannedStart === null
        return true
      })
    }))
    .filter((group) => group.rows.length > 0)
)

const visibleCount = computed(() => visibleGroups.value.reduce((sum, group) => sum + group.rows.length, 0))

/** 优先分构成提示（悬浮在分数上） */
const scoreTip = `优先分 = 严重程度（轻 10 / 中 20 / 重 30）+ 面积分档（<100cm² 5 / <1000cm² 10 / ≥1000cm² 20）+ 最外层（第 1 层）${OUTER_LAYER_SCORE} 分；分高优先，同分按面积降序`

function scoreClass(row: ScheduleRow): string {
  if (row.parts.total >= 50) return 'is-danger'
  if (row.parts.total >= 30) return 'is-warning'
  return 'is-default'
}

function rowSubtitle(row: ScheduleRow): string {
  const layerText = row.layer ? `第 ${row.layer.level} 层 · ${row.layer.patternName}/${row.layer.pigment}` : '层位已删除'
  const elementText = row.element ? `${row.element.name}（${row.element.position}）` : '构件已删除'
  return `${elementText} · ${layerText} · ${formatArea(row.decay.areaCm2)}`
}

function areaTierLabel(row: ScheduleRow): string {
  const area = row.decay.areaCm2
  const hit = AREA_SCORE_TIERS.find((tier) => area < tier.maxCm2Exclusive) ?? AREA_SCORE_TIERS[AREA_SCORE_TIERS.length - 1]
  return hit.label
}

function hallDateText(group: HallScheduleGroup): string {
  return group.earliestStart ? formatChineseDate(group.earliestStart) : '未排期'
}

function rowDateText(row: ScheduleRow): string {
  return row.plannedStart ? formatChineseDate(row.plannedStart) : '未排期'
}

async function onDateUpdate(row: ScheduleRow, value: string | number | null): Promise<void> {
  await scheduleStore.setPlannedStart(row.decayId, typeof value === 'string' ? value : null)
}

function goRepair(row: ScheduleRow): void {
  repairStore.setActiveDecay(row.decayId)
  void router.push('/repair')
}

const statusOptions: Array<{ label: string; value: ScheduleStatusFilter }> = [
  { label: '全部', value: 'all' },
  { label: '已排期', value: 'scheduled' },
  { label: '未排期', value: 'unscheduled' }
]

const minDate = todayString()
</script>

<template>
  <div>
    <div class="page-title">
      <div>
        <h2>处置排程</h2>
        <p>
          按殿宇汇总未修复病害，依据严重程度、面积与最外层位置算出优先分；分高的先动手，同分按面积降序。
        </p>
      </div>
      <div class="page-title__actions">
        <el-button :icon="Tools" @click="router.push('/repair')">前往修复工序</el-button>
      </div>
    </div>

    <div class="stat-row">
      <StatBadge label="待修病害" :value="scheduleStore.totalUnrepaired" suffix="条" icon="WarningFilled" tone="danger" />
      <StatBadge label="已排期" :value="scheduleStore.totalScheduled" suffix="条" icon="Calendar" tone="primary" />
      <StatBadge label="未排期" :value="scheduleStore.totalUnscheduled" suffix="条" icon="Clock" tone="warning" />
      <StatBadge label="涉及殿宇" :value="scheduleStore.groups.length" suffix="处" icon="OfficeBuilding" tone="info" />
      <StatBadge
        label="最早开工日"
        :value="scheduleStore.earliestStart ? formatChineseDate(scheduleStore.earliestStart) : '未排期'"
        icon="Calendar"
        tone="success"
      />
    </div>

    <div class="section-card toolbar">
      <span class="toolbar__label">殿宇</span>
      <el-select v-model="hallFilter" clearable placeholder="全部殿宇" class="toolbar__select">
        <el-option v-for="item in hallOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>

      <span class="toolbar__label">排期状态</span>
      <el-radio-group v-model="statusFilter" size="small">
        <el-radio-button v-for="item in statusOptions" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button>
      </el-radio-group>

      <el-tooltip :content="scoreTip" placement="top" effect="light">
        <el-tag type="info" effect="plain" round>优先分如何计算？</el-tag>
      </el-tooltip>

      <span class="muted toolbar__count">当前显示 {{ visibleCount }} 条</span>
    </div>

    <div v-if="visibleGroups.length > 0" class="hall-list">
      <article v-for="group in visibleGroups" :key="group.hall.id" class="hall-card">
        <header class="hall-card__head">
          <div class="hall-card__title">
            <h3>{{ group.hall.name }}</h3>
            <span class="muted">{{ group.hall.era }} · {{ group.hall.structureType }} · {{ group.hall.roofType }}</span>
          </div>
          <div class="hall-card__meta">
            <el-tag type="danger" effect="plain" round>待修 {{ group.totalCount }} 条</el-tag>
            <el-tag type="primary" effect="plain" round>已排 {{ group.scheduledCount }} 条</el-tag>
            <el-tag v-if="group.unscheduledCount > 0" type="warning" effect="plain" round>
              未排 {{ group.unscheduledCount }} 条
            </el-tag>
            <span class="hall-card__date" :class="{ 'is-empty': !group.earliestStart }">
              <el-icon><Calendar /></el-icon>
              最早开工：{{ hallDateText(group) }}
            </span>
          </div>
        </header>

        <ol class="row-list">
          <li v-for="(row, index) in group.rows" :key="row.decayId" class="row-card">
            <div class="row-card__rank mono">{{ index + 1 }}</div>
            <div class="row-card__score" :class="scoreClass(row)">
              <span class="row-card__score-value">{{ row.parts.total }}</span>
              <span class="row-card__score-label">优先分</span>
            </div>
            <div class="row-card__body">
              <div class="row-card__title">
                <el-tag size="small" effect="plain">{{ row.decay.type }}</el-tag>
                <SeverityTag :severity="row.decay.severity" size="small" plain />
                <strong>{{ row.element?.name ?? '构件已删除' }}</strong>
                <el-tag v-if="row.layer?.level === 1" size="small" type="danger" effect="dark" round>最外层</el-tag>
              </div>
              <p class="muted row-card__sub">{{ rowSubtitle(row) }}</p>
              <div class="row-card__parts">
                <span>程度 {{ row.parts.severity }}</span>
                <span>面积 {{ row.parts.area }}（{{ areaTierLabel(row) }}）</span>
                <span>外层 {{ row.parts.outer }}</span>
                <span class="muted">成因：{{ row.decay.causeGuess || '待现场复核' }}</span>
              </div>
            </div>
            <div class="row-card__schedule">
              <span class="row-card__date-text" :class="{ 'is-empty': !row.plannedStart }">{{ rowDateText(row) }}</span>
              <el-date-picker
                :model-value="row.plannedStart"
                type="date"
                size="small"
                value-format="YYYY-MM-DD"
                format="YYYY-MM-DD"
                :clearable="true"
                :default-value="row.plannedStart ?? minDate"
                placeholder="选择计划开工日"
                class="row-card__picker"
                @update:model-value="(value: string | number | null) => onDateUpdate(row, value)"
              />
            </div>
            <div class="row-card__actions">
              <el-button size="small" text :icon="Tools" @click="goRepair(row)">排工序</el-button>
            </div>
          </li>
        </ol>
      </article>
    </div>

    <div v-else class="section-card">
      <EmptyPanel
        :title="scheduleStore.totalUnrepaired === 0 ? '暂无未修复病害' : '当前筛选下没有待排病害'"
        :description="
          scheduleStore.totalUnrepaired === 0
            ? '各殿宇病害均已修复。新登记的病害会自动出现在这里，按优先分排定处置先后。'
            : '可切换殿宇或排期状态筛选条件。'
        "
        :action-text="scheduleStore.totalUnrepaired === 0 ? '查看病害档案台' : ''"
        @action="router.push('/decays')"
      />
    </div>
  </div>
</template>

<style scoped>
.page-title__actions {
  display: flex;
  gap: 8px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.toolbar__label {
  font-size: 13px;
  color: #6b6257;
}

.toolbar__select {
  width: 220px;
}

.toolbar__count {
  margin-left: auto;
  font-size: 12px;
}

.hall-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.hall-card {
  padding: 16px 18px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-left: 4px solid #8a5a2b;
  border-radius: 12px;
}

.hall-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px dashed #ddd3c2;
}

.hall-card__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
}

.hall-card__title h3 {
  margin: 0;
  font-size: 17px;
}

.hall-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.hall-card__date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #1e8449;
}

.hall-card__date.is-empty {
  color: #b06b00;
}

.row-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.row-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: #fbf9f5;
  border: 1px solid #ece5d8;
  border-radius: 10px;
}

.row-card__rank {
  width: 28px;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: #b09a76;
}

.row-card__score {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 10px;
  color: #fff;
  flex-shrink: 0;
}

.row-card__score.is-danger {
  background: #c0392b;
}

.row-card__score.is-warning {
  background: #d68910;
}

.row-card__score.is-default {
  background: #8a5a2b;
}

.row-card__score-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.row-card__score-label {
  font-size: 11px;
  opacity: 0.9;
}

.row-card__body {
  flex: 1;
  min-width: 0;
}

.row-card__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.row-card__sub {
  margin: 4px 0 0;
  font-size: 12px;
}

.row-card__parts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
  font-size: 12px;
  color: #6b6257;
  font-variant-numeric: tabular-nums;
}

.row-card__schedule {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.row-card__date-text {
  font-size: 13px;
  font-weight: 600;
  color: #1e8449;
}

.row-card__date-text.is-empty {
  color: #b06b00;
}

.row-card__picker {
  width: 168px;
}

.row-card__actions {
  flex-shrink: 0;
}
</style>
