const functions = require('firebase-functions');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const precedentTypeFilter = require('./utils/precedentTypeFilter')
const supremeCourtApi = require('./services')

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://supreme-court-tweet-bot-63f82.firebaseio.com/'
});

const runtimeOpts = {
  timeoutSeconds: 300,
  memory: '256MB'
}

exports.initialCrawler = functions.runWith(runtimeOpts).https.onRequest(async(req, res) => {
  try {
    const lastPrecedentLength = await admin.database().ref('/precedent/counts').once('value')
    console.log(`**** 마지막으로 크롤링했을 때 사이트 판례 수 : ${lastPrecedentLength.val()}개 ****`)

    console.log('1.크롤링 시작')
    console.log('2.초기 페이지 세팅')
    // 접속
    const browser = await puppeteer.launch({headless:false});
    const page = await browser.newPage();
    await page.goto('https://glaw.scourt.go.kr/wsjo/panre/sjo050.do', {waitUntil: 'load'});
    await page.waitFor(2000);

    let finalResult = []
    let newTweets = 0
    let newPrecedent = 0

    // 80개로 맞추기
    const supremeCourtBtn = await page.$('#groupList>li.last ul>li:nth-child(1) a');
    await supremeCourtBtn.click()
    await page.evaluate(async() => {
      const pagingSelect = document.querySelector('.select_2.ml_4 option:nth-child(3)')
      pagingSelect.selected = true;
    })
    const applyBtn = await page.$('fieldset.f_left>a');
    await applyBtn.click()
    await page.waitFor(1000);

    // 페이지 카운트 파악하기
    let pagingElem = await page.$('p.list_location')
    let pageCounts = await pagingElem.evaluate(elem => elem.innerText.trim().split('/')[1])

    console.log('3.크롤링을 시작합니다')
    let sections = []
    // 페이지별로 순회하면서 크롤링
    for(let i = 1;i<=parseInt(pageCounts, 10);i++) {

      sections = await page.$$('#areaList>tr')
      pagingElem = await page.$('p.list_location')
      let currentPage = await pagingElem.evaluate(elem => elem.innerText.trim().split('/')[0])

      console.log(`- ${currentPage} 페이지에서 발견한 판례 개수 ${sections.length}개`)

      const resultPromise = sections.map(async(section, id) => {
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

          await page.waitFor(2000);

          const contentElem = await section.$('td:nth-child(2)>dl>dd:nth-child(2)>dl>dd')
          const content = await contentElem.evaluate(elem =>elem.innerHTML)
          return { name, type, url, content }
        } catch(e) {
          return null
        }
      })

      // finalResult에 더하기
      const unfilteredResult = await Promise.all(resultPromise)
      const result = unfilteredResult.filter(precedent => precedent)
      console.log(`* ${currentPage} 페이지에서 크롤링 완료된 판례 개수 ${result.length}개`)
      finalResult = [...finalResult, result]

      // DB 업데이트
      try {
        const res = await supremeCourtApi.post('', {
          isTweetUpdate:true,
          precedents:result
        })
        const { counts } = res.data
        newTweets += counts.newTweetsLength
        newPrecedent += counts.newPrecedentsLength
        console.log(`** 데이터베이스에 ${counts.newPrecedentsLength}개의 판례, ${counts.newTweetsLength}개의 트윗이 업데이트되었습니다.(총합: 트윗 ${newTweets}개, 판례 ${newPrecedent})`)
      } catch(e) {
        console.log(e.message)
      }

      // 다음페이지 클릭
      try {
        await pagingElem.evaluate(elem=> {
          const nextPageBtn = elem.querySelector('a:nth-child(3)')
          nextPageBtn.click()
        })
      } catch(e) {
        break
      }
      await page.waitFor(2000);
    }

    const precedentPageLength = finalResult.length
    const sitePrecedentLength = await supremeCourtBtn.evaluate(elem =>
      elem.querySelector('b').innerText.slice(4,7)
    );
    console.log(`4. 총 ${precedentPageLength}페이지의 판례 크롤링을 완료했습니다.`)

    await page.waitFor(2000);
    await page.close();
    await browser.close();
    console.log(`5. firbase 데이터베이스에 현재 사이트에 공개된 대법원 판례 개수(${sitePrecedentLength})를 기록합니다.`)
    await admin
      .database()
      .ref("/precedent")
      .set({ counts: parseInt(sitePrecedentLength, 10) });
    console.log(`6. 크롤러를 종료하고 200 응답을 보냅니다.`)
    res.status(200).send({
      sitePrecedentLength,
      precedentPageLength,
      dbUpdated : {newTweets, newPrecedent}
    });
  } catch(err) {
    console.log(`***에러가 발생했습니다. 크롤러를 종료하고 500 응답을 보냅니다.***`)
    res.status(500).send(
      {
        message : err.message,
        error:err,
      }
    )
  }
});

