/**
 * Converts a numeric currency amount into Philippine English words representation
 * compliant with BIR Official Receipt regulations.
 */
export function numberToWords(amount: number): string {
  if (isNaN(amount) || amount < 0) {
    return "Zero Pesos Only"
  }

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ]

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ]

  function convertChunk(num: number): string {
    let str = ""
    if (num >= 100) {
      str += ones[Math.floor(num / 100)] + " Hundred"
      num %= 100
      if (num > 0) {
        str += " "
      }
    }
    if (num >= 20) {
      str += tens[Math.floor(num / 10)]
      num %= 10
      if (num > 0) {
        str += "-" + ones[num]
      }
    } else if (num > 0) {
      str += ones[num]
    }
    return str.trim()
  }

  const integerPart = Math.floor(amount)
  const centavos = Math.round((amount - integerPart) * 100)

  if (integerPart === 0 && centavos === 0) {
    return "Zero Pesos Only"
  }

  let words = ""
  let n = integerPart

  if (n >= 1000000000) {
    const billions = Math.floor(n / 1000000000)
    words += convertChunk(billions) + " Billion "
    n %= 1000000000
  }

  if (n >= 1000000) {
    const millions = Math.floor(n / 1000000)
    words += convertChunk(millions) + " Million "
    n %= 1000000
  }

  if (n >= 1000) {
    const thousands = Math.floor(n / 1000)
    words += convertChunk(thousands) + " Thousand "
    n %= 1000
  }

  if (n > 0) {
    words += convertChunk(n) + " "
  }

  words = words.trim()
  if (!words) {
    words = "Zero"
  }

  const pesoUnit = integerPart === 1 ? "Peso" : "Pesos"

  if (centavos > 0) {
    const centavoStr = centavos < 10 ? `0${centavos}` : `${centavos}`
    return `${words} ${pesoUnit} and ${centavoStr}/100 Centavos`
  }

  return `${words} ${pesoUnit} Only`
}
