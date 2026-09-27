/** 处置排期：一条病害对应一条排期记录（仅当已填计划开工日期时存在） */
export interface ScheduleEntry {
  id: string
  /** 对应病害记录 id，一一对应 */
  decayId: string
  /** 计划开工日期，本地日历日，格式 YYYY-MM-DD */
  plannedStart: string
  createdAt: number
  updatedAt: number
}

/** 排程页面的筛选条件 */
export type ScheduleStatusFilter = 'all' | 'scheduled' | 'unscheduled'
