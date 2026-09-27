<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Coin, InfoFilled, Tools } from '@element-plus/icons-vue'
import EmptyPanel from '@/components/common/EmptyPanel.vue'
import SeverityTag from '@/components/common/SeverityTag.vue'
import StatBadge from '@/components/common/StatBadge.vue'
import { useHallStore } from '@/stores/hallStore'
import { useRepairStore } from '@/stores/repairStore'
import { useScheduleStore, type ScheduleHallGroup, type ScheduleRow } from '@/stores/scheduleStore'
import { formatArea, SEVERITY_WEIGHT } from '@/utils/severity'
import { AREA_SCORE_CAP, AREA_UNIT_CM2, OUTER_LAYER_BONUS } from '@/types/schedule'

const router = useRouter()
const hallStore = useHallStore()
const repairStore = useRepairStore()
const scheduleStore = useScheduleStore()

const hallFilter = ref<string>('')
const onlyUnscheduled = ref(false)

const hallOptions = computed(() =>
  hallStore.halls.map((hall) => ({ label: `${hall.name}（${hall.era}）`, value: hall.id }))
)

/** 按页头筛选后的殿宇分组 */
const visibleGroups = computed<ScheduleHallGroup[]>(() => {
  return scheduleStore.groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => {
        if (hallFilter.value && group.hallId !== hallFilter.value) return false
        if (onlyUnscheduled.value && row.plannedStart !== null) return false
        return true
      })
    }))
    .filter((group) => {
      if (hallFilter.value && group.hallId !== hallFilter.value) return false
      return group.rows.length > 0
    })
})

const visibleCount = computed(() => visibleGroups.value.reduce((sum, group) => sum + group.rows.length, 0))

function scoreBreakdown(row: ScheduleRow): string {
  const parts = [`严重程度 ${SEVERITY_WEIGHT[row.decay.severity]}`, `面积 ${row.areaScore}`]
  if (row.isOuterLayer) parts.push(`最外层 ${OUTER_LAYER_BONUS}`)
  return `${parts.join(' + ')} = ${row.score}`
}

function layerText(row: ScheduleRow): string {
  if (!row.layer) return '层位已删除'
  return `第 ${row.layer.level} 层 · ${row.layer.patternName} · ${row.layer.pigment}`
}

async function changeDate(row: ScheduleRow, value: string | null): Promise<void> {
  await scheduleStore.setPlannedStart(row.decay.id, value)
  if (value) {
    ElMessage.success(`已安排 ${value} 开工`)
  } else {
    ElMessage.info('已清空排期，该病害回到未排期')
  }
}

function goRepair(row: ScheduleRow): void {
  repairStore.setActiveDecay(row.decay.id)
  void router.push('/repair')
}

function hallSubtitle(group: ScheduleHallGroup): string {
  const { hall } = group
  return `${hall.era} · ${hall.structureType} · ${hall.roofType}`
}
</script>

