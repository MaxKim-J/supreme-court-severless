const supremeCourtApi = require('../services')
const configs = require('../configs')
const lengthFilter = require('../utils/lengthFilter')
const precedentTypeFilter = require('../utils/precedentTypeFilter')

class PrecedentCrawler {
  constructor(browser, page) {
    this.browser = browser
    this.page = page
  }

  async goToCrawlTarget() {
    await this.page.goto(configs.crawlTarget)
    await this.page.waitFor(2000)
  }

  async setTargetPagePrecedentsLength(precedentLength) {
    const targetChildNum = lengthFilter(precedentLength)
    const supremeCourtBtn = await this.page.$('#groupList>li.last ul>li:nth-child(1) a')
    await supremeCourtBtn.click()
    await this.page.evaluate(async(targetChildNum) => {
      const pagingSelect = document.querySelector(`.select_2.ml_4 option:nth-child(${targetChildNum})`)
      pagingSelect.selected = true
    }, targetChildNum)
    const applyBtn = await this.page.$('fieldset.f_left>a')
    await applyBtn.click()
    await this.page.waitFor(3000)
  }

  async getTargetPageCount() {
    let pagingElem = await this.page.$('p.list_location')
    let pageCounts = await pagingElem.evaluate(elem => elem.innerText.trim().split('/')[1])
    return parseInt(pageCounts, 10)
  }

  async getSectionsByTargetPage() {
    const sections = await this.page.$$('#areaList>tr')
    const pagingElem = await this.page.$('p.list_location')
    const currentPage = await pagingElem.evaluate(elem => elem.innerText.trim().split('/')[0])
    return {sections, currentPage}
  }

  async scrapPrecedentSection(section) {
    try {
      const titleElem = await section.$('td:nth-child(2)>dl>dt>a>strong>strong')
      const name = await titleElem.evaluate(elem => elem.innerText)

      const precedentType = name.split(' ')[5].slice(4,5)
      const type = precedentTypeFilter(precedentType)

      const urlElem = await section.$('td:nth-child(2)>dl>dt>a:nth-child(2)')
      const url = await urlElem.evaluate(elem => elem.id.split('_')[1])

      await section.evaluate(elem => {
        elem.querySelector('td:nth-child(2)>dl>dt>a:nth-child(2)').click()
      })

      await this.page.waitFor(5000)

      const contentElem = await section.$('td:nth-child(2)>dl>dd:nth-child(2)>dl>dd')
      const content = await contentElem.evaluate(elem =>elem.innerHTML)
      return { name, type, url, content }
    } catch(e) {
      return null
    }
  }

  async resolvePrecedentPromises(promises) {
    const unfilteredResult = await Promise.all(promises)
    return unfilteredResult.filter(precedent => precedent)
  }

  async requestPostPrecedents(precedents) {
      const { data : {counts:{
        newTweetsLength, newPrecedentsLength
      }}} = await supremeCourtApi.post('/precedent', {
        isTweetUpdate:true,
        precedents
      })
      return {newTweetsLength, newPrecedentsLength}
  }

  async movedToNextTargetPage() {
    const pagingElem = await this.page.$('p.list_location')
    try {
      await pagingElem.evaluate(elem=> {
        const nextPageBtn = elem.querySelector('a:nth-child(3)')
        nextPageBtn.click()
      })
      await this.page.waitFor(2000)
      return true
    } catch(e) {
      return false
    }
  }

  async getTargetPagePrecedentLength() {
    const supremeCourtBtn = await this.page.$('#groupList>li.last ul>li:nth-child(1) a')
    const precedentLength =  await supremeCourtBtn.evaluate(elem =>
      elem.querySelector('b').innerText.slice(4,7)
    )
    return parseInt(precedentLength, 10)
  }

  async shutCrawlerDown() {
    await this.page.waitFor(2000)
    await this.page.close()
    await this.browser.close()
  }
}

module.exports = PrecedentCrawler
