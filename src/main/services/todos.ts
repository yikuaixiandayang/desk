/** 待办清单服务（本地技能，秘书核心小功能） */
import { randomUUID } from 'node:crypto'
import type { TodoItem } from '@shared/types'
import { get as storeGet, set as storeSet } from './store'

export function listTodos(): TodoItem[] {
  return storeGet('todos') ?? []
}

function save(items: TodoItem[]): void {
  storeSet('todos', items)
}

export function addTodo(text: string): TodoItem {
  const item: TodoItem = { id: randomUUID(), text, done: false, ts: Date.now() }
  save([...listTodos(), item])
  return item
}

export function toggleTodo(id: string, done?: boolean): TodoItem | null {
  const items = listTodos()
  const item = items.find((t) => t.id === id)
  if (!item) return null
  item.done = done ?? !item.done
  save(items)
  return item
}

export function clearDone(): number {
  const before = listTodos().length
  save(listTodos().filter((t) => !t.done))
  return before - listTodos().length
}
