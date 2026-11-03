import assert from 'node:assert/strict'

// Observe the rendered notification, independent of its styling implementation.
export async function assertCompactToast(window, js, type) {
  const metrics = await js(
    window,
    `(() => {
    const toast = document.querySelector('[data-sonner-toast][data-type=${type}]');
    const rect = toast.getBoundingClientRect();
    const style = getComputedStyle(toast);
    const canvas = document.createElement('canvas').getContext('2d');
    canvas.fillStyle = style.color;
    canvas.fillRect(0, 0, 1, 1);
    return {
      width: rect.width, height: rect.height, left: rect.left, right: rect.right,
      viewport: innerWidth, color: Array.from(canvas.getImageData(0, 0, 1, 1).data),
      icon: Boolean(toast.querySelector('svg')), text: toast.textContent
    };
  })()`
  )
  assert.ok(metrics.width < 280, '短toast按内容收缩至280px以内')
  assert.ok(metrics.height >= 34 && metrics.height <= 38, '单行toast高度34～38px')
  assert.ok(metrics.left >= 16 && metrics.right <= metrics.viewport - 16, 'toast在窗口内保留边距')
  const [red, green, blue] = metrics.color
  assert.ok(
    type === 'success' ? green > red && green > blue : red > green && red > blue,
    `${type}提示使用对应的语义颜色`
  )
  assert.ok(metrics.icon && metrics.text, '图标与文案共同表达结果')
}