exports.watchCrawler = functions.runWith(runtimeOpts).https.onRequest(async(req,res) => {

  try {
    const lastPrecedent = await admin.database().ref('/precedent/counts').once('value')
    const lastPrecedentLength = parseInt(lastPrecedent.val(), 10)
    console.log(`**** 마지막으로 크롤링된 판례 수 : ${lastPrecedentLength}개 ****`)

    const browser = await puppeteer.launch({headless:false});
    const page = await browser.newPage();
    await page.goto('https://glaw.scourt.go.kr/wsjo/panre/sjo050.do', {waitUntil: 'load'});
    await page.waitFor(2000);

    const supremeCourtBtn = await page.$('#groupList>li.last ul>li:nth-child(1) a');
    await supremeCourtBtn.click()
    const sitePrecedent = await supremeCourtBtn.evaluate(elem =>
      elem.querySelector('b').innerText.slice(4,7)
    );
    const sitePrecedentLength = parseInt(sitePrecedent, 10)
    console.log(`**** 현재 사이트 대법원 판례 수 : ${sitePrecedentLength}개 ****`)

    const newlyCrawlPrecedents = sitePrecedentLength - lastPrecedentLength
    if(newlyCrawlPrecedents > 0) {
      console.log(`- 첫 페이지에서 ${newlyCrawlPrecedents}개의 판례를 크롤링합니다.`)
      await page.evaluate(async() => {
        const pagingSelect = document.querySelector('.select_2.ml_4 option:nth-child(3)')
        pagingSelect.selected = true;
      })
      const applyBtn = await page.$('fieldset.f_left>a');
      await applyBtn.click()
      await page.waitFor(1000);

      let sections = await page.$$('#areaList>tr')
      sections = sections.slice(0, newlyCrawlPrecedents)

      const resultPromise = sections.map(async(section, id) => {
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

          await page.waitFor(2000);

          const contentElem = await section.$('td:nth-child(2)>dl>dd:nth-child(2)>dl>dd')
          const content = await contentElem.evaluate(elem =>elem.innerHTML)
          return { name, type, url, content }
        } catch(e) {
          return null
        }
      })

      const unfilteredResult = await Promise.all(resultPromise)
      const result = unfilteredResult.filter(precedent => precedent)
      console.log(`* 크롤링 완료된 판례 개수 ${result.length}개`)

      // DB 업데이트
      try {
        const { data } = await supremeCourtApi.post('', {
          isTweetUpdate:true,
          precedents:result
        })
        const { counts, result:dbUpdateResult } = data
        console.log(`** 데이터베이스에 ${counts.newPrecedentsLength}개의 판례, ${counts.newTweetsLength}개의 트윗이 업데이트되었습니다.`)
        console.log(`firebase 데이터베이스에 현재 사이트에 공개된 대법원 판례 개수(${sitePrecedentLength})를 기록합니다.`)
        await admin
          .database()
          .ref("/precedent")
          .set({ counts: sitePrecedentLength });
        res.status(200).send({
          newlyCrawlPrecedents,
          result:dbUpdateResult,
          dbUpdated : {
            newTweets: counts.newPrecedentsLength,
            newPrecedent: counts.newTweetsLength,
          }
        });
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
  res.send("나는 트윗봇이다");
});
