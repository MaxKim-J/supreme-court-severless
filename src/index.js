const functions = require('firebase-functions');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://supreme-court-tweet-bot-63f82.firebaseio.com/'
});

const runtimeOpts = {
  timeoutSeconds: 300,
  memory: '256MB'
}

exports.precedentCrawler = functions.runWith(runtimeOpts).https.onRequest(async(req, res) => {
  const lastPrecedentLength = await admin.database().ref('/precedent/counts').once('value')
  console.log(`**** 마지막으로 크롤링된 판례 수 : ${lastPrecedentLength.val()}개 ****`)

  console.log('1.크롤링 시작')
  console.log('2.초기 페이지 세팅')
  const browser = await puppeteer.launch({headless:false});
  const page = await browser.newPage();
  await page.goto('https://glaw.scourt.go.kr/wsjo/panre/sjo050.do', {waitUntil: 'load'});
  await page.waitFor(2000);
  let finalResult = []

  const supremeCourtBtn = await page.$('#groupList>li.last ul>li:nth-child(1) a');
  await supremeCourtBtn.click()
  await page.evaluate(async() => {
    const pagingSelect = document.querySelector('.select_2.ml_4 option:nth-child(3)')
    pagingSelect.selected = true;
  })

  const applyBtn = await page.$('fieldset.f_left>a');
  await applyBtn.click()
  await page.waitFor(1000);

  let pagingElem = await page.$('p.list_location')
  let pageCounts = await pagingElem.evaluate(elem => elem.innerText.trim().split('/')[1])

  console.log('3.크롤링을 시작합니다')
  let sections = []
  for(let i = 1;i<=parseInt(pageCounts, 10);i++) {

    sections = await page.$$('#areaList>tr')
    pagingElem = await page.$('p.list_location')
    let current = await pagingElem.evaluate(elem => elem.innerText.trim().split('/')[0])

    console.log(`- ${current} 페이지에서 발견한 판례 개수 ${sections.length}개`)

    const resultPromise = sections.map(async(section, id) => {
      try {
        const titleElem = await section.$('td:nth-child(2)>dl>dt>a>strong>strong')
        const title = await titleElem.evaluate(elem => elem.innerText)

        const urlElem = await section.$('td:nth-child(2)>dl>dt>a:nth-child(2)')
        const url = await urlElem.evaluate(elem => elem.id.split('_')[1])

        await section.evaluate(elem => {
          elem.querySelector('td:nth-child(2)>dl>dt>a:nth-child(2)').click()
        })

        await page.waitFor(2000);

        const contentElem = await section.$('td:nth-child(2)>dl>dd:nth-child(2)>dl>dd')
        const content = await contentElem.evaluate(elem =>elem.innerHTML)
        return { id:(current-1)*80+id, title, url, content }
      } catch(e) {
        return null
      }
    })

    // finalResult에 더하기
    const unfilteredResult = await Promise.all(resultPromise)
    const result = unfilteredResult.filter(precedent => precedent)
    console.log(`* ${current} 페이지에서 크롤링 완료된 판례 개수 ${result.length}개`)

    finalResult = [...finalResult, ...result]

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

  const precedentLength = finalResult.length
  const sitePrecedentLength = await supremeCourtBtn.evaluate(elem =>
    elem.querySelector('b').innerText.slice(4,7)
  );
  console.log(`4. 총 ${precedentLength}개의 판례 크롤링을 완료했습니다.`)

  await page.waitFor(3000);
  await page.close();
  await browser.close();
  console.log(`5. 데이터베이스에 현재 사이트에 공개된 대법원 판례 개수(${sitePrecedentLength})를 기록합니다.`)

  await admin
    .database()
    .ref("/precedent")
    .set({ counts: parseInt(sitePrecedentLength, 10) });

  const newlyUpdatePrecedentLength = sitePrecedentLength - lastPrecedentLength
  console.log(`6. 새로운 ${newlyUpdatePrecedentLength}개의 판례를 supreme-court-api를 통해 판례 데이터베이스에 저장합니다.`)

  res.status(200).send(finalResult);
});

exports.tweetBot = functions.https.onRequest((req, res) => {
  console.log('트윗봇')
  res.send("나는 트윗봇이다");
});
