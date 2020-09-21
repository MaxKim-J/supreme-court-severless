const functions = require('firebase-functions')
const puppeteer = require('puppeteer')
const admin = require('firebase-admin')
const { defaultRuntimeOpts } = require('./configs')
const PrecedentCrawler = require('./modules/precedentCrawler')
const TweetBot = require('./modules/tweetBot')
const Firebase = require('./modules/firebase')

const firebase = new Firebase(admin)
firebase.initializeApp()

exports.initialCrawler = functions.runWith(defaultRuntimeOpts).https.onRequest(async(req, res) => {
  try {
    const lastPrecedentLength = await firebase.getCountsFromDB()
    console.log(`**** 마지막으로 크롤링했을 때 사이트 판례 수 : ${lastPrecedentLength}개 ****`)

    const browser = await puppeteer.launch({headless:true})
    const page = await browser.newPage()
    const crawler = new PrecedentCrawler(browser, page)

    let finalResult = []
    let newTweets = 0
    let newPrecedent = 0

    await crawler.goToCrawlTarget()
    await crawler.setTargetPagePrecedentsLength(80)
    const pageCounts = await crawler.getTargetPageCount()

    console.log('크롤링을 시작합니다')
    for(let i = 1; i <= pageCounts; i++) {
      /* eslint-disable no-await-in-loop */
      let { sections, currentPage } = await crawler.getSectionsByTargetPage()

      console.log(`- ${currentPage} 페이지에서 발견한 판례 개수 ${sections.length}개`)
      const resultPromise = sections.map(section => crawler.scrapPrecedentSection(section))

      const result = await crawler.resolvePrecedentPromises(resultPromise)
      finalResult = [...finalResult, result]
      console.log(`* ${currentPage} 페이지에서 크롤링 완료된 판례 개수 ${result.length}개`)

      try {
        const {newTweetsLength, newPrecedentsLength} = await crawler.requestPostPrecedents(result)
        newTweets += newTweetsLength
        newPrecedent += newPrecedentsLength
        console.log(`** 데이터베이스에 ${newPrecedentsLength}개의 판례, ${newTweetsLength}개의 트윗이 업데이트되었습니다.(총합: 트윗 ${newTweets}개, 판례 ${newPrecedent})`
        )
      } catch(e) {
        console.log(e.message)
      }

      const isNextPageExist = await crawler.movedToNextTargetPage()
      if(!isNextPageExist) { break }
    }

    const precedentPageLength = finalResult.length
    const sitePrecedentLength = await crawler.getTargetPagePrecedentLength()
    console.log(`4. 총 ${precedentPageLength}페이지의 판례 크롤링을 완료했습니다.`)

    await crawler.shutCrawlerDown()
    console.log(`5. firebase 데이터베이스에 현재 사이트에 공개된 대법원 판례 개수(${sitePrecedentLength})를 기록합니다.`)
    await firebase.updateCountsToDB(sitePrecedentLength)

    console.log(`6. 크롤러를 종료하고 200 응답을 보냅니다.`)
    res.status(200).send({
      sitePrecedentLength,
      precedentPageLength,
      dbUpdated : {newTweets, newPrecedent}
    })
  } catch(err) {
    console.log(`***에러가 발생했습니다. 크롤러를 종료하고 500 응답을 보냅니다.***`)
    console.log(err)
    res.status(500).send(
      {
        message : err.message,
        error:err,
      }
    )
  }
})

exports.watchCrawler = functions.runWith(defaultRuntimeOpts).https.onRequest(async(req,res) => {

  try {
    const lastPrecedentLength = await firebase.getCountsFromDB()
    console.log(`**** 마지막으로 크롤링된 판례 수 : ${lastPrecedentLength}개 ****`)

    const browser = await puppeteer.launch({headless:true})
    const page = await browser.newPage()
    const crawler = new PrecedentCrawler(browser, page)

    await crawler.goToCrawlTarget()
    await crawler.setTargetPagePrecedentsLength(80)

    const sitePrecedentLength = await crawler.getTargetPagePrecedentLength()

    console.log(`**** 현재 사이트 대법원 판례 수 : ${sitePrecedentLength}개 ****`)

    const newlyCrawlPrecedents = sitePrecedentLength - lastPrecedentLength
    if(newlyCrawlPrecedents > 0) {
      console.log(`- 첫 페이지에서 ${newlyCrawlPrecedents}개의 판례를 크롤링합니다.`)

      let { sections } = await crawler.getSectionsByTargetPage()
      sections = sections.slice(0, newlyCrawlPrecedents)
      const resultPromise = sections.map(section => crawler.scrapPrecedentSection(section))
      const result = await crawler.resolvePrecedentPromises(resultPromise)

      console.log(`* 크롤링 완료된 판례 개수 ${result.length}개`)

      const sitePrecedentLength = await crawler.getTargetPagePrecedentLength()
      await crawler.shutCrawlerDown()

      console.log(`firebase 데이터베이스에 현재 사이트에 공개된 대법원 판례 개수(${sitePrecedentLength})를 기록합니다.`)
      await firebase.updateCountsToDB(sitePrecedentLength)

      try {
        const {
          newPrecedentsLength,
          newTweetsLength,
        } = await crawler.requestPostPrecedents(result)

        console.log(`** 데이터베이스에 ${newPrecedentsLength}개의 판례, ${newTweetsLength}개의 트윗이 업데이트되었습니다.`)
        res.status(200).send({
          newlyCrawlPrecedents,
          dbUpdated : {
            newPrecedent: newPrecedentsLength,
            newTweets: newTweetsLength,
          }
        })
      } catch(e) {
        console.log(e.message)
      }
    } else {
      console.log(`***세롭게 크롤링할 판례가 없습니다. 크롤러를 종료하고 200 응답을 보냅니다.***`)
      res.status(200).send({
        newlyCrawlPrecedents,
        message : '새롭게 크롤링할 판례가 없습니다!'
      })
    }
  } catch(err) {
    console.log(`***에러가 발생했습니다. 크롤러를 종료하고 500 응답을 보냅니다.***`)
    res.status(500).send(
      {
        message : err.message,
        error:err,
      }
    )
  }
})

exports.tweetBot = functions.https.onRequest((req, res) => {
  console.log('트윗봇')
  const bot = new TweetBot()
  //todo current 요청
  bot.getCurrentTweet()
  //todo 트윗 작성
  bot.postTweet()
  //todo 트윗 업로드
  //todo put 요청
  res.send("나는 트윗봇이다")

})
