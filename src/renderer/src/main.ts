import { PetApp } from './app'

// 全局错误边界：捕获未处理异常，避免渲染进程崩溃
window.addEventListener('error', (ev) => {
  console.error('[pet] 全局异常:', ev.error ?? ev.message)
})
window.addEventListener('unhandledrejection', (ev) => {
  console.error('[pet] 未处理 Promise 拒绝:', ev.reason)
})

window.addEventListener('DOMContentLoaded', () => {
  const pet = window.pet
  if (!pet) {
    console.error('[pet] 预加载桥不可用（window.pet 未定义）')
    return
  }
  const app = new PetApp(pet)
  app.init().catch((err) => {
    console.error('[pet] 初始化失败', err)
  })
})
