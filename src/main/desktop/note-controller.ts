import { screen } from 'electron'
import type { BrowserWindow, Rectangle } from 'electron'
import type { DesktopState, DockEdge, WindowSettings } from '../../shared/contracts'
import { readPreferences, writePreferences } from './preferences'
import { isOuterEdge, nearbyEdge, snapBounds, visibleBounds } from './note-geometry'

const AUTO_COLLAPSE_DELAY_MS = 3500

export class NoteController {
  private readonly preferences
  private freePinned: boolean
  private edge: DockEdge | null
  private expanded: Rectangle
  private collapsed = false
  private edgeRevealed = false
  private edgeCapsuleVisible = false
  private edgeRevealTarget = false
  private edgeRevealRevision = 0
  private awaitingCapsulePaint = false
  private revealTimer?: ReturnType<typeof setTimeout>
  private openingPreparation?: {
    revision: number
    complete: () => boolean
    timer: ReturnType<typeof setTimeout>
  }
  private noteMotion?: 'opening' | 'closing'
  private noteMotionRevision = 0
  private noteMotionSource: 'capsule' | 'strip' = 'strip'
  private motionTimer?: ReturnType<typeof setTimeout>
  private interaction = false
  private protections = 0
  private menuOpen = false
  private awaitingEntry = true
  private insideSince = 0
  private outsideSince = 0
  private trayKeepOpenUntil = 0
  private applying = false
  private nativeMoving = false
  private edgeDragMoved = false
  private dragTimer?: ReturnType<typeof setInterval>
  private edgeDrag?: {
    origin: { x: number; y: number }
    bounds: Rectangle
    area: Rectangle
    moved: boolean
  }
  private readonly timer: ReturnType<typeof setInterval>
  private disposed = false

  constructor(
    private readonly window: BrowserWindow,
    private readonly directory: string,
    private readonly changed: () => void
  ) {
    this.preferences = readPreferences(directory)
    this.freePinned = this.preferences.settings.defaultAlwaysOnTop
    this.edge = this.preferences.settings.edgeAutoHide ? this.preferences.edge : null
    const area = screen.getPrimaryDisplay().workArea
    this.expanded = {
      x: area.x + area.width - 354,
      y: area.y + 40,
      width: 334,
      height: 480,
      ...this.preferences.position
    }
    this.recover()
    window.on('will-move', this.willMove)
    window.on('moved', this.moved)
    window.on('resized', this.resized)
    window.on('blur', () => {
      this.setDragging(false)
    })
    screen.on('display-added', this.recover)
    screen.on('display-removed', this.recover)
    screen.on('display-metrics-changed', this.recover)
    this.timer = setInterval(() => this.trackPointer(), 50)
    window.once('closed', () => this.dispose())
  }

  state(): Omit<DesktopState, 'exitPending' | 'colorScheme' | 'systemAccentColor'> {
    return {
      settings: { ...this.preferences.settings },
      pinned: this.edge !== null || this.freePinned,
      edge: this.edge,
      collapsed: this.collapsed,
      edgeRevealed: this.edgeRevealed,
      edgeCapsuleVisible: this.edgeCapsuleVisible,
      edgeCapsulePreparing: this.edgeCapsuleVisible && this.edgeRevealTarget && !this.edgeRevealed,
      edgeOpening: Boolean(this.openingPreparation),
      edgeRevealRevision: this.openingPreparation?.revision ?? this.edgeRevealRevision,
      noteMotion: this.noteMotion,
      noteMotionRevision: this.noteMotionRevision,
      noteMotionSource: this.noteMotionSource
    }
  }

  private notify() {
    this.changed()
  }

  private persist() {
    this.preferences.position = { x: this.expanded.x, y: this.expanded.y }
    this.preferences.edge = this.edge
    try {
      writePreferences(this.directory, this.preferences)
    } catch (error) {
      console.error('保存便签位置失败：', error)
    }
  }

