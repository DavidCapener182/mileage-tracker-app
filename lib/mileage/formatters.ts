export const formatCurrency = (value: number, locale = "en-GB") =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(value)

export const formatMiles = (value: number) => `${value.toFixed(1)} mi`
