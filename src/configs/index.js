const defaultRuntimeOpts = {
  timeoutSeconds: 300,
  memory: '256MB'
}

const crawlTarget = 'https://glaw.scourt.go.kr/wsjo/panre/sjo050.do'

module.exports = {
  defaultRuntimeOpts,
  crawlTarget
}