  private apply() {
    if (this.disposed || this.window.isDestroyed()) return
    this.applying = true
    try {
      let bounds = this.expanded
      if (this.collapsed && this.edge) {
        bounds =
          this.edgeCapsuleVisible && !this.awaitingCapsulePaint
            ? {
                ...bounds,
                width: this.edge === 'top' ? 76 : 64,
                height: this.edge === 'top' ? 64 : 76,
                x:
                  this.edge === 'right'
                    ? bounds.x + bounds.width - 56
                    : this.edge === 'left'
                      ? bounds.x - 8
                      : bounds.x + Math.round((bounds.width - 76) / 2),
                y: this.edge === 'top' ? bounds.y - 8 : bounds.y
              }
            : this.edge === 'top'
              ? {
                  ...bounds,
                  x: bounds.x + Math.round((bounds.width - 76) / 2),
                  width: 76,
                  height: 32,
                  y: bounds.y - 26
                }
              : {
                  ...bounds,
                  width: 32,
                  height: 76,
                  x: this.edge === 'right' ? bounds.x + bounds.width - 6 : bounds.x - 26
                }
      }
      this.window.setMinimumSize(
        this.collapsed ? 1 : Math.min(334, this.expanded.width),
        this.collapsed ? 1 : Math.min(260, this.expanded.height)
      )
      this.window.setResizable(!this.collapsed)
      if (!this.collapsed) {
        // Windows分数缩放下，展开时也锁定内容尺寸，避免外框取整多出1px。
        this.window.setMinimumSize(bounds.width, bounds.height)
        this.window.setMaximumSize(bounds.width, bounds.height)
      }
      this.window.setBounds(bounds)
      if (!this.collapsed) {
        this.window.setMaximumSize(0, 0)
        this.window.setMinimumSize(
          Math.min(334, this.expanded.width),
          Math.min(260, this.expanded.height)
        )
      }
      this.window.setAlwaysOnTop(this.edge !== null || this.freePinned)
    } finally {
      this.applying = false
    }
    this.notify()
  }

  private readonly willMove = () => {
    if (this.applying || this.collapsed || this.nativeMoving) return
    this.nativeMoving = true
    this.outsideSince = 0
    if (this.noteMotion) {
      this.cancelMotion()
      this.notify()
    }
  }

  private readonly resized = () => {
    if (!this.nativeMoving) this.commitBounds()
  }

  private readonly moved = () => {
    if (!this.nativeMoving) {
      this.commitBounds()
      return
    }
    // Windows在moved回调返回后才结束原生拖动，之后再校正外框尺寸。
    setImmediate(() => {
      if (this.nativeMoving) this.commitBounds()
    })
  }

  private commitBounds() {
    if (this.applying || this.collapsed || this.window.isDestroyed()) return
    const bounds = this.window.getBounds()
    const [width, height] = this.window.getContentSize()
    // 保留拖动前的内容尺寸，避免Windows分数缩放使窗口变大。
    bounds.width = this.nativeMoving ? this.expanded.width : width
    bounds.height = this.nativeMoving ? this.expanded.height : height
    this.nativeMoving = false
    if (
      width === bounds.width &&
      height === bounds.height &&
      JSON.stringify(bounds) === JSON.stringify(this.expanded)
    )
      return
    this.expanded = bounds
    const display = screen.getDisplayMatching(bounds)
    this.edge = this.preferences.settings.edgeAutoHide
      ? nearbyEdge(bounds, display, screen.getAllDisplays())
      : null
    if (this.edge) this.expanded = snapBounds(bounds, display, this.edge)
    this.awaitingEntry = true
    this.insideSince = this.outsideSince = 0
    this.apply()
    this.persist()
  }

  readonly recover = () => {
    if (this.window.isDestroyed()) return
    this.nativeMoving = false
    this.setDragging(false)
    this.cancelMotion()
    this.resetReveal()
    const display = screen.getDisplayMatching(this.expanded)
    this.expanded = visibleBounds(this.expanded, display)
    if (this.edge && !isOuterEdge(display, this.edge, this.expanded, screen.getAllDisplays()))
      this.edge = null
    if (!this.edge) this.collapsed = false
    if (this.edge) this.expanded = snapBounds(this.expanded, display, this.edge)
    // 调整隐藏窗口的坐标但不调用show，避免显示布局变化意外唤出窗口。
    this.apply()
    this.persist()
  }

  prepareOpening(complete: () => boolean) {
    if (this.openingPreparation) {
      this.openingPreparation.complete = complete
      return
    }
    if (!this.collapsed || !this.window.isVisible()) {
      complete()
      return
    }
    this.setDragging(false)
    clearTimeout(this.revealTimer)
    const revision = ++this.edgeRevealRevision
    this.openingPreparation = {
      revision,
      complete,
      timer: setTimeout(() => this.finishEdgePreparation(revision), 1000)
    }
    // 保留细条窗口原位，等渲染层绘制空帧后再展开。
    this.notify()
  }

  private cancelOpeningPreparation() {
    clearTimeout(this.openingPreparation?.timer)
    this.openingPreparation = undefined
  }

  show({ focus = true, fromTray = false } = {}) {
    this.cancelOpeningPreparation()
    const wasCollapsed = this.collapsed
    const source = this.edgeCapsuleVisible ? 'capsule' : 'strip'
    this.cancelMotion()
    this.setDragging(false)
    this.resetReveal()
    this.collapsed = false
    this.awaitingEntry = false
    this.insideSince = this.outsideSince = 0
    this.trayKeepOpenUntil = fromTray ? Date.now() + AUTO_COLLAPSE_DELAY_MS : 0
    if (wasCollapsed && this.edge) {
      this.startNoteMotion('opening', source)
    }
    this.apply()
    if (this.window.isMinimized()) this.window.restore()
    if (focus) {
      this.window.show()
      this.window.focus()
    } else this.window.showInactive()
  }

