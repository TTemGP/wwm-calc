import { beforeEach, describe, expect, it, vi } from "vitest"

const activeLocale = { current: "en" }

vi.mock("@/i18n", async importOriginal => {
  const actual = await importOriginal<typeof import("@/i18n")>()
  return { ...actual, getLocale: () => activeLocale.current }
})

const { deltaPrefix, formatNumber, formatThroughput, formatThroughputDelta, throughputDeltaClass } =
  await import("@/application/formatting")

const differences = [
  -12345.678, -1000, -8.575, -1.005, -0.5, -0.005, -0.004, -0.001, 0, 0.001, 0.004, 0.005, 0.5, 1.005, 8.575, 1000,
  9999.996, 10000, 12345.678,
]

function direction(text: string) {
  switch (text.charAt(0)) {
    case "+":
      return 1
    case "-":
      return -1
    default:
      return 0
  }
}

const directionByClass: Record<string, number> = {
  "throughput-neutral": 0,
  "damage-positive": 1,
  "damage-negative": -1,
  "healing-positive": 1,
  "healing-negative": -1,
}

const statedDirection = () => differences.map(difference => direction(formatThroughputDelta(difference)))
const colouredDirection = () =>
  differences.map(difference => directionByClass[throughputDeltaClass(difference, "damage")])

beforeEach(() => {
  activeLocale.current = "en"
})

describe("grouping a magnitude", () => {
  it("writes a number short enough to count at a glance without a separator", () => {
    expect(formatThroughput(1000)).toBe("1000.00")
    expect(formatThroughput(999)).toBe("999.00")
    expect(formatThroughput(9999.99)).toBe("9999.99")
  })

  it("separates the digits once the number is past what a reader can hold at once", () => {
    expect(formatThroughput(10000)).toBe("10,000.00")
    expect(formatThroughput(123456.789)).toBe("123,456.79")
  })

  it("applies the same rule below the axis, and to a difference", () => {
    expect(formatThroughput(-12345.678)).toBe("-12,345.68")
    expect(formatThroughputDelta(-12345.678)).toBe("-12,345.68")
    expect(formatThroughput(-1000)).toBe("-1000.00")
  })

  it("decides the threshold on the magnitude the reader sees, not the one it was given", () => {
    // 9999.996 is below the threshold but becomes 10,000.00, so it is grouped like the number
    // it turns into rather than showing digits that contradict each other.
    expect(formatThroughput(9999.996)).toBe("10,000.00")
    expect(formatThroughput(9999.994)).toBe("9999.99")
  })
})

describe("choosing a precision", () => {
  it("shows two decimals unless the call asks for another", () => {
    expect(formatThroughput(67809.3)).toBe("67,809.30")
    expect(formatThroughput(12000)).toBe("12,000.00")
  })

  it("lets a call drop the decimals it does not need", () => {
    expect(formatThroughput(67809.3, 0)).toBe("67,809")
    expect(formatThroughput(67809.3, 1)).toBe("67,809.3")
    expect(formatThroughput(0.5, 1)).toBe("0.5")
  })

  it("keeps the trailing zeros a fixed precision asks for", () => {
    expect(formatThroughput(12345, 2)).toBe("12,345.00")
    expect(formatThroughput(12000, 3)).toBe("12,000.000")
  })
})

describe("a magnitude of nothing", () => {
  it("keeps the precision it was asked for", () => {
    expect(formatThroughput(0)).toBe("0.00")
    expect(formatThroughput(0, 0)).toBe("0")
  })

  it("writes a difference of nothing as nothing, with no sign and no decimals", () => {
    expect(formatThroughputDelta(0)).toBe("0")
    expect(formatThroughputDelta(-0)).toBe("0")
    // Rounds to zero, and must not surface the negative axis as "-0.00" or as a direction.
    expect(formatThroughputDelta(-0.001)).toBe("0")
    expect(formatThroughputDelta(-0.004)).toBe("0")
  })

  it("rounds a difference the same way a magnitude is rounded", () => {
    expect(formatThroughputDelta(1.005)).toBe("+1.01")
    expect(formatThroughputDelta(8.575)).toBe("+8.58")
  })
})

describe("a difference between two magnitudes", () => {
  it("carries the direction in the number itself", () => {
    expect(formatThroughputDelta(1614.19)).toBe("+1614.19")
    expect(formatThroughputDelta(-1614.19)).toBe("-1614.19")
    expect(formatThroughputDelta(12345.67)).toBe("+12,345.67")
  })

  it("keeps a difference on the precision it is asked for", () => {
    expect(formatThroughputDelta(1614.19, 0)).toBe("+1614")
    expect(formatThroughputDelta(-1614.19, 3)).toBe("-1614.190")
  })
})

describe("the direction a difference is coloured by", () => {
  it("never colours a difference in a direction its own text does not state", () => {
    expect(colouredDirection()).toEqual(statedDirection())
  })

  it("never colours a difference in a direction its percentage text does not state either", () => {
    // A percentage is rendered by `formatNumber`, rounded by `toFixed`, while the class it is
    // coloured by is decided from `Intl` rounding. The two round apart on exact halves, so this
    // pins that one path can never claim a direction the other denies.
    const statedByPercentage = differences.map(difference =>
      direction(`${deltaPrefix(difference)}${formatNumber(difference)}`),
    )
    expect(colouredDirection()).toEqual(statedByPercentage)
  })

  it("never prints a signed zero for a percentage", () => {
    const aroundZero = [-0.005, -0.004, -0.001, 0, 0.001, 0.004, 0.005]
    expect(aroundZero.map(difference => `${deltaPrefix(difference)}${formatNumber(difference)}`)).toEqual([
      "-0.01",
      "0",
      "0",
      "0",
      "0",
      "0",
      "+0.01",
    ])
    const signed = differences.map(difference => `${deltaPrefix(difference)}${formatNumber(difference)}`)
    expect(signed).not.toContain("-0")
  })
})

describe("the reader's locale", () => {
  it("separates and rounds the way the active locale does", () => {
    // German shares no separator character with the shipped locales, so it proves the
    // presentation is taken from the active locale rather than from the first one seen.
    activeLocale.current = "de"
    expect(formatThroughput(12345.678)).toBe("12.345,68")
    expect(formatThroughput(1000)).toBe("1000,00")
    expect(formatThroughputDelta(-12345.678)).toBe("-12.345,68")
  })

  it("leaves the grouping rule to the magnitude, which the shipped locales spell the same way", () => {
    const byLocale = Object.fromEntries(
      ["en", "zh-Hant", "ko"].map(locale => {
        activeLocale.current = locale
        return [locale, [formatThroughput(1000), formatThroughput(10000), formatThroughputDelta(1614.19)]]
      }),
    )
    expect(byLocale).toEqual({
      en: ["1000.00", "10,000.00", "+1614.19"],
      "zh-Hant": ["1000.00", "10,000.00", "+1614.19"],
      ko: ["1000.00", "10,000.00", "+1614.19"],
    })
  })
})
