import brandImage from '../../../../resources/brand-mark.png'

const outline = Array.from({ length: 128 }, (_, index) => {
  const angle = (2 * Math.PI * index) / 128
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const x = 128 + 127 * Math.sign(cosine) * Math.pow(Math.abs(cosine), 2 / 3)
  const y = 128 + 127 * Math.sign(sine) * Math.pow(Math.abs(sine), 2 / 3)
  return `${x},${y}`
}).join(' ')

export function BrandMark() {
  return (
    <span className="brand-mark">
      <svg viewBox="0 0 256 256" role="img" aria-label="DOOK标识">
        <polygon points={outline} fill="var(--app-accent)" />
        {/* Compensate for the mark's upper transparent margin at the 32px display size. */}
        <image href={brandImage} x="10" y="2" width="236" height="236" />
      </svg>
    </span>
  )
}