  hide() {
    this.cancelOpeningPreparation()
    this.cancelMotion()
    this.setDragging(false)
    this.resetReveal()
    if (!this.collapsed) this.commitBounds()
    this.collapsed = false
    this.apply()
    this.window.hide()
  }

  togglePin() {
    if (this.edge) return
    this.freePinned = !this.freePinned
    this.apply()
  }

  private cancelMotion() {
    clearTimeout(this.motionTimer)
    this.noteMotion = undefined
  }

  private startNoteMotion(phase: 'opening' | 'closing', source: 'capsule' | 'strip') {
    this.noteMotion = phase
    this.noteMotionSource = source
    const revision = ++this.noteMotionRevision
    // 渲染完成后握手收缩窗口；超时只作渲染异常时的恢复兜底。
    this.motionTimer = setTimeout(() => this.finishNoteMotion(revision), 1000)
  }

  finishNoteMotion(revision: number) {
    if (
      this.disposed ||
      this.window.isDestroyed() ||
      !this.noteMotion ||
      revision !== this.noteMotionRevision
    )
      return
    const closing = this.noteMotion === 'closing'
    this.cancelMotion()
    if (closing) {
      this.collapsed = true
      this.resetReveal()
      this.apply()
    } else {
      if (this.trayKeepOpenUntil) this.trayKeepOpenUntil = Date.now() + AUTO_COLLAPSE_DELAY_MS
      this.notify()
    }
  }

  private collapseNote() {
    if (this.collapsed || !this.edge || this.noteMotion) return
    this.startNoteMotion('closing', 'strip')
    this.notify()
  }

  private resetReveal() {
    clearTimeout(this.revealTimer)
    this.awaitingCapsulePaint = false
    this.edgeRevealRevision++
    this.edgeRevealed = this.edgeCapsuleVisible = this.edgeRevealTarget = false
  }

  finishEdgePreparation(revision: number) {
    if (this.disposed || this.window.isDestroyed()) return
    if (this.openingPreparation) {
      if (revision !== this.openingPreparation.revision) return
      const { complete } = this.openingPreparation
      this.cancelOpeningPreparation()
      if (!complete()) {
        this.resetReveal()
        this.apply()
      }
      return
    }
    if (!this.awaitingCapsulePaint || revision !== this.edgeRevealRevision || !this.collapsed)
      return
    clearTimeout(this.revealTimer)
    this.awaitingCapsulePaint = false
    this.apply()
    this.revealTimer = setTimeout(() => {
      this.edgeRevealed = true
      this.apply()
    }, 32)
  }

  private revealCapsule(reveal: boolean) {
    if (this.edgeRevealTarget === reveal) return
    clearTimeout(this.revealTimer)
    this.edgeRevealTarget = reveal
    if (reveal) {
      if (this.edgeCapsuleVisible) {
        this.edgeRevealed = true
        this.apply()
      } else {
        this.edgeCapsuleVisible = true
        this.edgeRevealed = false
        this.awaitingCapsulePaint = true
        this.edgeRevealRevision++
        // 保持细条窗口原位，等渲染层绘制隐藏帧后再扩大窗口。
        this.notify()
        this.revealTimer = setTimeout(() => {
          // 渲染无响应时恢复入口，避免永久停在空白准备状态。
          this.resetReveal()
          this.notify()
        }, 1000)
      }
    } else {
      this.edgeRevealed = false
      this.apply()
      // 退出推回屏幕边缘并淡出，完成后才恢复独立细条。
      this.revealTimer = setTimeout(() => {
        this.edgeCapsuleVisible = false
        this.apply()
      }, 220)
    }
  }

  updateSettings(settings: WindowSettings) {
    settings = {
      ...settings,
      locateTaskOnConvert:
        settings.showMultiDay &&
        (!this.preferences.settings.showMultiDay || settings.locateTaskOnConvert)
    }
    writePreferences(this.directory, { ...this.preferences, settings })
    if (settings.defaultAlwaysOnTop !== this.preferences.settings.defaultAlwaysOnTop)
      this.freePinned = settings.defaultAlwaysOnTop
    this.preferences.settings = { ...settings }
    if (!settings.edgeAutoHide) {
      this.cancelMotion()
      this.setDragging(false)
      this.resetReveal()
      this.edge = null
      this.collapsed = false
      this.persist()
    }
    this.apply()
  }

