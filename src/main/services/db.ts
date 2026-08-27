/** v0.7 SQLite 统计库（node:sqlite）：提醒送达/确认记录 + 成就解锁记录
 *  表结构：
 *   - reminders(id, type, delivered_at, acked_at)：每次提醒送达插入一行，确认时回填 acked_at
 *   - achievements(id, name, description, progress, unlocked_at)：成就解锁记录（含进度）
 */
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { getStoreDir } from './store'

export type ReminderKind = 'water' | 'sedentary'

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(join(getStoreDir(), 'pet-stats.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      delivered_at INTEGER NOT NULL,
      acked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_type_time ON reminders(type, delivered_at);
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      progress INTEGER NOT NULL DEFAULT 0,
      unlocked_at INTEGER
    );
  `)
  return db
}

/** 记录一次提醒送达（统计口径：送达即计入），返回行 id */
export function recordReminderDelivered(type: ReminderKind): number {
  const r = getDb().prepare('INSERT INTO reminders (type, delivered_at) VALUES (?, ?)').run(type, Date.now())
  return Number(r.lastInsertRowid)
}

/** 确认最近一条该类型的未确认提醒（回填 acked_at），返回是否命中 */
export function ackLatestReminder(type: ReminderKind): boolean {
  const r = getDb()
    .prepare(
      `UPDATE reminders SET acked_at = ?
       WHERE id = (SELECT id FROM reminders WHERE type = ? AND acked_at IS NULL ORDER BY delivered_at DESC LIMIT 1)`
    )
    .run(Date.now(), type)
  return Number(r.changes) > 0
}

/** 今日（本地时区）指定类型的送达/确认计数 */
export function reminderStatsToday(type: ReminderKind): { delivered: number; acked: number } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS delivered,
              COALESCE(SUM(CASE WHEN acked_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS acked
       FROM reminders WHERE type = ? AND delivered_at >= ?`
    )
    .get(type, start.getTime()) as { delivered: number; acked: number } | undefined
  return { delivered: Number(row?.delivered ?? 0), acked: Number(row?.acked ?? 0) }
}

function localDay(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 连续“提醒全确认”天数：从今日（或最近有记录的一天）向前，每天均有送达且全部确认才累计 */
export function consecutiveFullAckDays(): number {
  const rows = getDb()
    .prepare(
      `SELECT date(delivered_at / 1000, 'unixepoch', 'localtime') AS day,
              COUNT(*) AS delivered,
              COALESCE(SUM(CASE WHEN acked_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS acked
       FROM reminders GROUP BY day ORDER BY day DESC LIMIT 60`
    )
    .all() as Array<{ day: string; delivered: number; acked: number }>
  const byDay = new Map(rows.map((r) => [r.day, r]))
  const today = byDay.get(localDay(new Date()))
  let streak = 0
  let startFrom = 0
  // 今日已有送达但尚未全部确认时，不打断历史连续（从昨日开始数）
  if (today && today.delivered > 0 && today.delivered === today.acked) {
    streak = 1
  }
  if (!today || today.delivered === 0 || today.delivered > today.acked) startFrom = 1
  for (let i = startFrom; i < 60; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const r = byDay.get(localDay(d))
    if (r && r.delivered > 0 && r.delivered === r.acked) streak++
    else break
  }
  return streak
}

// ---------- 成就表 ----------

export interface AchievementRow {
  id: string
  name: string
  description: string
  progress: number
  unlocked_at: number | null
}

/** 读取全部成就行（未解锁的也含进度，供展示） */
export function listAchievementRows(): AchievementRow[] {
  return getDb()
    .prepare('SELECT id, name, description, progress, unlocked_at FROM achievements ORDER BY unlocked_at IS NULL, unlocked_at')
    .all() as unknown as AchievementRow[]
}

/** 已解锁列表（兼容旧 renderer 结构 { id, unlockedAt }） */
export function listUnlocked(): Array<{ id: string; unlockedAt: number }> {
  return (getDb().prepare('SELECT id, unlocked_at FROM achievements WHERE unlocked_at IS NOT NULL').all() as unknown as AchievementRow[]).map(
    (r) => ({ id: r.id, unlockedAt: Number(r.unlocked_at) })
  )
}

/** 从 electron-store 迁移历史解锁记录（一次性，INSERT OR IGNORE 幂等） */
export function migrateAchievementsFromStore(list: Array<{ id: string; unlockedAt?: number }>): void {
  if (!Array.isArray(list) || list.length === 0) return
  const stmt = getDb().prepare(
    'INSERT OR IGNORE INTO achievements (id, name, description, progress, unlocked_at) VALUES (?, ?, ?, 0, ?)'
  )
  for (const a of list) stmt.run(a.id, '', '', a.unlockedAt ?? Date.now())
}

/** 写入/更新一条成就（解锁时带 unlocked_at；进度更新不覆盖已解锁时间） */
export function upsertAchievement(a: { id: string; name?: string; description?: string; progress?: number; unlockedAt?: number }): void {
  getDb()
    .prepare(
      `INSERT INTO achievements (id, name, description, progress, unlocked_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = CASE WHEN excluded.name != '' THEN excluded.name ELSE achievements.name END,
         description = CASE WHEN excluded.description != '' THEN excluded.description ELSE achievements.description END,
         progress = MAX(achievements.progress, excluded.progress),
         unlocked_at = COALESCE(achievements.unlocked_at, excluded.unlocked_at)`
    )
    .run(a.id, a.name ?? '', a.description ?? '', a.progress ?? 0, a.unlockedAt ?? null)
}
