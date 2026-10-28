import { screen } from 'electron'
import type { BrowserWindow, Rectangle } from 'electron'
import type { DesktopState, DockEdge, WindowSettings } from '../../shared/contracts'
import { readPreferences, writePreferences } from './preferences'
import { isOuterEdge, nearbyEdge, snapBounds, visibleBounds } from './note-geometry'

export class NoteController {
  private readonly preferences
  private freePinned: boolean
  private edge: DockEdge | null
  private expanded: Rectangle
  private collapsed = false
  private interaction = false
  private protections = 0
  private menuOpen = false
  private awaitingEntry = true
  private insideSince = 0
  private outsideSince = 0
  private applying = false
  private dragging = false
  private dragTimer?: ReturnType<typeof setInterval>
  private dragBounds?: Rectangle
  private readonly timer: ReturnType<typeof setInterval>

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
    window.on('moved', this.moved)
    window.on('resized', this.moved)
    window.on('blur', () => {
      this.setDragging(false)
    })
    screen.on('display-added', this.recover)
    screen.on('display-removed', this.recover)
    screen.on('display-metrics-changed', this.recover)
    this.timer = setInterval(() => this.trackPointer(), 50)
  }

  state(): Omit<DesktopState, 'exitPending'> {
    return {
      settings: { ...this.preferences.settings },
      pinned: this.edge !== null || this.freePinned,
      edge: this.edge,
      collapsed: this.collapsed
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
    this.applying = true
    try {
      let bounds = this.expanded
      if (this.collapsed && this.edge) {
        bounds =
          this.edge === 'top'
            ? { ...bounds, width: 72, height: 32, y: bounds.y - 26 }
            : {
                ...bounds,
                width: 32,
                height: 72,
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
      if (!this.collapsed && !this.dragging) {
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

  private readonly moved = () => {
    if (this.applying || this.dragging || this.collapsed || this.window.isDestroyed()) return
    const bounds = this.window.getBounds()
    if (this.dragBounds) {
      bounds.width = this.dragBounds.width
      bounds.height = this.dragBounds.height
    }
    if (JSON.stringify(bounds) === JSON.stringify(this.expanded)) {
      this.dragging = false
      return
    }
    this.expanded = bounds
    const display = screen.getDisplayMatching(bounds)
    this.edge = this.preferences.settings.edgeAutoHide
      ? nearbyEdge(bounds, display, screen.getAllDisplays())
      : null
    if (this.edge) this.expanded = snapBounds(bounds, display, this.edge)
    this.dragging = false
    this.awaitingEntry = true
    this.insideSince = this.outsideSince = 0
    this.apply()
    this.persist()
  }

  readonly recover = () => {
    if (this.window.isDestroyed()) return
    this.setDragging(false)
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

  show(focus = true) {
    this.collapsed = false
    this.awaitingEntry = true
    this.insideSince = this.outsideSince = 0
    this.apply()
    if (this.window.isMinimized()) this.window.restore()
    if (focus) {
      this.window.show()
      this.window.focus()
    } else this.window.showInactive()
  }

  hide() {
    if (!this.collapsed) this.moved()
    this.collapsed = false
    this.apply()
    this.window.hide()
  }

  togglePin() {
    if (this.edge) return
    this.freePinned = !this.freePinned
    this.apply()
  }

  updateSettings(settings: WindowSettings) {
    writePreferences(this.directory, { ...this.preferences, settings })
    if (settings.defaultAlwaysOnTop !== this.preferences.settings.defaultAlwaysOnTop)
      this.freePinned = settings.defaultAlwaysOnTop
    this.preferences.settings = { ...settings }
    if (!settings.edgeAutoHide) {
      this.edge = null
      this.collapsed = false
      this.persist()
    }
    this.apply()
  }

  setDragging(active: boolean) {
    if (active === this.dragging || this.collapsed || this.window.isDestroyed()) return
    this.dragging = active
    if (active) {
      const origin = screen.getCursorScreenPoint()
      const bounds = this.window.getBounds()
      const [width, height] = this.window.getContentSize()
      bounds.width = width
      bounds.height = height
      this.dragBounds = bounds
      // Windows分数缩放下，移动会对外接矩形取整；锁定内容尺寸，避免逐帧累积变大。
      this.window.setMinimumSize(bounds.width, bounds.height)
      this.window.setMaximumSize(bounds.width, bounds.height)
      let previous = origin
      this.dragTimer = setInterval(() => {
        const point = screen.getCursorScreenPoint()
        if (point.x === previous.x && point.y === previous.y) return
        previous = point
        this.window.setBounds({
          ...bounds,
          x: bounds.x + point.x - origin.x,
          y: bounds.y + point.y - origin.y
        })
      }, 16)
    } else {
      clearInterval(this.dragTimer)
      this.dragTimer = undefined
      this.moved()
      this.dragBounds = undefined
      this.window.setMaximumSize(0, 0)
      this.window.setMinimumSize(
        Math.min(334, this.expanded.width),
        Math.min(260, this.expanded.height)
      )
    }
  }

  setInteraction(active: boolean) {
    this.interaction = active
    this.outsideSince = 0
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
    if (!this.edge || !this.window.isVisible() || this.dragging) return
    const point = screen.getCursorScreenPoint()
    const bounds = this.window.getBounds()
    const inside =
      point.x >= bounds.x &&
      point.x < bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y < bounds.y + bounds.height
    const now = Date.now()
    if (inside) {
      this.awaitingEntry = false
      this.outsideSince = 0
      this.insideSince ||= now
      if (this.collapsed && now - this.insideSince >= 200) {
        this.collapsed = false
        this.apply()
        this.window.showInactive()
      }
    } else {
      this.insideSince = 0
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
      if (now - this.outsideSince >= 600) {
        this.collapsed = true
        this.apply()
      }
    }
  }

  dispose() {
    clearInterval(this.timer)
    clearInterval(this.dragTimer)
    screen.removeListener('display-added', this.recover)
    screen.removeListener('display-removed', this.recover)
    screen.removeListener('display-metrics-changed', this.recover)
    this.window.removeListener('moved', this.moved)
    this.window.removeListener('resized', this.moved)
    this.persist()
  }
}