  setDragging(active: boolean) {
    if (this.window.isDestroyed()) return this.edgeDragMoved
    if (active) {
      if (this.edgeDrag || !this.collapsed || !this.edge) return false
      this.cancelMotion()
      this.edgeDragMoved = false
      this.edgeDrag = {
        origin: screen.getCursorScreenPoint(),
        bounds: { ...this.expanded },
        area: screen.getDisplayMatching(this.expanded).workArea,
        moved: false
      }
      this.dragTimer = setInterval(() => this.moveEdgeDrag(), 16)
      return false
    }
    if (this.edgeDrag) {
      this.moveEdgeDrag()
      this.edgeDragMoved = this.edgeDrag.moved
      clearInterval(this.dragTimer)
      this.dragTimer = undefined
      this.edgeDrag = undefined
      this.insideSince = this.outsideSince = 0
      this.persist()
    }
    return this.edgeDragMoved
  }

  private moveEdgeDrag() {
    if (this.disposed || this.window.isDestroyed() || !this.edgeDrag || !this.edge) return
    const { origin, bounds, area } = this.edgeDrag
    const point = screen.getCursorScreenPoint()
    const delta = this.edge === 'top' ? point.x - origin.x : point.y - origin.y
    if (!this.edgeDrag.moved && Math.abs(delta) < 4) return
    this.edgeDrag.moved = true
    const clamp = (value: number, start: number, length: number, size: number) =>
      Math.max(start, Math.min(value, start + Math.max(0, length - size)))
    const next =
      this.edge === 'top'
        ? { ...bounds, x: clamp(bounds.x + delta, area.x, area.width, bounds.width) }
        : { ...bounds, y: clamp(bounds.y + delta, area.y, area.height, bounds.height) }
    if (next.x === this.expanded.x && next.y === this.expanded.y) return
    this.expanded = next
    this.apply()
  }

  setInteraction(active: boolean) {
    this.interaction = active
    this.outsideSince = 0
    if (active && this.noteMotion === 'closing') {
      this.cancelMotion()
      this.notify()
    }
  }
  setMenuOpen(active: boolean) {
    this.menuOpen = active
    this.outsideSince = 0
  }

  async protect<T>(action: () => Promise<T>): Promise<T> {
    this.protections++
    this.outsideSince = 0
    try {
      return await action()
    } finally {
      this.protections--
      this.outsideSince = 0
    }
  }

  private trackPointer() {
    if (this.disposed || this.window.isDestroyed()) return
    if (
      !this.edge ||
      !this.window.isVisible() ||
      this.nativeMoving ||
      this.edgeDrag ||
      this.noteMotion
    )
      return
    if (this.awaitingCapsulePaint || this.openingPreparation) return
    const point = screen.getCursorScreenPoint()
    const bounds = this.window.getBounds()
    const hitBounds =
      this.collapsed && this.edgeCapsuleVisible
        ? {
            x: bounds.x + (this.edge === 'right' ? 28 : 8),
            y: bounds.y + 8,
            width: this.edge === 'top' ? 60 : 28,
            height: this.edge === 'top' ? 28 : 60
          }
        : this.collapsed
          ? this.edge === 'top'
            ? { x: bounds.x + 8, y: bounds.y + 26, width: 60, height: 6 }
            : {
                x: bounds.x + (this.edge === 'left' ? 26 : 0),
                y: bounds.y + 8,
                width: 6,
                height: 60
              }
          : bounds
    const inside =
      point.x >= hitBounds.x &&
      point.x < hitBounds.x + hitBounds.width &&
      point.y >= hitBounds.y &&
      point.y < hitBounds.y + hitBounds.height
    const now = Date.now()
    if (inside) {
      this.awaitingEntry = false
      this.outsideSince = 0
      this.insideSince ||= now
      if (this.collapsed) {
        this.revealCapsule(true)
      }
    } else {
      this.insideSince = 0
      if (this.collapsed) this.revealCapsule(false)
      if (
        this.awaitingEntry ||
        this.interaction ||
        this.protections ||
        this.menuOpen ||
        this.collapsed
      ) {
        this.outsideSince = 0
        return
      }
      this.outsideSince ||= now
      if (now >= this.trayKeepOpenUntil && now - this.outsideSince >= AUTO_COLLAPSE_DELAY_MS) {
        this.collapseNote()
      }
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.cancelOpeningPreparation()
    this.cancelMotion()
    this.resetReveal()
    clearInterval(this.timer)
    clearInterval(this.dragTimer)
    screen.removeListener('display-added', this.recover)
    screen.removeListener('display-removed', this.recover)
    screen.removeListener('display-metrics-changed', this.recover)
    this.window.removeListener('will-move', this.willMove)
    this.window.removeListener('moved', this.moved)
    this.window.removeListener('resized', this.resized)
    this.persist()
  }
}
