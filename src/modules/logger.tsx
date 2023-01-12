class Logger {
  private enabled: boolean
  constructor(enabled: boolean) {
    this.enabled = enabled
  }

  log(message?: any, ...optionalParams: any[]) {
    if (this.enabled) console.log(message, ...optionalParams)
  }
  info(message?: any, ...optionalParams: any[]) {
    if (this.enabled) console.info(message, ...optionalParams)
  }
  warn(message?: any, ...optionalParams: any[]) {
    if (this.enabled) console.warn(message, ...optionalParams)
  }
  error(message?: any, ...optionalParams: any[]) {
    if (this.enabled) console.error(message, ...optionalParams)
  }
  debug(message?: any, ...optionalParams: any[]) {
    if (this.enabled) console.debug(message, ...optionalParams)
  }
}

export default Logger