<template>
  <div>
    <div class="page-title">
      <div>
        <h2>处置排程</h2>
        <p>
          共 {{ scheduleStore.totalUnrepaired }} 条未修复病害，已排期 {{ scheduleStore.totalScheduled }} 条、未排期
          {{ scheduleStore.totalUnscheduled }} 条；殿宇内按优先分从高到低排列。
        </p>
      </div>
      <div class="page-title__actions">
        <el-button :icon="Coin" @click="router.push('/backup')">导出备份</el-button>
        <el-button type="primary" :icon="Tools" @click="router.push('/repair')">前往修复工序</el-button>
      </div>
    </div>

    <div class="stat-row">
      <StatBadge label="待修病害" :value="scheduleStore.totalUnrepaired" suffix="条" icon="WarningFilled" tone="warning" />
      <StatBadge label="已排期" :value="scheduleStore.totalScheduled" suffix="条" icon="Calendar" tone="success" />
      <StatBadge label="未排期" :value="scheduleStore.totalUnscheduled" suffix="条" icon="Clock" tone="danger" />
      <StatBadge label="涉及殿宇" :value="scheduleStore.hallCount" suffix="处" icon="OfficeBuilding" tone="info" />
      <StatBadge
        label="最早开工日"
        :value="scheduleStore.earliestStart ?? '未排期'"
        icon="Timer"
        tone="primary"
      />
    </div>

    <div class="section-card formula">
      <el-icon class="formula__icon"><InfoFilled /></el-icon>
      <div class="formula__body">
        <strong>优先分算法</strong>
        <span>
          优先分 = 严重程度分（重度 {{ SEVERITY_WEIGHT['重度'] }} / 中度 {{ SEVERITY_WEIGHT['中度'] }} / 轻度
          {{ SEVERITY_WEIGHT['轻度'] }}）＋ 面积分（每 {{ AREA_UNIT_CM2 }} cm² 计 1 分，封顶
          {{ AREA_SCORE_CAP }} 分）＋ 最外层加分（病害位于第 1 层彩画加 {{ OUTER_LAYER_BONUS }} 分）。
        </span>
        <span class="muted">分数高者先动手，同分按病害面积降序；修复完成的病害自动移出本页。</span>
      </div>
    </div>

    <div class="section-card toolbar">
      <span class="toolbar__label">殿宇</span>
      <el-select v-model="hallFilter" clearable placeholder="全部殿宇" class="toolbar__select">
        <el-option v-for="item in hallOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-radio-group
        :model-value="onlyUnscheduled ? 'open' : 'all'"
        size="small"
        @update:model-value="(value: string | number | boolean | undefined) => (onlyUnscheduled = value === 'open')"
      >
        <el-radio-button value="all">全部待修</el-radio-button>
        <el-radio-button value="open">仅未排期</el-radio-button>
      </el-radio-group>
      <el-tag type="info" effect="plain" round>当前显示 {{ visibleGroups.length }} 座殿宇 / {{ visibleCount }} 条</el-tag>
    </div>

    <template v-if="scheduleStore.totalUnrepaired === 0">
      <div class="section-card">
        <EmptyPanel
          title="暂无未修复病害"
          description="各殿宇病害均已修复或尚未建档，无需排程。可前往病害档案台查看全部记录。"
          action-text="前往病害档案台"
          @action="router.push('/decays')"
        />
      </div>
    </template>

    <template v-else-if="visibleGroups.length === 0">
      <div class="section-card">
        <EmptyPanel
          title="当前筛选下没有待修病害"
          description="可切换殿宇，或取消「仅未排期」查看已排期的病害。"
          secondary-text="清空筛选"
          @secondary="
            () => {
              hallFilter = ''
              onlyUnscheduled = false
            }
          "
        />
      </div>
    </template>

    <section v-for="group in visibleGroups" :key="group.hallId" class="hall-block">
      <header class="hall-block__head">
        <div class="hall-block__title">
          <h3>{{ group.hall.name }}</h3>
          <span class="muted hall-block__sub">{{ hallSubtitle(group) }}</span>
        </div>
        <div class="hall-block__meta">
          <el-tag type="warning" effect="plain" round>还有 {{ group.count }} 条待修</el-tag>
          <el-tag type="success" effect="plain" round>已排 {{ group.scheduledCount }} 条</el-tag>
          <el-tag
            :type="group.earliestStart ? 'primary' : 'info'"
            round
            class="hall-block__date"
          >
            最早开工：{{ group.earliestStart ?? '未排期' }}
          </el-tag>
        </div>
      </header>

      <el-table :data="group.rows" row-key="decay.id" class="hall-block__table">
        <el-table-column label="序" width="56" align="center">
          <template #default="{ row }">
            <span class="rank mono" :class="{ 'rank--top': row.rank === 1 }">{{ row.rank }}</span>
          </template>
        </el-table-column>
        <el-table-column label="优先分" width="110" align="center">
          <template #default="{ row }">
            <el-tooltip :content="scoreBreakdown(row)" placement="top">
              <span class="score mono" :class="`score--${row.decay.severity}`">{{ row.score }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="病害" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.decay.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="严重程度" width="150">
          <template #default="{ row }">
            <SeverityTag :severity="row.decay.severity" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="面积" width="100">
          <template #default="{ row }">
            <span class="mono">{{ formatArea(row.decay.areaCm2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="构件（部位）" min-width="170">
          <template #default="{ row }">{{ row.element ? `${row.element.name}（${row.element.position}）` : '构件已删除' }}</template>
        </el-table-column>
        <el-table-column label="彩画层位" min-width="190">
          <template #default="{ row }">
            <span>{{ layerText(row) }}</span>
            <el-tag v-if="row.isOuterLayer" size="small" type="danger" effect="dark" round class="outer-tag">最外层</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="成因初判" prop="decay.causeGuess" min-width="180" show-overflow-tooltip />
        <el-table-column label="计划开工日期" width="180">
          <template #default="{ row }">
            <el-date-picker
              :model-value="row.plannedStart"
              type="date"
              size="small"
              value-format="YYYY-MM-DD"
              placeholder="选择开工日"
              clearable
              class="date-picker"
              @change="(value: string | null) => changeDate(row, value)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" :icon="Tools" @click="goRepair(row)">排工序</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.page-title__actions {
  display: flex;
  gap: 8px;
}

.formula {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #faf7f1;
  border-color: #ddd3c2;
}

.formula__icon {
  margin-top: 3px;
  color: #8a5a2b;
  font-size: 16px;
}

.formula__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  line-height: 1.7;
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
  width: 200px;
}

.hall-block {
  padding: 14px 16px 8px;
  margin-bottom: 16px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-left: 4px solid #8a5a2b;
  border-radius: 12px;
}

.hall-block__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.hall-block__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
}

.hall-block__title h3 {
  margin: 0;
  font-size: 16px;
}

.hall-block__sub {
  font-size: 12px;
}

.hall-block__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.hall-block__date {
  font-variant-numeric: tabular-nums;
}

.rank {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #efe7d8;
  color: #6b6257;
  font-size: 12px;
  font-weight: 700;
}

.rank--top {
  background: #8a5a2b;
  color: #fff;
}

.score {
  display: inline-block;
  min-width: 42px;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

.score--重度 {
  background: #c0392b;
}

.score--中度 {
  background: #d68910;
}

.score--轻度 {
  background: #1e8449;
}

.outer-tag {
  margin-left: 6px;
}

.date-picker {
  width: 150px;
}
</style>
